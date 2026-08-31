/**
 * 极简 PNG → WebP 转换工具（无外部依赖，纯 Node 内置模块）
 *
 * 用途：将参考/示意图压缩为 WebP，便于网页使用。
 * 说明：实现 baseline 顺序式 DCT、质量量化和 VP8L 风格是无复杂依赖下
 * 不现实的；因此本工具采用「PNG 解码 → 以 image/webp 为目标的备选路径」。
 *
 * 由于纯 Node 无法编码 WebP，本工具实际执行：
 *   1) 解码 PNG（支持 8-bit RGB/RGBA）
 *   2) 可选缩放（最近邻，限制最长边）
 *   3) 输出仍为 PNG（保持兼容），并打印建议：
 *      生产环境请用 `cwebp input.png -q 82 -o output.webp` 获得更优体积。
 *
 * 运行：node repair-workflow/tools/png-to-webp.mjs <in.png> [maxWidth]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { deflateSync } from "node:zlib";

const [,, inPath, maxWArg] = process.argv;
if (!inPath) {
  console.error("用法: node png-to-webp.mjs <in.png> [maxWidth]");
  process.exit(1);
}
const maxW = Number(maxWArg || 1400);

/* ---------- PNG 解码 ---------- */
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    }
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error("仅支持 8-bit RGB/RGBA PNG，当前 bitDepth=" + bitDepth + " colorType=" + colorType);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const img = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? img[y * stride + x - bpp] : 0;
      const b = y > 0 ? img[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? img[(y - 1) * stride + x - bpp] : 0;
      let v = raw[rp++];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      img[y * stride + x] = v;
    }
  }
  return { w, h, bpp, data: img };
}

/* ---------- 最近邻缩放 ---------- */
function resize(img, maxWidth) {
  if (img.w <= maxWidth) return img;
  const scale = maxWidth / img.w;
  const nw = Math.round(img.w * scale), nh = Math.round(img.h * scale);
  const out = Buffer.alloc(nw * nh * img.bpp);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(img.w - 1, Math.floor(x / scale));
      const sy = Math.min(img.h - 1, Math.floor(y / scale));
      for (let k = 0; k < img.bpp; k++)
        out[(y * nw + x) * img.bpp + k] = img.data[(sy * img.w + sx) * img.bpp + k];
    }
  return { w: nw, h: nh, bpp: img.bpp, data: out };
}

/* ---------- PNG 编码（filter 0 + zlib） ---------- */
function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(img) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8; ihdr[9] = img.bpp === 4 ? 6 : 2;
  const raw = Buffer.alloc(img.h * (1 + img.w * img.bpp));
  let p = 0;
  for (let y = 0; y < img.h; y++) {
    raw[p++] = 0;
    img.data.copy(raw, p, y * img.w * img.bpp, (y + 1) * img.w * img.bpp);
    p += img.w * img.bpp;
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- 执行 ---------- */
const src = readFileSync(inPath);
const img = resize(decodePNG(src), maxW);
const out = encodePNG(img);
const outPath = inPath.replace(/\.png$/i, "") + ".optimized.png";
writeFileSync(outPath, out);
console.log(`输入: ${(src.length / 1024).toFixed(0)} KB (${decodePNG(src).w}×${decodePNG(src).h})`);
console.log(`输出: ${(out.length / 1024).toFixed(0)} KB (${img.w}×${img.h}) → ${outPath}`);
console.log("提示: 生产环境建议运行 `cwebp input.png -q 82 -o output.webp` 以获得更优 WebP 体积。");
