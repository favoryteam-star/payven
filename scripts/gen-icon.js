// 페이븐 앱 아이콘 PNG 생성기 — 의존성 0(브라우저/canvas 없이 픽셀 직접 + zlib).
// 브랜드 마크: 풀그라데이션 그린 둥근 사각 + 흰 이븐바 2개 (icon.svg와 동일 비율).
// 사용: node scripts/gen-icon.js <size> <out.png>
const fs = require('fs')
const zlib = require('zlib')

const S = parseInt(process.argv[2] || '256', 10)
const OUT = process.argv[3] || `public/app-icon-${S}.png`
const k = S / 512 // 512 viewBox 기준 스케일

const R = 116 * k // 배경 모서리 반경
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
// 흰 막대 2개 (512 좌표: x148 y190 w216 h46 rx23 / y276) → 스케일
const bars = [
  [148 * k, 190 * k, 216 * k, 46 * k, 23 * k],
  [148 * k, 276 * k, 216 * k, 46 * k, 23 * k],
]

const raw = Buffer.alloc(S * (S * 4 + 1))
let p = 0
for (let y = 0; y < S; y++) {
  raw[p++] = 0 // 필터 바이트
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0
    const px = x + 0.5, py = y + 0.5
    if (inRR(px, py, 0, 0, S, S, R)) {
      const cg = grad(y / (S - 1))
      r = cg[0]; g = cg[1]; b = cg[2]; a = 255
      for (const bar of bars) {
        if (inRR(px, py, bar[0], bar[1], bar[2], bar[3], bar[4])) { r = g = b = 255; break }
      }
    }
    raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a
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
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8; ihdr[9] = 6 // 8-bit, RGBA
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
fs.writeFileSync(OUT, png)
console.log('wrote', OUT, png.length, 'bytes')
