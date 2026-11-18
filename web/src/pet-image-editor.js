const SIZE = 256;
export function inspectPetImage(bytes) {
  const text = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  let w, h;
  if (bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' && text(12,16) === 'IHDR') {
    const uint = i => bytes[i] * 16777216 + bytes[i+1] * 65536 + bytes[i+2] * 256 + bytes[i+3]; w = uint(16); h = uint(20);
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i++] !== 255) break;
      while (bytes[i] === 255) i++;
      const marker = bytes[i++], length = bytes[i] * 256 + bytes[i+1];
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) { h = bytes[i+3] * 256 + bytes[i+4]; w = bytes[i+5] * 256 + bytes[i+6]; break; }
      if (length < 2 || marker === 0xda || marker === 0xd9) break; i += length;
    }
  } else if (text(0,4) === 'RIFF' && text(8,12) === 'WEBP') {
    if (text(12,16) === 'VP8X') { w = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536; h = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536; }
    else if (text(12,16) === 'VP8L' && bytes[20] === 47) { w = 1 + bytes[21] + (bytes[22] & 63) * 256; h = 1 + (bytes[22] >> 6) + bytes[23] * 4 + (bytes[24] & 15) * 1024; }
    else if (text(12,16) === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) { w = (bytes[26] + bytes[27] * 256) & 16383; h = (bytes[28] + bytes[29] * 256) & 16383; }
  }
  if (!w || !h) throw new Error('图片格式或尺寸信息无法读取，请先转成标准 PNG、JPG 或 WebP');
  if (w > 8192 || h > 8192 || w * h > 32000000) throw new Error('图片尺寸过大，请先缩小到 8192 像素以内、总计不超过 3200 万像素');
  return { width: w, height: h };
}
export async function loadPetFile(file) {
  if (!file || !file.size || file.size > 10 * 1000 * 1000) throw new Error('请选择不超过 10 MB 的图片');
  // 解码前先检查文件头尺寸，避免体积很小但像素极多的图片耗尽 WebView 内存。
  inspectPetImage(new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer()));
  const url = URL.createObjectURL(file);
  try { return await loadPetImage(url); } finally { URL.revokeObjectURL(url); }
}
export function loadPetImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image(); let timer;
    const finish = error => { clearTimeout(timer); image.onload = image.onerror = null; error ? reject(error) : resolve(image); };
    image.onload = () => {
      const w = image.naturalWidth, h = image.naturalHeight;
      finish(!w || !h || w > 8192 || h > 8192 || w * h > 32000000 ? new Error('图片尺寸过大，请先缩小到 8192 像素以内、总计不超过 3200 万像素') : null);
    };
    image.onerror = () => finish(new Error('无法打开这张图片，请换一张或先转成 PNG'));
    timer = setTimeout(() => { image.src = ''; finish(new Error('图片打开超时，请重新选择')); }, 15000);
    image.src = source;
  });
}
export class ImagePetEditor {
  constructor(canvas, changed) {
    this.canvas = canvas; this.context = canvas.getContext('2d', { willReadFrequently: true }); this.changed = changed;
    this.image = null; this.zoom = 1; this.x = this.y = 0;
    canvas.addEventListener('pointerdown', e => {
      if (!this.image || this.disabled || !e.isPrimary || e.button !== 0) return;
      e.preventDefault(); canvas.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: this.x, oy: this.y };
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const factor = SIZE / canvas.getBoundingClientRect().width;
      this.x = this.limit(this.drag.ox + (e.clientX - this.drag.x) * factor);
      this.y = this.limit(this.drag.oy + (e.clientY - this.drag.y) * factor); this.draw();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, () => { this.drag = null; });
    canvas.addEventListener('keydown', e => {
      if (!this.image || this.disabled || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
      e.preventDefault(); const step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft') this.x -= step; if (e.key === 'ArrowRight') this.x += step;
      if (e.key === 'ArrowUp') this.y -= step; if (e.key === 'ArrowDown') this.y += step;
      this.x = this.limit(this.x); this.y = this.limit(this.y); this.draw();
    });
  }
  limit(value) { return Math.min(SIZE, Math.max(-SIZE, value)); }
  setImage(image, normalized = false) {
    this.image = image; this.fit = (normalized ? SIZE : SIZE * .88) / Math.max(image.naturalWidth, image.naturalHeight); this.reset();
  }
  reset() { this.x = this.y = 0; this.zoom = 1; this.draw(); }
  draw() {
    this.context.clearRect(0, 0, SIZE, SIZE);
    if (this.image) {
      const w = this.image.naturalWidth * this.fit * this.zoom, h = this.image.naturalHeight * this.fit * this.zoom;
      this.context.drawImage(this.image, (SIZE - w) / 2 + this.x, (SIZE - h) / 2 + this.y, w, h);
    }
    this.changed();
  }
  export() {
    const pixels = this.context.getImageData(0, 0, SIZE, SIZE).data;
    let left = SIZE, right = -1, top = SIZE, bottom = -1, count = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (pixels[(y * SIZE + x) * 4 + 3] > 10) {
      left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = Math.max(bottom,y); count++;
    }
    if (count < 16 || right - left < 3 || bottom - top < 3) throw new Error('裁剪区域里没有清晰可见的角色，请调整位置与缩放');
    const base64 = this.canvas.toDataURL('image/png').split(',')[1];
    if (base64.length > Math.ceil(512 * 1024 / 3) * 4) throw new Error('裁剪图片仍超过 512 KiB，请使用更简单的图片');
    return { base64, anchorX: (left + right + 1) / (2 * SIZE) };
  }
  clear() { this.image = null; this.drag = null; this.context.clearRect(0, 0, SIZE, SIZE); }
}
