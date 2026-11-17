/// <reference path="../pb_data/types.d.ts" />
// D-0002: before a projects or entries record is updated, keep its previous version in
// `history`. A history copy must never block the save. Everything stays inside the handler
// (hooks run in their own JS context), and e.next() is always called.
onRecordUpdate((e) => {
  try {
    const previous = e.record.original()
    const history = e.app.findCollectionByNameOrId("history")
    const row = new Record(history)
    row.set("sourceCollection", e.record.collection().name)
    row.set("recordId", e.record.id)
    row.set("owner", previous.get("owner"))
    row.set("data", JSON.parse(JSON.stringify(previous.publicExport())))
    e.app.save(row)
  } catch (err) {
    console.log("history copy failed for " + e.record.id + ": " + err)
  }
  e.next()
}, "projects", "entries")
