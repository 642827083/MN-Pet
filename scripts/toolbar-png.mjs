import { unzlibSync, zlibSync } from 'fflate';

const crcTable = Array.from({ length: 256 }, (_, byte) => {
  for (let n = 0; n < 8; n++) byte = byte & 1 ? 0xedb88320 ^ (byte >>> 1) : byte >>> 1;
  return byte >>> 0;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), result = Buffer.alloc(body.length + 8);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  result.writeUInt32BE(data.length); body.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

// 只压缩 Resvg 生成的八位 RGBA 图标，保留每一种颜色及透明度，不量化像素。
export function optimizeToolbarPNG(input) {
  const png = Buffer.from(input), width = png.readUInt32BE(16), height = png.readUInt32BE(20), parts = [];
  if (png[24] !== 8 || png[25] !== 6 || png[26] || png[27] || png[28]) return png;
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = unzlibSync(Buffer.concat(parts)), stride = width * 4, pixels = Buffer.alloc(width * height * 4);
  if (raw.length !== height * (stride + 1)) return png;
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1), filter = raw[row];
    // 当前渲染器使用 Sub；遇到其他过滤方式保持原图，避免推测其编码。
    if (filter !== 0 && filter !== 1) return png;
    for (let x = 0; x < stride; x++) pixels[y * stride + x] = raw[row + 1 + x] + (filter === 1 && x >= 4 ? pixels[y * stride + x - 4] : 0);
  }
  const colors = [], lookup = new Map(), indices = [];
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const key = pixels.readUInt32BE(offset);
    if (!lookup.has(key)) { lookup.set(key, colors.length); colors.push(pixels.subarray(offset, offset + 4)); }
    if (colors.length > 256) return png;
    indices.push(lookup.get(key));
  }
  const depth = colors.length <= 2 ? 1 : colors.length <= 4 ? 2 : colors.length <= 16 ? 4 : 8;
  const bytesPerRow = Math.ceil(width * depth / 8), scanlines = Buffer.alloc(height * (bytesPerRow + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    scanlines[y * (bytesPerRow + 1) + 1 + Math.floor(x * depth / 8)] |= indices[y * width + x] << (8 - depth - x * depth % 8);
  }
  const header = Buffer.from(png.subarray(16, 29)); header[8] = depth; header[9] = 3;
  const palette = Buffer.concat(colors.map(color => color.subarray(0, 3))), alpha = Buffer.from(colors.map(color => color[3]));
  const optimized = Buffer.concat([png.subarray(0, 8), chunk('IHDR', header), chunk('PLTE', palette), chunk('tRNS', alpha), chunk('IDAT', Buffer.from(zlibSync(scanlines, { level: 9 }))), chunk('IEND', Buffer.alloc(0))]);
  return optimized.length < png.length ? optimized : png;
}
