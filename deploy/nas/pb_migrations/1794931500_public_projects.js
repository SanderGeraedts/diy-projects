/// <reference path="../pb_data/types.d.ts" />
// T-0026 (D-0023, D-0025): public projects are readable without signing in.
//
// - projects gets a bool `public`, set to true on every existing record (D-0025: on by
//   default, also for the projects that exist when it ships). Plain SQL, so neither the
//   history hook nor `updated` fires: devices set it to true locally in their own upgrade.
// - list/view rules: the owner, as before, or anyone for a public project that isn't
//   tombstoned, and for the entries and photos of such a project that aren't tombstoned
//   themselves. `projectId` is a text field, so the project is joined with @collection;
//   `?=` keeps all three conditions on the same project row.
// - photo files: the copy and the thumbnail are no longer protected (a visitor has no file
//   token), the original stays protected. pb_hooks/photo_files.pb.js still serves each file
//   only to whoever may see it: originals to the owner only, copies and thumbnails to the
//   owner or, for a public photo, anyone.
// - create, update and delete stay owner-only; history stays admin-only.
// Additive only (D-0018). Never edit this file once it has run; add a new one.
const OWNER = "owner = @request.auth.id"
const PUBLIC_PROJECT =
  '@collection.projects.id ?= projectId && @collection.projects.public ?= true && @collection.projects.deletedAt ?= ""'
const READ = {
  projects: `${OWNER} || (public = true && deletedAt = "")`,
  entries: `${OWNER} || (deletedAt = "" && ${PUBLIC_PROJECT})`,
  photos: `${OWNER} || (deletedAt = "" && ${PUBLIC_PROJECT})`,
}

migrate(
  (app) => {
    const projects = app.findCollectionByNameOrId("projects")
    projects.fields.add(new BoolField({ name: "public" }))
    app.save(projects)
    app.db().newQuery("UPDATE projects SET public = 1").execute()

    for (const name of Object.keys(READ)) {
      const collection = app.findCollectionByNameOrId(name)
      collection.listRule = READ[name]
      collection.viewRule = READ[name]
      app.save(collection)
    }

    const photos = app.findCollectionByNameOrId("photos")
    photos.fields.getByName("original").protected = true
    photos.fields.getByName("copy").protected = false
    photos.fields.getByName("thumbnail").protected = false
    app.save(photos)
  },
  (app) => {
    for (const name of Object.keys(READ)) {
      const collection = app.findCollectionByNameOrId(name)
      collection.listRule = OWNER
      collection.viewRule = OWNER
      app.save(collection)
    }
    const photos = app.findCollectionByNameOrId("photos")
    for (const name of ["original", "copy", "thumbnail"]) photos.fields.getByName(name).protected = true
    app.save(photos)
    const projects = app.findCollectionByNameOrId("projects")
    projects.fields.removeByName("public")
    app.save(projects)
  },
)
