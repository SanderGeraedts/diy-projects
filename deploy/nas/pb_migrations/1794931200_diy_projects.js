/// <reference path="../pb_data/types.d.ts" />
// T-0013: the diy-projects schema (D-0002, D-0003, D-0005, D-0013, D-0015), matching the
// v2 records in src/db/db.ts. Never edit this file once it has run; add a new one.
migrate(
  (app) => {
    const OWNER = "owner = @request.auth.id"
    const ownerRules = {
      listRule: OWNER,
      viewRule: OWNER,
      deleteRule: OWNER,
      createRule: '@request.auth.id != "" && owner = @request.auth.id',
      updateRule:
        "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
    }

    // users: sign-up closed (D-0005), 90-day sign-in (D-0013).
    const users = app.findCollectionByNameOrId("users")
    users.createRule = null
    users.authToken.duration = 90 * 24 * 60 * 60
    app.save(users)

    // Rate limits: the sign-in path is on the internet.
    const settings = app.settings()
    settings.rateLimits.enabled = true
    app.save(settings)

    const owner = {
      name: "owner",
      type: "relation",
      required: true,
      collectionId: users.id,
      maxSelect: 1,
      cascadeDelete: false,
    }
    const common = [
      { name: "createdAt", type: "text", required: true, max: 64 },
      { name: "updatedAt", type: "text", required: true, max: 64 },
      { name: "deletedAt", type: "text", max: 64 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ]

    const projects = new Collection({
      type: "base",
      name: "projects",
      ...ownerRules,
      fields: [
        owner,
        { name: "title", type: "text", required: true, max: 500 },
        { name: "description", type: "text", max: 20000 },
        // D-0004's statuses, the same as PROJECT_STATUSES in src/db/db.ts.
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["idea", "in progress", "paused", "done"],
        },
        { name: "tags", type: "json", maxSize: 20000 },
        { name: "coverPhotoId", type: "text", max: 64 },
        ...common,
      ],
    })
    app.save(projects)

    const entries = new Collection({
      type: "base",
      name: "entries",
      ...ownerRules,
      fields: [
        owner,
        { name: "projectId", type: "text", required: true, max: 64 },
        { name: "date", type: "text", required: true, max: 64 },
        { name: "note", type: "text", max: 20000 },
        ...common,
      ],
    })
    app.save(entries)

    // D-0015: three files per photo; PocketBase's own thumbnails are not used.
    const MB = 1024 * 1024
    const photos = new Collection({
      type: "base",
      name: "photos",
      ...ownerRules,
      fields: [
        owner,
        { name: "projectId", type: "text", required: true, max: 64 },
        { name: "entryId", type: "text", max: 64 },
        { name: "takenAt", type: "text", max: 64 },
        { name: "width", type: "number", onlyInt: true },
        { name: "height", type: "number", onlyInt: true },
        { name: "original", type: "file", maxSelect: 1, maxSize: 40 * MB },
        { name: "copy", type: "file", maxSelect: 1, maxSize: 10 * MB },
        { name: "thumbnail", type: "file", maxSelect: 1, maxSize: 2 * MB },
        ...common,
      ],
    })
    app.save(photos)

    // D-0002: overwritten versions. Admin only: all rules null.
    const history = new Collection({
      type: "base",
      name: "history",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "sourceCollection", type: "text", required: true, max: 64 },
        { name: "recordId", type: "text", required: true, max: 64 },
        { name: "owner", type: "text", max: 64 },
        { name: "data", type: "json", maxSize: 200000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
    })
    app.save(history)
  },
  (app) => {
    for (const name of ["history", "photos", "entries", "projects"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {
        // already gone
      }
    }
    const users = app.findCollectionByNameOrId("users")
    users.authToken.duration = 604800
    app.save(users)
  },
)
