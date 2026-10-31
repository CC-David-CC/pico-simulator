// Optional integration test: pass paths to the upstream RP2040 B1 bootrom
// module and a Pico MicroPython UF2. The firmware is not bundled here.
import { readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { attachFlashSSI } from './flash-ssi.mjs';
import { SpiFlash } from './spi-flash.mjs';

const { Simulator, USBCDC, ConsoleLogger, LogLevel } = await import(process.env.PICO_EMULATOR ? pathToFileURL(process.env.PICO_EMULATOR) : 'rp2040js');
const [romPath, firmwarePath, filesystemPath] = process.argv.slice(2);
if (!romPath || !firmwarePath) throw Error('Usage: node test-micropython.mjs BOOTROM_MJS FIRMWARE_UF2');
const { bootromB1 } = await import(pathToFileURL(romPath));
const uf2 = await readFile(firmwarePath);
const simulator = new Simulator(), pico = simulator.rp2040;
pico.logger = new ConsoleLogger(LogLevel.Error);
pico.loadBootrom(bootromB1);
let blocks = 0;
for (let offset = 0; offset + 512 <= uf2.length; offset += 512) {
  if (uf2.readUInt32LE(offset) !== 0x0a324655 || uf2.readUInt32LE(offset + 4) !== 0x9e5d5157 || uf2.readUInt32LE(offset + 508) !== 0x0ab16f30) throw Error('Invalid UF2 block');
  const target = uf2.readUInt32LE(offset + 12) - 0x10000000, size = uf2.readUInt32LE(offset + 16);
  if (target < 0 || size > 476 || target + size > 2 * 1024 * 1024) throw Error('UF2 outside Pico flash');
  pico.flash.set(uf2.subarray(offset + 32, offset + 32 + size), target);
  blocks++;
}
if (!blocks || uf2.length % 512) throw Error('Incomplete UF2');
if (filesystemPath) {
  const filesystem = await readFile(filesystemPath);
  if (filesystem.length !== 352 * 4096) throw Error('Expected 352-block LittleFS image');
  pico.flash.set(filesystem, 0xa0000);
}
let writes = 0, output = '', sent = false;
const initialFs = pico.flash.slice(0xa0000, 0x200000);
if (process.env.PICO_TRACE_FLASH) {
  const end = SpiFlash.prototype.end;
  SpiFlash.prototype.end = function () { console.error('flash', this.command?.toString(16), this.address.toString(16), this.pending.length, this.enabled); return end.call(this); };
}
if (!process.env.PICO_NO_BRIDGE) attachFlashSSI(pico, () => writes++);
if (process.env.PICO_TRACE_SSI) {
  for (const key of [0x18000, 0x40018]) {
    const part = pico.peripherals[key], write = part.writeUint32Atomic.bind(part);
    part.writeUint32Atomic = (offset, value, type) => {
      if (key === 0x18000 && offset === 0x60 || key === 0x40018 && offset === 0x0c) console.error(key.toString(16), offset.toString(16), value.toString(16), type);
      write(offset, value, type);
    };
  }
}
const cdc = new USBCDC(pico.usbCtrl);
cdc.onDeviceConnected = () => { for (const c of '\r\n') cdc.sendSerialByte(c.charCodeAt(0)); };
cdc.onSerialData = data => {
  output += new TextDecoder().decode(data);
  if (!sent && output.includes('>>>')) {
    sent = true;
    const command = process.env.PICO_COMMAND || "f=open('verify.txt','w');f.write('PICO_FLASH_OK');f.close();print(open('verify.txt').read())";
    for (const c of command + '\r\n') cdc.sendSerialByte(c.charCodeAt(0));
  }
  if (output.includes('PICO_FLASH_OK\r\n') && (writes || initialFs.some((byte, i) => byte !== pico.flash[0xa0000 + i]))) {
    if (process.env.PICO_DUMP_FILESYSTEM) writeFileSync(process.env.PICO_DUMP_FILESYSTEM, pico.flash.subarray(0xa0000, 0x200000));
    console.log(`PASS: MicroPython wrote and read a file; ${writes} bridge callbacks`);
    simulator.stop(); process.exit(0);
  }
  if (process.env.PICO_COMMAND && sent && (output.match(/>>> /g) || []).length >= 2) {
    simulator.stop(); console.log(output.slice(-4000));
    console.log('Filesystem bytes changed:', initialFs.reduce((n, byte, i) => n + (byte !== pico.flash[0xa0000 + i]), 0));
    if (process.env.PICO_TRACE_PINS) console.log(pico.gpio.map((p, i) => [i, p.inputValue, p.padValue, p.ctrl]));
    process.exit(process.env.PICO_EXPECT && !output.includes('\r\n' + process.env.PICO_EXPECT + '\r\n') ? 1 : 0);
  }
  if (sent && output.includes('Traceback (most recent call last):') && output.endsWith('>>> ')) {
    simulator.stop(); console.error(output.slice(-2000)); process.exit(1);
  }
};
setTimeout(() => { simulator.stop(); console.error(`Timed out, flash changes=${writes}\n${output.slice(-2000)}`); process.exit(1); }, 60000);
pico.core.PC = 0x10000000;
simulator.execute();
