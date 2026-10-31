import { SpiFlash } from './spi-flash.mjs';

// A narrow SPI-mode bridge for some RP2040 flash commands. This is
// not a complete implementation of the SSI controller or of QSPI XIP.
export function attachFlashSSI(rp2040, onWrite = () => {}) {
  const ssiKey = 0x18000, ioKey = 0x40018;
  const oldSSI = rp2040.peripherals[ssiKey], oldIO = rp2040.peripherals[ioKey];
  const flash = new SpiFlash(rp2040.flash.subarray(0, 2 * 1024 * 1024), onWrite);
  // rp2040js 1.4.1 ignores pulls for floating GPIO inputs. MicroPython reads
  // these during startup, so track external drive separately from pull state.
  const restorePins = rp2040.gpio.map(pin => {
    let driven = false;
    const set = pin.setInputValue, refresh = pin.refreshInput;
    pin.setInputValue = function(value) { driven = true; return set.call(this, value); };
    pin.refreshInput = function() { const previous = driven; try { return refresh.call(this); } finally { driven = previous; } };
    Object.defineProperty(pin, 'inputValue', { configurable: true, get() {
      let value = this.rawInputValue;
      if (!driven && this.pullupEnabled !== this.pulldownEnabled) value = this.pullupEnabled;
      value = value && this.inputEnable;
      return this.inputOverride === 1 ? !value : this.inputOverride === 2 ? false : this.inputOverride === 3 ? true : value;
    } });
    return () => { delete pin.inputValue; delete pin.setInputValue; delete pin.refreshInput; };
  });
  const restoreQSPI = rp2040.qspi.map(pin => {
    Object.defineProperty(pin, 'rawOutputEnable', { configurable: true, get: () => true });
    return () => { delete pin.rawOutputEnable; };
  });
  // The fixed-function QSPI pin resolves low on reset in the upstream model.
  let control = 0, selected = true, enabled = 0, ctrl0 = 0, ctrl1 = 0;
  let rx = [];
  flash.begin();

  const setControl = value => {
    control = value >>> 0;
    // IO_QSPI GPIO_QSPI_SS_CTRL OUTOVER: 2 forces low, 3 forces high.
    const override = (control >>> 8) & 3;
    const next = override === 0 || override === 2;
    if (next !== selected) {
      if (next) { rx = []; flash.begin(); } else flash.end();
      selected = next;
    }
  };
  const atomic = (object, offset, value, type) => {
    if (!type) { object.writeUint32(offset, value); return; }
    const old = object.readUint32(offset);
    object.writeUint32(offset, type === 1 ? old ^ value : type === 2 ? old | value : type === 3 ? old & ~value : value);
  };
  const io = {
    readUint32(offset) {
      if (offset < 0x30) { const pin = rp2040.qspi[offset >>> 3]; return offset & 4 ? pin.ctrl : pin.status; }
      return oldIO.readUint32(offset);
    },
    writeUint32(offset, value) {
      if (offset < 0x30) {
        if (offset & 4) { const pin = rp2040.qspi[offset >>> 3]; pin.ctrl = value; pin.checkForUpdates(); if (offset === 0x0c) setControl(value); }
      } else oldIO.writeUint32(offset, value);
    },
    writeUint32Atomic(offset, value, type) { if (offset < 0x30) atomic(io, offset, value, type); else oldIO.writeUint32Atomic(offset, value, type); },
  };
  const ssi = {
    readUint32(offset) {
      switch (offset) {
        case 0: return ctrl0;
        case 4: return ctrl1;
        case 8: return enabled;
        case 0x20: return 0;
        case 0x24: return rx.length;
        case 0x28: return 0x06 | (rx.length ? 0x08 : 0);
        case 0x60: return rx.shift() ?? 0;
        default: return oldSSI.readUint32(offset);
      }
    },
    writeUint32(offset, value) {
      switch (offset) {
        case 0: ctrl0 = value; return;
        case 4: ctrl1 = value; return;
        case 8: enabled = value & 1; return;
        case 0x60:
          if (enabled) rx.push(selected ? flash.transfer(value & 255) : 255);
          return;
        default: oldSSI.writeUint32(offset, value);
      }
    },
    writeUint32Atomic(offset, value, type) { atomic(ssi, offset, value, type); },
  };
  rp2040.peripherals[ssiKey] = ssi;
  rp2040.peripherals[ioKey] = io;
  return { flash, dispose() {
    if (selected) { flash.end(); selected = false; }
    if (rp2040.peripherals[ssiKey] === ssi) rp2040.peripherals[ssiKey] = oldSSI;
    if (rp2040.peripherals[ioKey] === io) rp2040.peripherals[ioKey] = oldIO;
    restorePins.forEach(restore => restore());
    restoreQSPI.forEach(restore => restore());
  } };
}
