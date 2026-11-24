/// <reference path="../pb_data/types.d.ts" />
// T-0040 (D-0041): visitors' card image. PocketBase makes one thumb of a photo's thumbnail,
// 640×480 (a centre crop to 4:3, the cards' and tiles' crop), served as
// `<thumbnail address>?thumb=640x480`. The thumbnail field allows only this size, so no other
// thumb can be asked for (an unlisted size answers with the file itself).
//
// - Only `thumbs` on photos.thumbnail changes: no thumbs on the copy or the original, no rule
//   or other field change. pb_hooks/photo_files.pb.js already decides who may load a thumb, as
//   it decides by the field.
// - The value equals CARD_WIDTH × CARD_HEIGHT in src/photos/resize.ts
//   (src/photos/resize.test.ts checks it).
// Additive only (D-0018). Never edit this file once it has run; add a new one.
migrate(
  (app) => {
    const photos = app.findCollectionByNameOrId("photos")
    photos.fields.getByName("thumbnail").thumbs = ["640x480"]
    app.save(photos)
  },
  (app) => {
    const photos = app.findCollectionByNameOrId("photos")
    photos.fields.getByName("thumbnail").thumbs = []
    app.save(photos)
  },
)
