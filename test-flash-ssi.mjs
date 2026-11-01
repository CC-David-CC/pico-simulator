import assert from 'node:assert/strict';
import { RP2040 } from 'rp2040js';
import { attachFlashSSI } from './flash-ssi.mjs';

const pico = new RP2040();
let writes = 0;
const originalSSI = pico.peripherals[0x18000];
const originalIO = pico.peripherals[0x40018];
const bridge = attachFlashSSI(pico, () => writes++);
const SSI = 0x18000000, IO = 0x40018000;
pico.writeUint32(SSI + 8, 1);
function command(bytes) {
  pico.writeUint32(IO + 0x0c, 2 << 8);
  const result = bytes.map(byte => {
    pico.writeUint32(SSI + 0x60, byte);
    assert.equal(pico.readUint32(SSI + 0x24), 1);
    return pico.readUint32(SSI + 0x60);
  });
  pico.writeUint32(IO + 0x0c, 3 << 8);
  return result;
}
command([2, 0, 1, 0, 0x42]); // write enable is required
assert.equal(pico.readUint8(0x10000100), 0xff);
command([6]);
assert.equal(command([5, 0])[1], 2);
command([2, 0, 1, 0, 0x42, 0x19]);
assert.equal(pico.readUint8(0x10000100), 0x42);
assert.deepEqual(command([3, 0, 1, 0, 0, 0]).slice(4), [0x42, 0x19]);
assert.equal(writes, 1);
assert.equal(command([5, 0])[1], 0);
command([6]);
command([0x20, 0, 1, 0]);
assert.equal(pico.readUint8(0x10000100), 0xff);
assert.equal(writes, 2);
command([6]);
command([2, 0, 2, 0xfe, ...Array(256).fill(0xaa), 0x55, 0x33]);
assert.equal(pico.readUint8(0x100002fe), 0x55, 'wrapped program replaces first byte');
assert.equal(pico.readUint8(0x100002ff), 0x33, 'wrapped program replaces second byte');
assert.equal(pico.readUint8(0x10000200), 0xaa, 'program wraps in the selected page');
assert.equal(pico.readUint8(0x10000300), 0xff, 'program does not spill into next page');
bridge.dispose();
assert.equal(pico.peripherals[0x18000], originalSSI);
assert.equal(pico.peripherals[0x40018], originalIO);
console.log('RP2040 SSI register-level flash write, XIP read and erase: PASS');
