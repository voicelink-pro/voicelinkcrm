import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"

function crc(buffer) {
  let value = ~0
  for (const byte of buffer) {
    value ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1))
    }
  }
  return ~value >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([name, data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([length, body, sum])
}

function png(size, pad) {
  const navy = [11, 29, 58]
  const gold = [232, 196, 106]
  const raw = []
  const inner = size - pad * 2

  for (let y = 0; y < size; y += 1) {
    raw.push(0)
    for (let x = 0; x < size; x += 1) {
      const ix = x - pad
      const iy = y - pad
      let color = navy
      if (ix >= 0 && iy >= 0 && ix < inner && iy < inner) {
        const nx = ix / inner
        const ny = iy / inner
        const left = Math.abs(nx - 0.28) < 0.045 && ny > 0.22 && ny < 0.78
        const right = Math.abs(nx - 0.72) < 0.045 && ny > 0.22 && ny < 0.78
        const base = Math.abs(ny - 0.74) < 0.04 && nx > 0.28 && nx < 0.72
        if (left || right || base) {
          color = gold
        }
      }
      raw.push(color[0], color[1], color[2])
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

mkdirSync("public/icons", { recursive: true })
writeFileSync("public/icons/icon-192.png", png(192, 0))
writeFileSync("public/icons/icon-512.png", png(512, 0))
writeFileSync("public/icons/icon-maskable-512.png", png(512, 64))
writeFileSync("public/icons/apple-touch-icon.png", png(180, 0))
