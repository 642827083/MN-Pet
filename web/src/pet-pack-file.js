import { unzipSync, strFromU8 } from 'fflate';
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
// 在解压前限制目录和展开大小；桌宠包只能携带约定的图片及说明文件。
function inspect(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u16 = p => view.getUint16(p, true), u32 = p => view.getUint32(p, true);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === bytes.length) { end = p; break; }
  }
  if (end < 0 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10) || u16(end + 10) > 12 || u32(end + 16) + u32(end + 12) !== end) throw new Error('不是有效的 .mnpet 桌宠包');
  const entries = new Map(); let at = u32(end + 16), total = 0;
  for (let i = 0; i < u16(end + 10); i++) {
    if (at + 46 > end || u32(at) !== 0x02014b50) throw new Error('桌宠包目录损坏');
    const size = u32(at + 24), nameLength = u16(at + 28), next = at + 46 + nameLength + u16(at + 30) + u16(at + 32);
    if (next > end) throw new Error('桌宠包目录不完整');
    const name = strFromU8(bytes.subarray(at + 46, at + 46 + nameLength));
    if (!/^(pet\.json|poster\.png|LICENSE\.txt|actions\/|actions\/(idle|drag|focus|rest|wave|happy|shy|sleep|bow|step)\.webp)$/.test(name) || entries.has(name) || (u16(at + 8) & 1) || ![0, 8].includes(u16(at + 10)) || ((u32(at + 38) >>> 16) & 0xf000) === 0xa000) throw new Error('桌宠包包含重复、加密或不支持的文件');
    const limit = name === 'pet.json' ? 32768 : name === 'LICENSE.txt' ? 65536 : MNPPetPackModel.limits.file;
    total += size;
    if (size > limit || total > MNPPetPackModel.limits.total + 98304 || (name.endsWith('/') && size)) throw new Error('桌宠包展开后超过大小限制');
    entries.set(name, { size, crc: u32(at + 16) }); at = next;
  }
  if (at !== end) throw new Error('桌宠包目录大小无效');
  return entries;
}
async function decodable(bytes, mime, size) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('桌宠包有无法播放的图片')); image.src = url; });
    if (image.naturalWidth !== size || image.naturalHeight !== size) throw new Error('桌宠素材实际尺寸与清单不符');
    image.removeAttribute('src');
  } finally { URL.revokeObjectURL(url); }
}
export async function readPetPack(file) {
  if (!file || !/\.mnpet$/i.test(file.name)) throw new Error('请选择 .mnpet 桌宠动作包；单张图片请用「导入图片」');
  if (file.size < 22 || file.size > MNPPetPackModel.limits.zip) throw new Error('桌宠包不能超过 10 MiB');
  const bytes = new Uint8Array(await file.arrayBuffer()), entries = inspect(bytes), unpacked = unzipSync(bytes);
  if (Object.keys(unpacked).length !== entries.size) throw new Error('桌宠包文件数量不一致');
  for (const [name, meta] of entries) {
    if (!unpacked[name] || unpacked[name].length !== meta.size || crc32(unpacked[name]) !== meta.crc) throw new Error('桌宠包文件损坏，请重新下载');
  }
  let manifest;
  try { manifest = MNPPetPackModel.manifest(JSON.parse(strFromU8(unpacked['pet.json'] || new Uint8Array()))); }
  catch (error) { throw new Error(`桌宠包清单无效：${error.message}`); }
  const names = MNPPetPackModel.paths(manifest), files = {};
  for (const name of Object.keys(unpacked)) if (!names.includes(name) && name !== 'pet.json' && name !== 'LICENSE.txt' && name !== 'actions/') throw new Error('桌宠包包含清单以外的素材');
  for (const name of names) {
    const data = unpacked[name];
    if (!data) throw new Error(`桌宠包缺少 ${name}`);
    MNPPetPackModel.asset(manifest, name, data);
    await decodable(data, name.endsWith('.png') ? 'image/png' : 'image/webp', manifest.frameSize);
    files[name] = MNPPetPackModel.encode(data);
  }
  return MNPPetPackModel.record({ schema: 1, manifest, files, license: unpacked["LICENSE.txt"] ? strFromU8(unpacked["LICENSE.txt"]) : "" });
}
