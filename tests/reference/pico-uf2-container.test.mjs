import assert from 'node:assert/strict';
import {parseUF2} from '../apps/system/pico-simulator/project.mjs';
function block(flags,byte=42){const b=new Uint8Array(512),v=new DataView(b.buffer);for(const [offset,value] of [[0,0x0a324655],[4,0x9e5d5157],[8,flags],[12,0x10000000],[16,4],[28,0xe48bff56],[508,0x0ab16f30]])v.setUint32(offset,value,true);b.set([byte,2,3,4],32);return b;}
const firmware=block(0x2000);assert.deepEqual([...parseUF2(firmware).slice(0,4)],[42,2,3,4]);
for(const flags of [0x1000,0x1001,0x3000])assert.throws(()=>parseUF2(block(flags)),/file container/i);
const mixed=new Uint8Array(1024);mixed.set(block(0x1001));mixed.set(firmware,512);assert.throws(()=>parseUF2(mixed),/file container/i,'container blocks cannot be silently skipped as metadata');
const metadata=new Uint8Array(1024);metadata.set(block(1));metadata.set(firmware,512);assert.deepEqual([...parseUF2(metadata).slice(0,4)],[42,2,3,4]);
console.log('PASS UF2 file containers rejected; normal firmware and metadata remain supported');
