import assert from 'node:assert/strict';
import { Simulator, GPIOPinState } from 'rp2040js';
import { blink } from './examples/blink.mjs';
import { gpioInput } from './examples/gpio-input.mjs';
const sim = new Simulator(), pico = sim.rp2040;
const states = [];
pico.gpio[25].addListener(state => states.push(state));
pico.sram.set(blink); pico.core.PC = 0x20000000;
for (let i = 0; i < 800000; i++) pico.core.executeInstruction();
assert.ok(states.includes(GPIOPinState.High), 'GPIO25 became high');
assert.ok(states.includes(GPIOPinState.Low), 'GPIO25 became low');
console.log('RP2040 machine code drives Pico GPIO25 high and low: PASS');

const board = new Simulator().rp2040;
board.sram.set(gpioInput);
board.core.PC = 0x20000000;
for (const high of [false, true, false, true, false]) {
  const before = board.gpio[25].value;
  board.gpio[2].setInputValue(high);
  assert.equal(board.gpio[25].value, before, 'changing the input alone leaves the output intact');
  for (let i = 0; i < 32; i++) board.core.executeInstruction();
  assert.equal(board.gpio[25].value, high ? GPIOPinState.Low : GPIOPinState.High);
}
console.log('RP2040 Thumb instructions sample GPIO2 and invert it on GPIO25: PASS');
