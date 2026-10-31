/** Minimal W25Q16-style NOR flash. SPI bus/SSI integration is separate. */
export class SpiFlash {
  constructor(bytes=new Uint8Array(2*1024*1024).fill(255),onWrite=()=>{}){
    if(!(bytes instanceof Uint8Array)||bytes.length!==2*1024*1024)throw Error('Pico flash must be 2 MiB');
    this.bytes=bytes;this.onWrite=onWrite;this.enabled=false;this.active=false;
  }
  begin(){if(this.active)throw Error('SPI transaction already active');this.active=true;this.command=null;this.address=0;this.addressBytes=0;this.index=0;this.pending=[];}
  transfer(value){
    if(!this.active||!Number.isInteger(value)||value<0||value>255)throw Error('Invalid SPI transaction');
    if(this.command===null){this.command=value;return 255;}
    switch(this.command){
      case 0x05:return this.enabled?2:0; // status register: WEL, no simulated busy time
      case 0x35:return 2; // quad-enable appears set, as in the upstream SSI proposal
      case 0x9f:return [0xef,0x40,0x15][this.index++]??255;
      case 0x03:case 0x02:case 0x20:case 0xd8:
        if(this.addressBytes<3){this.address=(this.address<<8)|value;this.addressBytes++;return 255;}
        if(this.command===0x03){const result=this.bytes[this.address%this.bytes.length];this.address=(this.address+1)&0xffffff;return result;}
        if(this.command===0x02&&this.pending.length<256)this.pending.push(value);
        return 255;
      default:return 255;
    }
  }
  end(){
    if(!this.active)throw Error('No active SPI transaction');this.active=false;
    if(this.command===0x06){this.enabled=true;return;}
    if(this.command===0x04){this.enabled=false;return;}
    if(this.command===0x01){this.enabled=false;return;} // status writes accepted but not modeled
    if(!this.enabled)return;
    let changed=false;
    if(this.command===0x02&&this.addressBytes===3&&this.pending.length){
      const page=this.address&~255,start=this.address&255;
      this.pending.forEach((value,i)=>{const at=(page|((start+i)&255))%this.bytes.length;const next=this.bytes[at]&value;changed||=next!==this.bytes[at];this.bytes[at]=next;});
      this.enabled=false;
    }else if((this.command===0x20||this.command===0xd8)&&this.addressBytes===3){
      const size=this.command===0x20?4096:65536,start=(this.address%this.bytes.length)&~(size-1);
      for(let i=start;i<start+size;i++)if(this.bytes[i]!==255){this.bytes[i]=255;changed=true;}
      this.enabled=false;
    }else if(this.command===0xc7||this.command===0x60){
      changed=this.bytes.some(byte=>byte!==255);this.bytes.fill(255);this.enabled=false;
    }
    if(changed)this.onWrite();
  }
}
