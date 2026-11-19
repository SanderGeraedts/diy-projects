/// <reference path="../pb_data/types.d.ts" />
// T-0022 (D-0014): the bin's permanent delete ("Definitief verwijderen"), done on the NAS.
//
// - The owner's DELETE of a project, entry or photo that is in the bin (tombstoned) deletes
//   it for good, with what it holds: a project with every entry and photo of it, an entry
//   with every photo of it. In one transaction, each record is emptied (no text, no tags, no
//   files) and kept as a marker with `purgedAt` set (pb_migrations/1794931600_purge_markers.js);
//   its files (original, copy, thumbnail) are removed from storage and its `history` rows
//   deleted. The answer is 204. A DELETE of a live record is refused (400): only what is in
//   the bin can go. A record already purged answers 204 again.
// - A marker refuses every later write from a device: an update or a file upload answers
//   410 Gone and saves nothing, and so does a create that reuses a purged id or puts a new
//   entry or photo under a purged project or entry. The app drops its own copy on a 410 and
//   when a marker arrives through sync (src/sync/engine.ts).
// - Nobody but the owner gets here: the delete and update rules are owner-only, and anyone
//   else's request goes on to PocketBase's rules untouched. A superuser in the admin screen
//   keeps PocketBase's own behaviour.
// The DELETE goes through the paths the Funnel allowlist already has (serve.json); there is
// no custom endpoint. This file is named so that it loads, and runs, before
// last_write_wins.pb.js. Everything stays inside the handlers (hooks run in their own JS
// context).

onRecordDeleteRequest((e) => {
  const record = e.record
  const owner = record.getString("owner")
  if (!e.auth || e.auth.isSuperuser() || e.auth.id !== owner) {
    e.next()
    return
  }
  if (record.getString("purgedAt") !== "") return e.noContent(204)
  if (record.getString("deletedAt") === "") {
    throw new BadRequestError("Only a deleted record (in the bin) can be deleted for good.")
  }

  const name = record.collection().name
  const now = new Date().toISOString()
  const EMPTY = {
    projects: { title: "", description: "", tags: [], coverPhotoId: "", public: false },
    entries: { note: "" },
    photos: { original: "", copy: "", thumbnail: "", takenAt: "", width: 0, height: 0 },
  }

  try {
    e.app.runInTransaction((txApp) => {
      const targets = [[name, txApp.findRecordById(name, record.id)]]
      const holds = (collection, field) =>
        txApp
          .findRecordsByFilter(collection, `${field} = {:id} && owner = {:owner}`, "", 0, 0, { id: record.id, owner })
          .map((r) => [collection, r])
      if (name === "projects") targets.push(...holds("entries", "projectId"), ...holds("photos", "projectId"))
      if (name === "entries") targets.push(...holds("photos", "entryId"))

      for (const [collection, r] of targets) {
        if (r.getString("purgedAt") !== "") continue
        const empty = EMPTY[collection]
        for (const field of Object.keys(empty)) r.set(field, empty[field])
        if (r.getString("deletedAt") === "") r.set("deletedAt", now)
        r.set("updatedAt", now)
        r.set("purgedAt", now)
        // The emptied record breaks `required` (a project's title): it is a marker, not content.
        txApp.saveNoValidate(r)
      }
      // After the saves: history.pb.js copies the version before each save into `history`.
      for (const [, r] of targets) {
        txApp.db().newQuery("DELETE FROM history WHERE recordId = {:id}").bind({ id: r.id }).execute()
      }
    })
  } catch (err) {
    // Files are removed after the commit. If only that failed, the purge itself stands (the
    // marker is saved): log the leftover files for the admin instead of failing the request.
    let committed = false
    try {
      committed = e.app.findRecordById(name, record.id).getString("purgedAt") !== ""
    } catch (_) {
      committed = false
    }
    if (!committed) throw err
    console.log("bin: purged " + name + "/" + record.id + ", but removing files failed: " + err)
  }
  return e.noContent(204)
}, "projects", "entries", "photos")

onRecordUpdateRequest((e) => {
  const stored = e.record.original()
  if (!e.auth || e.auth.isSuperuser() || e.auth.id !== stored.getString("owner")) {
    e.next()
    return
  }
  if (stored.getString("purgedAt") !== "") {
    return e.json(410, {
      status: 410,
      message: "This record was deleted for good.",
      data: { purgedAt: stored.getString("purgedAt") },
    })
  }
  // Only the DELETE above purges: a device can't set the field itself.
  if (e.record.getString("purgedAt") !== "") throw new BadRequestError("purgedAt is set by the NAS only.")
  e.next()
}, "projects", "entries", "photos")

onRecordCreateRequest((e) => {
  const record = e.record
  const owner = record.getString("owner")
  if (!e.auth || e.auth.isSuperuser() || e.auth.id !== owner) {
    e.next()
    return
  }
  if (record.getString("purgedAt") !== "") throw new BadRequestError("purgedAt is set by the NAS only.")
  const name = record.collection().name
  const purged = (collection, id) => {
    if (!id) return ""
    try {
      const found = e.app.findRecordById(collection, id)
      return found.getString("owner") === owner ? found.getString("purgedAt") : ""
    } catch (_) {
      return ""
    }
  }
  const purgedAt =
    purged(name, record.id) ||
    (name !== "projects" ? purged("projects", record.getString("projectId")) : "") ||
    (name === "photos" ? purged("entries", record.getString("entryId")) : "")
  if (purgedAt) {
    return e.json(410, { status: 410, message: "This record, or what holds it, was deleted for good.", data: { purgedAt } })
  }
  e.next()
}, "projects", "entries", "photos")
