import assert from 'node:assert/strict';
import {SpiFlash} from "../../spi-flash.mjs";
let writes=0;const f=new SpiFlash(undefined,()=>writes++);
function tx(...bytes){f.begin();const out=bytes.map(b=>f.transfer(b));f.end();return out;}
tx(0x02,0,0,0,0x12);assert.equal(f.bytes[0],255,'programming requires write-enable');
tx(0x06);assert.equal(tx(0x05,0)[1],2);tx(0x02,0,0,0xff,0xaa,0x55);assert.equal(f.bytes[255],0xaa);assert.equal(f.bytes[0],0x55);assert.equal(tx(0x05,0)[1],0);
tx(0x06);tx(0x02,0,0,0,0xff);assert.equal(f.bytes[0],0x55,'programming cannot restore zero bits');
assert.deepEqual(tx(0x03,0,0,0,0,0).slice(4),[0x55,255]);
tx(0x06);tx(0x20,0,0,4);assert.equal(f.bytes[0],255);assert.equal(f.bytes[255],255);
assert.deepEqual(tx(0x9f,0,0,0).slice(1),[0xef,0x40,0x15]);assert.equal(writes,2);
tx(0x06);const page=Array(256).fill(0xaa);tx(0x02,0,2,0xfe,...page,0x55,0x33);assert.equal(f.bytes[0x2fe],0x55,'257th byte replaces first buffered byte');assert.equal(f.bytes[0x2ff],0x33,'258th byte replaces second buffered byte');assert.equal(f.bytes[0x200],0xaa,'other bytes wrap within the same page');assert.equal(f.bytes[0x300],255,'program never spills into next page');
console.log('PASS NOR write-enable, page wrapping, one-way programming, reads and sector erase');
