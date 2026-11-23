/// <reference path="../pb_data/types.d.ts" />
// T-0026 (D-0023): who may download which photo file. Runs after PocketBase's own check of
// protected files (pb_migrations/1794931500_public_projects.js), for every photo file.
//
// - The original: only its owner (or a superuser, in the admin screen), with a file token.
//   PocketBase's own check isn't enough on its own: the photos view rule now also lets
//   anyone see a public photo's record, so any signed-in account with a file token would
//   pass it.
// - The copy and the thumbnail are unprotected, because a visitor can't get a file token.
//   They're served to the owner (file token), or to anyone while the photo and its project
//   are public and not tombstoned, the same as the photos view rule. So a private photo's
//   copy can't be loaded by someone who learned its address, and switching a project off
//   stops its photos loading for visitors.
// Everything stays inside the handler (hooks run in their own JS context).
onFileDownloadRequest((e) => {
  const record = e.record
  let auth = null
  try {
    const token = e.requestInfo().query["token"]
    if (token) auth = e.app.findAuthRecordByToken(token, "file")
  } catch (_) {
    auth = null
  }
  if (auth && (auth.isSuperuser() || auth.id === record.getString("owner"))) {
    e.next()
    return
  }

  const field = e.fileField.name
  let visible = false
  if ((field === "copy" || field === "thumbnail") && record.getString("deletedAt") === "") {
    try {
      const project = e.app.findRecordById("projects", record.getString("projectId"))
      visible = project.getBool("public") && project.getString("deletedAt") === ""
    } catch (_) {
      visible = false
    }
  }
  if (!visible) throw new NotFoundError("The requested resource wasn't found.")
  e.next()
}, "photos")
