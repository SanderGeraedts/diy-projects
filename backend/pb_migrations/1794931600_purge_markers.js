/// <reference path="../pb_data/types.d.ts" />
// T-0022 (D-0014): the bin's permanent delete. Each of projects, entries and photos gets a text
// field `purgedAt`: empty while the record lives or sits in the bin, and the purge time once
// pb_hooks/bin.pb.js has deleted it for good. A purged record stays behind as a small marker
// (no content, no files, no history), so a late update, upload or re-create of it from another
// device is refused, and other devices learn through sync to drop their copies.
// Additive only (D-0018, D-0023): no rule or existing field changes, no data changes.
// Never edit this file once it has run; add a new one.
const SYNCED = ["projects", "entries", "photos"]

migrate(
  (app) => {
    for (const name of SYNCED) {
      const collection = app.findCollectionByNameOrId(name)
      collection.fields.add(new TextField({ name: "purgedAt", max: 64 }))
      app.save(collection)
    }
  },
  (app) => {
    for (const name of SYNCED) {
      const collection = app.findCollectionByNameOrId(name)
      collection.fields.removeByName("purgedAt")
      app.save(collection)
    }
  },
)
