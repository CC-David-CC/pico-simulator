import assert from 'node:assert/strict';
import {USBCDC} from 'rp2040js';
import {queueSerial} from './serial.mjs';

const cdc=new USBCDC({});
const message=new Uint8Array(256).map((_,i)=>i);
assert.equal(queueSerial(null,message),'not-ready');
assert.equal(queueSerial(cdc,message),'not-ready');
cdc.initialized=true;
assert.equal(queueSerial(cdc,new Uint8Array(257)),'full');
assert.equal(cdc.txFIFO.itemCount,0);
assert.equal(queueSerial(cdc,message),null);
assert.equal(queueSerial(cdc,message),null);
assert.equal(cdc.txFIFO.itemCount,512);
assert.equal(queueSerial(cdc,new Uint8Array([7])),'full');
assert.deepEqual(cdc.txFIFO.items,[...message,...message]);
console.log('Pico serial queue admits entire messages or preserves them on rejection: PASS');
