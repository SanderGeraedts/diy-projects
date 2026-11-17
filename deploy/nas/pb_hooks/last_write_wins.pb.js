/// <reference path="../pb_data/types.d.ts" />
// T-0016, D-0002: last-write-wins by `updatedAt`, decided on the NAS so two devices can't
// race each other. An update that carries an older `updatedAt` than the stored record is not
// saved: the incoming version goes to `history` (so nothing is lost silently) and the
// stored record is returned unchanged, which the device then takes over locally.
// A newer or equal `updatedAt` saves as usual; history.pb.js keeps the previous version.
// An update without `updatedAt` in its body (a photo file upload, T-0017) keeps the stored
// one and so always saves. Everything stays inside the handler (hooks run in their own JS
// context).
onRecordUpdateRequest((e) => {
  const stored = e.record.original()
  const incoming = e.record.getString("updatedAt")
  const current = stored.getString("updatedAt")
  // Only the owner's own updates; anything else goes on to PocketBase's rules, which refuse it.
  const isOwner = e.auth && e.auth.id === stored.getString("owner")
  if (!isOwner || !incoming || !current || !(Date.parse(incoming) < Date.parse(current))) {
    e.next()
    return
  }
  try {
    const history = e.app.findCollectionByNameOrId("history")
    const row = new Record(history)
    row.set("sourceCollection", e.record.collection().name)
    row.set("recordId", e.record.id)
    row.set("owner", stored.get("owner"))
    row.set("data", JSON.parse(JSON.stringify(e.record.publicExport())))
    e.app.save(row)
  } catch (err) {
    // Keeping the losing version must not fail silently: refuse the update, so the device
    // keeps its outbox row and tries again.
    console.log("history copy of an older update failed for " + e.record.id + ": " + err)
    throw new InternalServerError("Could not keep the older version in history.")
  }
  return e.json(200, e.app.findRecordById(e.record.collection().name, e.record.id))
}, "projects", "entries", "photos")
