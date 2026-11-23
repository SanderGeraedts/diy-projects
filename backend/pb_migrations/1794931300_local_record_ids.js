/// <reference path="../pb_data/types.d.ts" />
// T-0016: each device makes its records' ids itself, offline, with crypto.randomUUID()
// (src/db/write.ts), and the sync engine stores a record on the NAS under that same id, so
// links between records (projectId, entryId, coverPhotoId) mean the same everywhere.
// PocketBase's default id is 15 characters of [a-z0-9]; widen it to also take a UUID
// (36 characters with dashes). PocketBase's own 15-character ids stay valid.
// Never edit this file once it has run; add a new one.
const SYNCED = ["projects", "entries", "photos"]

migrate(
  (app) => {
    for (const name of SYNCED) {
      const collection = app.findCollectionByNameOrId(name)
      const id = collection.fields.getByName("id")
      id.pattern = "^[a-z0-9-]+$"
      id.min = 15
      id.max = 36
      app.save(collection)
    }
  },
  (app) => {
    // Only possible while no record has a longer id.
    for (const name of SYNCED) {
      const collection = app.findCollectionByNameOrId(name)
      const id = collection.fields.getByName("id")
      id.pattern = "^[a-z0-9]+$"
      id.min = 15
      id.max = 15
      app.save(collection)
    }
  },
)
