const MAGIC = new TextEncoder().encode('CODIPICO1');
export const FLASH_SIZE = 2 * 1024 * 1024;
export const ROM_SIZE = 16 * 1024;

export function parseUF2(data) {
  const bytes = new Uint8Array(data), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!bytes.length || bytes.length > 8 * 1024 * 1024 || bytes.length % 512) throw Error('Invalid UF2 file length.');
  const flash = new Uint8Array(FLASH_SIZE).fill(255);
  let blocks = 0;
  for (let pos = 0; pos < bytes.length; pos += 512) {
    if (view.getUint32(pos, true) !== 0x0a324655 || view.getUint32(pos + 4, true) !== 0x9e5d5157 || view.getUint32(pos + 508, true) !== 0x0ab16f30) throw Error('Invalid UF2 block.');
    const flags = view.getUint32(pos + 8, true);
    if (flags & 1) continue; // UF2 metadata, not flash content
    if ((flags & 0x2000) && view.getUint32(pos + 28, true) !== 0xe48bff56) throw Error('This UF2 is not for the RP2040.');
    const addr = view.getUint32(pos + 12, true), size = view.getUint32(pos + 16, true);
    if (addr < 0x10000000 || !size || size > 476 || addr - 0x10000000 + size > FLASH_SIZE) throw Error('UF2 block is outside Pico flash.');
    flash.set(bytes.subarray(pos + 32, pos + 32 + size), addr - 0x10000000);
    blocks++;
  }
  if (!blocks) throw Error('UF2 contains no flash data.');
  return flash;
}

export function encodeProject(rom, flash, baseline) {
  if (rom.length !== ROM_SIZE || flash.length !== FLASH_SIZE || baseline.length !== FLASH_SIZE) throw Error('Invalid Pico project data.');
  const bytes = new Uint8Array(MAGIC.length + ROM_SIZE + FLASH_SIZE * 2);
  bytes.set(MAGIC); bytes.set(rom, MAGIC.length); bytes.set(flash, MAGIC.length + ROM_SIZE); bytes.set(baseline, MAGIC.length + ROM_SIZE + FLASH_SIZE);
  return bytes;
}

export function decodeProject(data) {
  const bytes = new Uint8Array(data);
  if (bytes.length !== MAGIC.length + ROM_SIZE + FLASH_SIZE * 2 || !MAGIC.every((value, i) => bytes[i] === value)) throw Error('Not a supported Pico project.');
  return { rom: bytes.slice(MAGIC.length, MAGIC.length + ROM_SIZE), flash: bytes.slice(MAGIC.length + ROM_SIZE, MAGIC.length + ROM_SIZE + FLASH_SIZE), baseline: bytes.slice(MAGIC.length + ROM_SIZE + FLASH_SIZE) };
}
