/// <reference path="../pb_data/types.d.ts" />
// T-0017: photo files are owner-only, like their records (D-0005). A protected file is served
// only with a file token of a user the record's view rule allows (`/api/files/…?token=`, from
// `/api/files/token`); unprotected, anyone with the URL could fetch it.
// Changes no data. Never edit this file once it has run; add a new one.
const FILES = ["original", "copy", "thumbnail"]

migrate(
  (app) => {
    const photos = app.findCollectionByNameOrId("photos")
    for (const name of FILES) photos.fields.getByName(name).protected = true
    app.save(photos)
  },
  (app) => {
    const photos = app.findCollectionByNameOrId("photos")
    for (const name of FILES) photos.fields.getByName(name).protected = false
    app.save(photos)
  },
)
