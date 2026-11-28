import { Simulator, GPIOPinState, USBCDC, ConsoleLogger, LogLevel } from 'rp2040js';
import { gpioInput } from './examples/gpio-input.mjs';
import { blink } from './examples/blink.mjs';
import { attachFlashSSI } from './flash-ssi.mjs';
import { ROM_SIZE, FLASH_SIZE } from './project.mjs';
import { queueSerial } from './serial.mjs';

let simulator = null, cdc = null, bridge = null;
function stop() { simulator?.stop(); bridge?.dispose(); bridge = null; simulator = null; cdc = null; }
onmessage = event => {
  try {
    if (event.data?.type === 'stop') { stop(); postMessage({ type: 'stopped' }); return; }
    if (event.data?.type === 'serial') { const {bytes,id}=event.data,reason=queueSerial(cdc,bytes);postMessage({type:'serial-queued',id,accepted:!reason,reason});return; }
    if (event.data?.type === 'snapshot' || event.data?.type === 'halt-snapshot') { if (simulator && bridge) { if(event.data.type==='halt-snapshot')simulator.stop(); const bytes = simulator.rp2040.flash.slice(0, FLASH_SIZE); postMessage({ type: 'snapshot', id: event.data.id, bytes: bytes.buffer }, [bytes.buffer]); } return; }
    if (event.data?.type === 'input-gp2') {
      simulator?.rp2040.gpio[2].setInputValue(event.data.high === true);
      return;
    }
    if (!['blink', 'gpio-input', 'firmware'].includes(event.data?.type)) return;
    stop();
    const sim = new Simulator(); simulator = sim;
    const pico = sim.rp2040;
    pico.logger = new ConsoleLogger(LogLevel.Error);
    pico.gpio[25].addListener(state => postMessage({ type: 'led', on: state === GPIOPinState.High }));
    if (event.data.type !== 'firmware') {
      pico.sram.set(event.data.type === 'blink' ? blink : gpioInput);
      pico.core.PC = 0x20000000;
    } else {
      const rom = new Uint8Array(event.data.rom), flash = new Uint8Array(event.data.flash);
      if (rom.length !== ROM_SIZE || flash.length !== FLASH_SIZE) throw Error('Invalid ROM or flash size.');
      const words = new Uint32Array(ROM_SIZE / 4), data = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
      for (let i = 0; i < words.length; i++) words[i] = data.getUint32(i * 4, true);
      pico.loadBootrom(words); pico.flash.set(flash); bridge = attachFlashSSI(pico, () => postMessage({ type: 'flash-changed' }));
      cdc = new USBCDC(pico.usbCtrl);
      cdc.onDeviceConnected = () => { cdc?.sendSerialByte(13); cdc?.sendSerialByte(10); };
      const decoder=new TextDecoder();cdc.onSerialData = data => postMessage({ type: 'serial', text: decoder.decode(data,{stream:true}) });
      pico.core.PC = 0x10000000;
    }
    postMessage({ type: 'started' });
    sim.execute();
  } catch (error) { stop(); postMessage({ type: 'error', message: String(error?.message || error) }); }
};
