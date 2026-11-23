/// <reference path="../pb_data/types.d.ts" />
// T-0027 (D-0029): the NAS settles project slugs. A device picks a slug offline from the
// project's title, unique among the projects it knows (src/db/slug.ts); two devices that were
// offline can pick the same one. On every create and update of a project, this hook makes the
// slug unique among the owner's other projects, tombstoned ones included and purge markers
// left out, counting their earlier slugs (`oldSlugs`) as taken: the second `kast` becomes
// `kast-2`. The saved record goes back in the answer, and devices take its slug and oldSlugs
// over (src/sync/engine.ts), also when `updatedAt` is unchanged. A rename's previous slug
// joins `oldSlugs` here too, so its address keeps leading to the project.
//
// Named to load after bin.pb.js and last_write_wins.pb.js: a write those refuse or answer
// themselves (410 Gone, an older update kept in history) never gets here. A unique index on
// (owner, slug) (pb_migrations/1794931700_project_slugs.js) stops two saves at the same moment
// from both taking a slug; the device then retries. Everything stays inside the handlers
// (hooks run in their own JS context); the rules are in slug.js.

onRecordCreateRequest((e) => {
  if (e.auth) require(`${__hooks}/slug.js`).settleRecord(e.app, e.record, null)
  e.next()
}, "projects")

onRecordUpdateRequest((e) => {
  // A purge marker keeps no slug (bin.pb.js answers updates to it before this runs).
  const stored = e.record.original()
  if (e.auth && stored.getString("purgedAt") === "") require(`${__hooks}/slug.js`).settleRecord(e.app, e.record, stored)
  e.next()
}, "projects")
