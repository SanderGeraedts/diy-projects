// T-0027 (D-0029): a project's slug, for slugs.pb.js. Not a hook itself (no .pb.js), so
// PocketBase loads it only through require(). The same rules as src/db/slug.ts, which the
// app uses; src/db/slug.test.ts checks that both give the same slugs.

const SLUG_MAX = 60
const FALLBACK_SLUG = "project"
// Slugs that clash with a route under /projects/ (src/router.tsx).
const RESERVED_SLUGS = ["new"]
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isSlug(value) {
  return typeof value === "string" && SLUG.test(value)
}

// NFD, marks stripped, lower case, runs of anything but [a-z0-9] one hyphen, trimmed, at most
// 60 characters cut at a hyphen; empty or reserved becomes "project".
function slugify(title) {
  let slug = String(title || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (slug.length > SLUG_MAX) {
    const cut = slug.slice(0, SLUG_MAX + 1)
    const hyphen = cut.lastIndexOf("-")
    slug = hyphen > 0 ? cut.slice(0, hyphen) : slug.slice(0, SLUG_MAX)
    slug = slug.replace(/-+$/, "")
  }
  if (slug === "" || RESERVED_SLUGS.indexOf(slug) >= 0) return FALLBACK_SLUG
  return slug
}

// `slug` if free, else the first free of base-2, base-3, …
function uniqueSlug(slug, taken, base) {
  if (!taken[slug]) return slug
  const b = base || slug
  for (let n = 2; ; n++) {
    if (!taken[b + "-" + n]) return b + "-" + n
  }
}

// Whether `slug` is `base`, or `base` with a clash suffix.
function hasBase(slug, base) {
  if (slug === base) return true
  if (slug.indexOf(base + "-") !== 0) return false
  return /^[1-9][0-9]*$/.test(slug.slice(base.length + 1))
}

// A JSON list of strings as stored or sent; anything else is an empty list.
function slugList(value) {
  let list = value
  if (typeof list === "string") {
    try {
      list = JSON.parse(list || "[]")
    } catch (_) {
      list = []
    }
  }
  if (!Array.isArray(list)) return []
  return list.filter(isSlug)
}

// The slug and earlier slugs a project is saved with (slugs.pb.js):
// - incoming: { title, slug, oldSlugs } as the device sent them (slug may be missing);
// - stored: { slug, oldSlugs } before this save, or null for a create;
// - others: [{ slug, oldSlugs }] of the owner's other projects, purge markers left out.
// The device's slug stays unless another project holds it (as its slug or an earlier one);
// then it gets the first free -2, -3, …. The stored slug, when it changes, joins the earlier
// slugs, so its address still leads here; one held by another project as its slug is dropped.
function settle(incoming, stored, others) {
  const taken = {}
  const current = {}
  for (const o of others) {
    if (isSlug(o.slug)) {
      taken[o.slug] = true
      current[o.slug] = true
    }
    for (const s of slugList(o.oldSlugs)) taken[s] = true
  }
  const base = slugify(incoming.title)
  const wanted = isSlug(incoming.slug) ? incoming.slug : stored && isSlug(stored.slug) ? stored.slug : base
  const slug = uniqueSlug(wanted, taken, hasBase(wanted, base) ? base : wanted)
  const old = slugList(stored ? stored.oldSlugs : []).concat(slugList(incoming.oldSlugs))
  if (stored && isSlug(stored.slug)) old.push(stored.slug)
  const oldSlugs = []
  for (const s of old) {
    if (s !== slug && !current[s] && oldSlugs.indexOf(s) < 0) oldSlugs.push(s)
  }
  return { slug, oldSlugs }
}

// Sets a project record's slug and oldSlugs before it is saved: `record` is the one being
// saved, `stored` the version before (null for a create). For slugs.pb.js.
function settleRecord(app, record, stored) {
  const others = app
    .findRecordsByFilter("projects", "owner = {:owner} && id != {:id} && purgedAt = ''", "", 0, 0, {
      owner: record.getString("owner"),
      id: record.id,
    })
    .map((r) => ({ slug: r.getString("slug"), oldSlugs: slugList(r.getString("oldSlugs")) }))
  const next = settle(
    { title: record.getString("title"), slug: record.getString("slug"), oldSlugs: slugList(record.getString("oldSlugs")) },
    stored ? { slug: stored.getString("slug"), oldSlugs: slugList(stored.getString("oldSlugs")) } : null,
    others,
  )
  record.set("slug", next.slug)
  record.set("oldSlugs", next.oldSlugs)
}

module.exports = { SLUG_MAX, FALLBACK_SLUG, RESERVED_SLUGS, isSlug, slugify, uniqueSlug, hasBase, slugList, settle, settleRecord }
