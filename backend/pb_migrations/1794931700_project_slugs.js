/// <reference path="../pb_data/types.d.ts" />
// T-0027 (D-0029): projects are addressed by a slug made from their title, never their id.
//
// - projects gets a text field `slug` and a JSON list `oldSlugs` (the slugs it had before a
//   rename, which still lead to it).
// - Every existing project gets its slug here, per owner by creation (`createdAt`, then id),
//   the order the app's own upgrade uses (src/db/slug.ts, backfillSlugs): the first `kast` is
//   `kast`, the next `kast-2`. Tombstoned projects get one too (a restore brings back its
//   address); purge markers don't, so their slugs are free. Plain SQL, so the history hook
//   doesn't fire, but `updated` moves, so every device pulls the slugs and takes them over.
// - A unique index on (owner, slug) for non-empty slugs, so two saves at the same moment
//   can't both take one; pb_hooks/slugs.pb.js settles clashes before that.
// Additive only (D-0018): no rule changes, no other field changes. Never edit this file once
// it has run; add a new one.
//
// slugify is a frozen copy of pb_hooks/slug.js as it was when this ran; src/db/slug.test.ts
// checks they agree.
const INDEX = "idx_projects_owner_slug"

migrate(
  (app) => {
    // --- slugify (frozen) ---
    function slugify(title) {
      let slug = String(title || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
      if (slug.length > 60) {
        const cut = slug.slice(0, 61)
        const hyphen = cut.lastIndexOf("-")
        slug = hyphen > 0 ? cut.slice(0, hyphen) : slug.slice(0, 60)
        slug = slug.replace(/-+$/, "")
      }
      if (slug === "" || slug === "new") return "project"
      return slug
    }
    // --- end slugify ---

    const projects = app.findCollectionByNameOrId("projects")
    projects.fields.add(new TextField({ name: "slug", max: 100, pattern: "^$|^[a-z0-9]+(-[a-z0-9]+)*$" }))
    projects.fields.add(new JSONField({ name: "oldSlugs", maxSize: 20000 }))
    app.save(projects)

    const rows = arrayOf(
      new DynamicModel({ id: "", owner: "", title: "", createdAt: "", purgedAt: "" }),
    )
    app.db().newQuery("SELECT id, owner, title, createdAt, purgedAt FROM projects").all(rows)
    const live = rows.filter((r) => r.purgedAt === "")
    live.sort((a, b) =>
      a.owner < b.owner ? -1 : a.owner > b.owner ? 1 :
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 :
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    const updated = new Date().toISOString().replace("T", " ")
    const taken = {}
    for (const r of live) {
      const base = slugify(r.title)
      let slug = base
      for (let n = 2; taken[r.owner + "/" + slug]; n++) slug = base + "-" + n
      taken[r.owner + "/" + slug] = true
      app
        .db()
        .newQuery("UPDATE projects SET slug = {:slug}, oldSlugs = '[]', updated = {:updated} WHERE id = {:id}")
        .bind({ slug, updated, id: r.id })
        .execute()
    }
    app.db().newQuery("UPDATE projects SET slug = '', oldSlugs = '[]' WHERE purgedAt != ''").execute()

    const withIndex = app.findCollectionByNameOrId("projects")
    withIndex.indexes = withIndex.indexes.concat([
      "CREATE UNIQUE INDEX `" + INDEX + "` ON `projects` (`owner`, `slug`) WHERE `slug` != ''",
    ])
    app.save(withIndex)
  },
  (app) => {
    const projects = app.findCollectionByNameOrId("projects")
    projects.indexes = projects.indexes.filter((sql) => sql.indexOf(INDEX) < 0)
    app.save(projects)
    const again = app.findCollectionByNameOrId("projects")
    again.fields.removeByName("oldSlugs")
    again.fields.removeByName("slug")
    app.save(again)
  },
)
