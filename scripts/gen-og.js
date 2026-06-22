// 페이븐 OG 미리보기 이미지 생성기 — 의존성 0(gen-icon.js와 동일 방식: 픽셀 직접 + zlib).
// 1200×630 그린 그라데이션 + 흰 "이븐바(=)" 마크. 텍스트는 안 그림(OG 태그가 제공).
// 사용: node scripts/gen-og.js  → public/og.png
const fs = require('fs')
const zlib = require('zlib')

const W = 1200
const H = 630
const OUT = process.argv[2] || 'public/og.png'

// 세로 그라데이션 (icon.svg와 동일 톤)
const stops = [
  { t: 0, c: [0x14, 0xb4, 0x88] },
  { t: 0.55, c: [0x0f, 0xa1, 0x77] },
  { t: 1, c: [0x0b, 0x7e, 0x5e] },
]
function grad(t) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const a = stops[i - 1], b = stops[i]
      const f = (t - a.t) / (b.t - a.t)
      return [0, 1, 2].map((j) => Math.round(a.c[j] + (b.c[j] - a.c[j]) * f))
    }
  }
  return stops[stops.length - 1].c
}
function inRR(x, y, x0, y0, w, h, r) {
  if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false
  const rx0 = x0 + r, rx1 = x0 + w - r, ry0 = y0 + r, ry1 = y0 + h - r
  if (x >= rx0 && x <= rx1) return true
  if (y >= ry0 && y <= ry1) return true
  const cx = x < rx0 ? rx0 : rx1
  const cy = y < ry0 ? ry0 : ry1
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

// 흰 막대 2개("=") — 가운데 정렬. 너비 460, 높이 100, 라운드 50, 간격 72.
const barW = 460, barH = 100, barR = 50, gap = 72
const cx = W / 2, cy = H / 2
const x0 = cx - barW / 2
const total = barH * 2 + gap
const topY = cy - total / 2
const bars = [
  [x0, topY, barW, barH, barR],
  [x0, topY + barH + gap, barW, barH, barR],
]

const raw = Buffer.alloc(H * (W * 4 + 1))
let p = 0
for (let y = 0; y < H; y++) {
  raw[p++] = 0 // 필터 바이트
  for (let x = 0; x < W; x++) {
    const cg = grad(y / (H - 1))
    let r = cg[0], g = cg[1], b = cg[2]
    const px = x + 0.5, py = y + 0.5
    for (const bar of bars) {
      if (inRR(px, py, bar[0], bar[1], bar[2], bar[3], bar[4])) { r = g = b = 255; break }
    }
    raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = 255
  }
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8; ihdr[9] = 6 // 8-bit, RGBA
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
fs.writeFileSync(OUT, png)
console.log('wrote', OUT, png.length, 'bytes')
