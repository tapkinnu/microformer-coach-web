#!/usr/bin/env node
// Generates the PWA / Apple touch icons as real PNGs with no dependencies.
// A flat "microformer carriage" mark: dark background, accent rail, and a
// sliding carriage bar with three spring coils. Run: node tools/generate-icons.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

// CRC32 (PNG chunk checksums).
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b, a = 255]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  const fillRect = (x0, y0, w, h, color) => {
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) set(x, y, color);
  };
  const fillCircle = (cx, cy, rad, color) => {
    for (let y = cy - rad; y <= cy + rad; y += 1) {
      for (let x = cx - rad; x <= cx + rad; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) set(x, y, color);
      }
    }
  };

  const bg = [12, 13, 16, 255];
  const rail = [33, 38, 48, 255];
  const accent = [255, 138, 76, 255]; // warm orange carriage
  const coil = [90, 200, 250, 255]; // cyan springs

  fillRect(0, 0, size, size, bg);
  // rail track
  const railH = Math.round(size * 0.10);
  fillRect(Math.round(size * 0.12), Math.round(size * 0.72), Math.round(size * 0.76), railH, rail);
  // carriage
  const cW = Math.round(size * 0.40);
  const cH = Math.round(size * 0.20);
  const cX = Math.round(size * 0.30);
  const cY = Math.round(size * 0.46);
  fillRect(cX, cY, cW, cH, accent);
  // three spring coils to the left of carriage
  const coilR = Math.round(size * 0.035);
  for (let i = 0; i < 3; i += 1) {
    fillCircle(Math.round(size * 0.20), cY + Math.round(cH * (0.25 + i * 0.25)), coilR, coil);
  }
  return encodePng(size, size, px);
}

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['maskable-512.png', 512],
];
for (const [name, size] of targets) {
  fs.writeFileSync(path.join(iconsDir, name), makeIcon(size));
  console.log(`wrote icons/${name} (${size}x${size})`);
}
