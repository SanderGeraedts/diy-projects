// Draws the app icons into public/icons. Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [0x2f, 0x5d, 0x50]
const FG = [0xff, 0xff, 0xff]

/** Shape in unit coordinates (0..1): a house with a door. */
function inHouse(x, y) {
  const roof = y >= 0.22 && y <= 0.47 && Math.abs(x - 0.5) <= (y - 0.22) * 1.2
  const walls = y > 0.47 && y <= 0.78 && x >= 0.27 && x <= 0.73
  const door = y > 0.58 && y <= 0.78 && x >= 0.45 && x <= 0.55
  return (roof || walls) && !door
}

function inRoundedSquare(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** maskable: full-bleed background and the shape inside the 80% safe zone. */
function png(size, { maskable }) {
  const ss = 4 // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0
    for (let px = 0; px < size; px++) {
      let bg = 0
      let fg = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size
          const y = (py + (sy + 0.5) / ss) / size
          if (!maskable && !inRoundedSquare(x, y, 0.2)) continue
          const s = maskable ? 0.75 : 1
          const hx = (x - 0.5) / s + 0.5
          const hy = (y - 0.5) / s + 0.5
          if (inHouse(hx, hy)) fg++
          else bg++
        }
      }
      const n = ss * ss
      const a = (bg + fg) / n
      const o = py * (size * 4 + 1) + 1 + px * 4
      for (let i = 0; i < 3; i++) raw[o + i] = a ? Math.round((BG[i] * bg + FG[i] * fg) / (bg + fg)) : 0
      raw[o + 3] = Math.round(a * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="20" fill="#2f5d50"/>
<path fill="#fff" fill-rule="evenodd" d="M50 22 80 47H73V78H27V47H20ZM45 58V78H55V58Z"/>
</svg>
`

const out = new URL('../public/icons/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('icon-192.png', out), png(192, { maskable: false }))
writeFileSync(new URL('icon-512.png', out), png(512, { maskable: false }))
writeFileSync(new URL('icon-maskable-512.png', out), png(512, { maskable: true }))
writeFileSync(new URL('icon.svg', out), svg)
console.log('icons written to public/icons')
