// USBCDC's FIFO silently discards bytes when full. Admit a complete message
// only when there is room for all of it; otherwise the UI keeps the draft.
export function queueSerial(cdc,bytes){
  if(!cdc?.initialized)return 'not-ready';
  if(!(bytes instanceof Uint8Array)||bytes.length>256||bytes.length>cdc.txFIFO.size-cdc.txFIFO.itemCount)return 'full';
  for(const byte of bytes)cdc.sendSerialByte(byte);
  return null;
}
