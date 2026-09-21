/*
 * PWA アイコンの生成。
 *
 * 画像編集ツールに依存せず、リポジトリ内で再生成できるようにするための小さなスクリプト。
 * 追加依存は無し（node:zlib のみ）。デザインは暫定であり、
 * 正式なアートワークが用意できたら差し替える。
 *
 * 使い方: node scripts/generate-icons.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUTPUT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons')
const TARGETS = [
  { fileName: 'icon-192.png', size: 192 },
  { fileName: 'icon-512.png', size: 512 },
  { fileName: 'apple-touch-icon.png', size: 180 },
]

const BACKGROUND = [8, 37, 47]
const LIGHT = [233, 242, 240]
const WATER = [29, 127, 119]
const FOAM = [47, 182, 168]

const SUPERSAMPLE = 3

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)

  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }

  return table
})()

const crc32 = (buffer) => {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

const pngChunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const payload = Buffer.concat([Buffer.from(type, 'latin1'), data])

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(payload), 0)

  return Buffer.concat([length, payload, crc])
}

const encodePng = (size, rgba) => {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)

  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** 正規化座標 (0..1) の色を返す。 */
const sampleColor = (x, y) => {
  const moonX = x - 0.66
  const moonY = y - 0.32

  if (moonX * moonX + moonY * moonY <= 0.13 * 0.13) {
    return LIGHT
  }

  const crest = 0.6 + 0.05 * Math.sin(x * 1.6 * Math.PI * 2)

  if (y >= crest) {
    return y <= crest + 0.035 ? FOAM : WATER
  }

  return BACKGROUND
}

const renderIcon = (size) => {
  const pixels = Buffer.alloc(size * size * 4)
  const samples = SUPERSAMPLE * SUPERSAMPLE

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0
      let green = 0
      let blue = 0

      for (let subY = 0; subY < SUPERSAMPLE; subY += 1) {
        for (let subX = 0; subX < SUPERSAMPLE; subX += 1) {
          const colour = sampleColor(
            (x * SUPERSAMPLE + subX) / (size * SUPERSAMPLE),
            (y * SUPERSAMPLE + subY) / (size * SUPERSAMPLE),
          )
          red += colour[0]
          green += colour[1]
          blue += colour[2]
        }
      }

      const offset = (y * size + x) * 4
      pixels[offset] = Math.round(red / samples)
      pixels[offset + 1] = Math.round(green / samples)
      pixels[offset + 2] = Math.round(blue / samples)
      pixels[offset + 3] = 255
    }
  }

  return pixels
}

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

for (const target of TARGETS) {
  const png = encodePng(target.size, renderIcon(target.size))
  writeFileSync(resolve(OUTPUT_DIRECTORY, target.fileName), png)
  process.stdout.write(`wrote ${target.fileName} (${String(png.length)} bytes)\n`)
}
