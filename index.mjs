import './style.css';
import { parseUF2, encodeProject, decodeProject, ROM_SIZE } from './project.mjs';

export function mount(host) {
  const { w } = host, { make, textButton } = host.ui, { workspaceMirrorContext, workspaceOwner } = host.storage;
  const owner = workspaceOwner(), state=w.picoSimulator??={path:null,version:null}, body = make('div', 'window-content pico-simulator');
  const toolbar = make('div', 'pico-toolbar'), status = make('p', 'pico-status', 'Ready to run the Blink example.'), fileWarning=make('p','pico-file-warning');fileWarning.hidden=true;fileWarning.setAttribute('role','status');const failureWarning=make('p','pico-failure-warning','The firmware stopped unexpectedly. Unsaved flash changes may be lost. Reopen a project, load a UF2, or reset flash before running or saving firmware.');failureWarning.hidden=true;failureWarning.setAttribute('role','status');
  const stage = make('div', 'pico-stage'), led = make('span', 'pico-led');
  led.setAttribute('aria-hidden', 'true');
  const ledLabel=make('span','pico-led-state','Pico onboard LED (GPIO 25): off');
  stage.append(led, ledLabel);
  function showLed(on){led.classList.toggle('is-lit', !!on);ledLabel.textContent='Pico onboard LED (GPIO 25): '+(on?'on':'off');}
  const serial = make('pre', 'pico-serial'); serial.setAttribute('aria-label', 'Pico serial output');serial.tabIndex=0;const serialInfo=make('p','pico-note','Serial monitor keeps the most recent 65,536 UTF-16 code units.'),serialWarning=make('p','pico-file-warning pico-serial-warning');serialWarning.hidden=true;serialWarning.setAttribute('role','status');
  const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Serial command'; input.setAttribute('aria-label', 'Pico serial command');input.setAttribute('autocapitalize','off');input.setAttribute('autocorrect','off');input.spellcheck=false;
  const path = document.createElement('input'); path.value = '/Pico-' + crypto.randomUUID() + '.pico'; path.setAttribute('aria-label', 'Pico project path');
  const note = make('p', 'pico-note', 'Blink runs locally. To use firmware, open your own 16 KiB RP2040 B1 ROM and Pico UF2 from My files. Save a project to retain simulated flash; opening it restarts the board.');
  let worker = null, generation = 0, disposed = false, bridgeMode = false, rom = null, flash = null, baseline = null, version = null, savedPath = null, changed = false, flashUncertain = false, changeSerial = 0, saving = false, request = 0, serialRequest=0,serialPending=null,followSerial=true,openEpoch=0,unwatch=()=>{},watchSerial=0,checkSerial=0,unwatchOutput=()=>{},outputWatchSerial=0,outputCheckSerial=0;
  let choosingFolder=false;
  const openSerial={rom:0,firmware:0,project:0};
  function beginOpen(kind){if(kind==='project'){openSerial.rom++;openSerial.firmware++;}else openSerial.project++;return {kind,serial:++openSerial[kind],epoch:openEpoch};}
  const currentOpen=token=>token.epoch===openEpoch&&token.serial===openSerial[token.kind];
  w.ownerSub=owner;state.hasChanges=()=>changed||bridgeMode||saving||flashUncertain;
  const pending = new Map();
  const valid = () => !disposed && !host.signal.aborted && owner === workspaceOwner();
  const tell = value => { if (valid()) status.textContent = value; };
  let recovery=null;
  const retry=textButton('Retry saved project',()=>{
    if(recovery) void openProject(recovery.path,{initialLoad:true,expectedSHA:recovery.sha256});
  });
  retry.hidden=true;
  function clearRecovery(){recovery=null;retry.hidden=true;}
  function clearWatch(){watchSerial++;checkSerial++;unwatch();unwatch=()=>{};fileWarning.hidden=true;fileWarning.textContent='';}
  function watch(c,p){clearWatch();const serial=watchSerial;const check=async()=>{const expected=version,checkId=++checkSerial;if(!valid()||!c.valid()||!expected||savedPath!==p)return;let message='';try{const file=await c.files.stat(p);if(file.status==='conflict')message='This project has conflicting copies. The current board remains open; resolve them in Files.';else if(file.version!==expected)message='The saved project changed. The current board remains open; save a copy or reopen it.';}catch{message='The saved project is unavailable. The current board remains open.';}if(valid()&&c.valid()&&serial===watchSerial&&checkId===checkSerial&&savedPath===p&&version===expected){fileWarning.textContent=message;fileWarning.hidden=!message;}};unwatch=c.files.subscribe(check);queueMicrotask(check);}
  function clearOutputWatch(){outputWatchSerial++;outputCheckSerial++;unwatchOutput();unwatchOutput=()=>{};serialWarning.textContent='';serialWarning.hidden=true;}
  function watchOutput(c,p,expected){clearOutputWatch();const serial=outputWatchSerial;const check=async()=>{const id=++outputCheckSerial;if(!valid()||!c.valid())return;let message='';try{const f=await c.files.stat(p);if(f.status==='conflict')message='The saved serial output has conflicting copies. Resolve them in Files.';else if(f.version!==expected)message='The saved serial output changed. Save a copy if you need the current monitor.';}catch{message='The saved serial output is unavailable. The current monitor remains open.';}if(valid()&&c.valid()&&serial===outputWatchSerial&&id===outputCheckSerial){serialWarning.textContent=message;serialWarning.hidden=!message;}};unwatchOutput=c.files.subscribe(check);queueMicrotask(check);}
  function stop() { generation++; worker?.terminate(); worker = null; bridgeMode = false; serialPending=null; showLed(false); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Board stopped.')); } pending.clear(); }
  function recoverFlash(){flashUncertain=false;failureWarning.hidden=true;}
  function workerFailed(mode,message){if(mode==='firmware'){flashUncertain=true;failureWarning.hidden=false;}stop();tell(message);}
  function start(mode) {
    stop(); const current = generation;
    worker = new Worker(new URL('./workers/pico.mjs', import.meta.url), { type: 'module' }); bridgeMode = mode === 'firmware'; serial.textContent = '';followSerial=true;serialLatest.disabled=true;serialInfo.textContent='Serial monitor keeps the most recent 65,536 UTF-16 code units.';
    worker.onmessage = event => {
      if (!valid() || current !== generation) return;
      const m = event.data;
      if (m.type === 'led') showLed(m.on);
      else if (m.type === 'started') tell(mode === 'firmware' ? 'Running firmware locally. Save the project to keep flash changes.' : 'Running the Blink example locally.');
      else if (m.type === 'serial') { const text=serial.textContent+m.text;if(text.length>65536){let tail=text.slice(-65536);const first=tail.charCodeAt(0);if(first>=0xdc00&&first<=0xdfff)tail=tail.slice(1);serial.textContent=tail;serialInfo.textContent='Earlier serial output was trimmed; only the most recent output can be saved.';}else serial.textContent=text;if(followSerial)serial.scrollTop = serial.scrollHeight; }
      else if (m.type === 'flash-changed') { changed = true; changeSerial++; }
      else if (m.type === 'serial-queued' && serialPending?.id===m.id) { if(m.accepted){if(serialPending.clear&&input.value===serialPending.text)input.value='';tell('Serial input queued for the board.');}else tell(m.reason==='not-ready'?'Serial connection is not ready yet; your input was kept.':'Serial buffer is full; your input was kept. Try again.');serialPending=null; }
      else if (m.type === 'snapshot') { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); p.resolve(new Uint8Array(m.bytes)); } }
      else if (m.type === 'error') { workerFailed(mode,'Simulator stopped: ' + m.message); }
    };
    worker.onerror = () => { if (current === generation && valid()) { workerFailed(mode,'Simulator worker failed.'); } };
    worker.postMessage(mode === 'blink' ? { type: 'blink' } : { type: 'firmware', rom, flash });
  }
  async function snapshot({halt=false}={}) {
    if (!worker || !bridgeMode) return flash;
    return new Promise((resolve, reject) => { const id = ++request; const timer = setTimeout(() => { pending.delete(id); reject(Error('Board did not respond.')); }, 10000); pending.set(id, { resolve, reject, timer }); worker.postMessage({ type: halt?'halt-snapshot':'snapshot', id }); });
  }
  async function pick(extensions, token) {
    const selected = await host.storage.pickFile({ extensions, signal: host.signal }); if (!selected || !valid() || !currentOpen(token)) return null;
    const c = await workspaceMirrorContext(), f = await c.files.read(selected);
    if (!valid() || !c.valid() || !currentOpen(token)) return null;
    if (f.status === 'conflict') throw Error('Resolve this file conflict in Files first.');
    return { path: c.path(selected), data: new Uint8Array(f.data), version: f.version, sha256: f.sha256, context:c };
  }
  async function confirmBoard(message,title,token=null){const beforeGeneration=generation,beforeChange=changeSerial,beforeEpoch=openEpoch;try{if(!await host.ui.confirm(message,{title,confirmLabel:title==='Reset simulated flash'?'Reset flash':'Replace',cancelLabel:'Keep current board',danger:true,signal:host.signal}))return false;if(!valid()||(token&&!currentOpen(token)))return false;if(generation!==beforeGeneration||changeSerial!==beforeChange||openEpoch!==beforeEpoch){tell('The board changed while the confirmation was open. Try again.');return false;}return true;}catch(e){tell('Could not confirm board change: '+e.message);return false;}}
  async function openRom() { const token=beginOpen('rom');try { const f = await pick(['.bin'],token); if (!f) return; if (f.data.length !== ROM_SIZE) throw Error('ROM must be exactly 16 KiB.'); if (rom && (changed || bridgeMode) && !await confirmBoard('The running board may have unsaved flash changes. Replace it?','Replace board',token)) return; if(!valid()||!currentOpen(token)||!f.context.valid())return; stop(); clearRecovery(); rom = f.data; changed = true; changeSerial++; if(flash&&baseline&&!flashUncertain)start('firmware');else tell(flashUncertain?'ROM loaded. Recover firmware flash before running it.':'ROM loaded. Open a Pico UF2 next.'); } catch (e) { if(currentOpen(token))tell(e.message); } }
  async function openFirmware() { const token=beginOpen('firmware');try { const f = await pick(['.uf2'],token); if (!f) return; const newFlash = parseUF2(f.data); if (flash && (changed || bridgeMode) && !await confirmBoard('The running board may have unsaved flash changes. Replace it?','Replace board',token)) return; if(!valid()||!currentOpen(token)||!f.context.valid())return; stop(); clearRecovery(); flash = newFlash; baseline = newFlash.slice(); recoverFlash(); clearWatch();version = null; savedPath = null;state.path=null;state.version=null;w.launchContext=null; changed = true; changeSerial++; if (rom) start('firmware'); else tell('Firmware loaded. Open your RP2040 B1 ROM to run it.'); } catch (e) { if(currentOpen(token))tell(e.message); } }
  async function openProject(selected,{initialLoad=false,expectedSHA}={}) {
    const token=beginOpen('project');
    let opened=false,broken=false,context,restoreError;
    try {
      let file;
      if(selected) {
        context=await workspaceMirrorContext();
        const target=context.path(selected);
        let saved;
        try { saved=await context.files.read(target); }
        catch(error) {
          if(context.valid()&&error.message==='File not found.') broken=true;
          throw error;
        }
        if(!valid()||!context.valid()||!currentOpen(token)) return;
        if(saved.status==='conflict') throw Error('Resolve this file conflict in Files first.');
        if(expectedSHA&&saved.sha256!==expectedSHA) {
          broken=true;
          throw Error('The selected Pico project changed. Refresh Files and select it again.');
        }
        file={path:target,data:new Uint8Array(saved.data),version:saved.version,sha256:saved.sha256,context};
      } else {
        file=await pick(['.pico'],token);
      }
      if(!file) return;
      context=file.context;
      let project;
      try { project=decodeProject(file.data); }
      catch(error) { broken=true; throw error; }
      if((changed||bridgeMode) && !await confirmBoard('The running board may have unsaved flash changes. Replace it?','Replace board',token)) return;
      if(!valid()||!context.valid()||!currentOpen(token)) return;
      stop();
      clearRecovery();
      ({rom,flash,baseline}=project);
      recoverFlash();
      savedPath=state.path=path.value=file.path;
      version=state.version=file.version;
      w.launchContext=Object.freeze({version:1,storage:context.storage||'mirror',path:file.path,owner,sha256:file.sha256});
      w.title=file.path.split('/').pop()+' — Pico Simulator';
      watch(context,file.path);
      changed=false;
      start('firmware');
      opened=true;
    } catch(error) {
      restoreError=error.message;
      if(currentOpen(token)) tell(error.message);
    } finally {
      if(initialLoad&&!opened&&valid()&&currentOpen(token)&&savedPath===null&&w.launchContext?.path===selected) {
        if(broken&&context?.valid()) {
          clearRecovery();
          w.launchContext=null;
          w.title='Pico Simulator';
        } else {
          recovery={path:selected,sha256:expectedSHA};
          retry.hidden=false;
          if(path.value===selected) path.value='/Pico-recovery.pico';
          tell('Could not restore '+selected+(restoreError?': '+restoreError:'')+'. Retry saved project or save a separate project.');
        }
      }
    }
  }
  async function saveProject() { if (saving||choosingFolder) return; const requestedPath=path.value;saving = true; try { if (flashUncertain) throw Error('Recover firmware flash before saving: reopen a project, load a UF2, or reset flash.'); if (!rom || !flash || !baseline) throw Error('Open a ROM and firmware first.'); const boardGeneration=generation,copy = await snapshot(); const atSnapshot = changeSerial; if (!valid()) return; const c = await workspaceMirrorContext(), target = c.path(requestedPath); if (!/\.pico$/i.test(target)) throw Error('Project names must end in .pico.'); const data = encodeProject(rom, copy, baseline); let expected=null;try{const old=await c.files.stat(target);if(old.status==='conflict')throw Error('Resolve this file conflict in Files first.');if(target===savedPath&&version){if(old.version!==version)throw Error('The saved project changed. Save a copy or reopen it.');}else if(!await host.ui.confirm('Replace '+target+'?',{title:'Replace Pico project',confirmLabel:'Replace',cancelLabel:'Cancel',danger:true,signal:host.signal})){tell('Project save cancelled.');return;}expected=old.version;}catch(e){if(e.message!=='File not found.')throw e;if(target===savedPath&&version)throw Error('The saved project was removed. Save a copy or reopen it.');}if(!valid()||!c.valid())return;if(generation!==boardGeneration)throw Error('The board changed while saving; try again.');const result = await c.files.write(target, data, expected); if (!valid() || !c.valid()) return;if(generation!==boardGeneration){tell('Saved the earlier board; the current board has changed.');return;} flash = copy; clearRecovery(); savedPath = target; version = result.version;state.path=target;state.version=result.version;w.launchContext=Object.freeze({version:1,storage:c.storage||'mirror',path:target,owner,sha256:result.sha256});w.title=target.split('/').pop()+' — Pico Simulator';watch(c,target); changed = changeSerial !== atSnapshot; tell(result.status==='conflict'?'Saved locally with a conflict. Resolve it in Files.':changed ? 'Saved earlier flash changes; newer changes are unsaved.' : c.storage==='temporary' ? 'Project saved in this tab.' : 'Project saved on this device; syncing with the server.'); } catch (e) { tell(e.message); } finally { saving = false; } }
  async function halt() { openEpoch++;const boardGeneration=generation,firmware=bridgeMode;try { const copy=firmware?await snapshot({halt:true}):null; if(!valid()||generation!==boardGeneration)return; if(copy)flash=copy; stop(); tell(flashUncertain?'Board stopped. Recover firmware flash before saving.':'Board stopped. Save the project to keep flash changes.'); } catch(e) { if(valid()&&generation===boardGeneration){if(firmware)workerFailed('firmware','Could not stop safely: '+e.message);else tell(e.message);} } }
  async function resetFlash() { if (!baseline || !rom) { tell('Open a ROM and firmware first.'); return; } if (!await confirmBoard('Erase this board’s simulated flash changes and restore its original firmware?','Reset simulated flash')) return; openEpoch++;stop(); flash = baseline.slice(); recoverFlash(); changed = true; changeSerial++; start('firmware'); }
  function sendBytes(bytes,text='',clear=false) { if (!worker || !bridgeMode) { tell('Start a firmware board before sending serial input.'); return; } if(serialPending){tell('Wait for the previous serial input.');return;}if(bytes.length>256){tell('Serial input is limited to 256 UTF-8 bytes including the newline.');return;}serialPending={id:++serialRequest,text,clear};worker.postMessage({type:'serial',id:serialRequest,bytes}); }
  function send() { const text=input.value;sendBytes(new TextEncoder().encode(text+'\r\n'),text,true); }
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); } });
  toolbar.append(textButton('Run Blink', async () => { if ((changed || bridgeMode) && !await confirmBoard('The running board may have unsaved flash changes. Replace it?','Replace board')) return; if(!valid())return; openEpoch++;clearRecovery();clearWatch();version=null;savedPath=null;state.path=null;state.version=null;w.launchContext=null;changed = false; start('blink'); }), textButton('Open ROM', openRom), textButton('Open UF2', openFirmware), textButton('Open project', () => openProject()), retry, textButton('Run firmware', () => { if (flashUncertain) tell('Recover firmware flash before running: reopen a project, load a UF2, or reset flash.'); else if (!rom || !flash) tell('Open a ROM and firmware first.'); else if (!bridgeMode) {openEpoch++;start('firmware');} }), textButton('Stop', halt), textButton('Reset flash', resetFlash));
  async function chooseFolder(input){if(choosingFolder||saving||!valid())return;choosingFolder=true;const original=input.value,board=generation,epoch=openEpoch,project=savedPath,projectVersion=version,opens={...openSerial};try{const dir=await host.storage.pickFolder({signal:host.signal});if(dir===null||!valid())return;const c=await workspaceMirrorContext();if(!valid()||!c.valid())return;if(input.value!==original||generation!==board||openEpoch!==epoch||savedPath!==project||version!==projectVersion||Object.keys(opens).some(k=>opens[k]!==openSerial[k])){tell('The destination or board changed while choosing a folder. Choose again.');return;}input.value=c.path((dir==='/'?'':dir)+'/'+c.name(original.split('/').pop()));}catch(e){tell(e.message);}finally{choosingFolder=false;}}
  async function folder(){return chooseFolder(path);}
  const serialPath=host.ui.appInput('Pico serial output save path','/Pico-serial.txt');
  async function serialFolder(){return chooseFolder(serialPath);}
  async function saveSerial(){if(saving||choosingFolder||!valid())return;const output=serial.textContent,target=serialPath.value,atGeneration=generation;if(!output){tell('No serial output to save yet.');return;}saving=true;try{const c=await workspaceMirrorContext(),p=c.path(target);if(!/\.txt$/i.test(p))throw Error('Use a .txt filename for serial output.');let expected=null;try{const old=await c.files.stat(p);if(old.status==='conflict')throw Error('Resolve this file conflict in Files first.');if(!await host.ui.confirm('Replace the existing serial output '+p+'?',{title:'Replace serial output',confirmLabel:'Replace',cancelLabel:'Cancel',danger:true,signal:host.signal})){tell('Serial output save cancelled.');return;}expected=old.version;}catch(e){if(e.message!=='File not found.')throw e;}if(!valid()||!c.valid())return;const result=await c.files.write(p,output,expected);if(!valid()||!c.valid())return;watchOutput(c,p,result.version);const unchanged=generation===atGeneration&&serial.textContent===output;tell(result.status==='conflict'?'Serial output saved locally with a conflict. '+(!unchanged?'The current monitor has changed. ':'')+'Resolve the copies in Files.':unchanged?'Saved visible serial output to '+p+(c.storage==='temporary'?' in this tab.':' on this device; syncing with the server.'):'Saved earlier serial output to '+p+'; the current monitor has changed.');}catch(e){tell('Could not save serial output: '+e.message);}finally{saving=false;}}
  const savebar = make('div', 'pico-toolbar'); savebar.append(path, textButton('Choose folder', folder), textButton('Save project', saveProject));
  const serialLatest=textButton('Jump to latest',()=>{followSerial=true;serialLatest.disabled=true;serial.scrollTop=serial.scrollHeight;});serialLatest.disabled=true;serial.addEventListener('scroll',()=>{followSerial=serial.scrollHeight-serial.clientHeight-serial.scrollTop<=8;serialLatest.disabled=followSerial;},{signal:host.signal});
  const serialbar = make('div', 'pico-toolbar'); serialbar.append(input, textButton('Send', send),textButton('Ctrl+C',()=>sendBytes(new Uint8Array([3]))),textButton('Ctrl+D',()=>sendBytes(new Uint8Array([4]))),serialLatest,textButton('Save serial output',saveSerial));
  const serialDetails=document.createElement('details'),serialLocation=make('div','pico-toolbar');serialDetails.append(make('summary','','Serial output save location'),serialLocation);serialLocation.append(serialPath,textButton('Choose serial output folder',serialFolder));
  const serialNote=make('p','pico-note','Serial text uses UTF-8; firmware may accept only ASCII. Queued input may not have been read yet.');
  const lesson=make('p','pico-note pico-lesson','Try the example: select Run Blink, watch the onboard LED and its on/off label change, then select Stop. This runs RP2040 instructions in a simulated board; its blinking speed is not a physical timing measurement. Blink needs no ROM and cannot be saved as a project.');
  body.append(toolbar, note, lesson, failureWarning, stage, savebar,fileWarning, make('h3', '', 'Serial console'),serialInfo,serialWarning, serial, serialbar, serialDetails,serialNote, status);
  if(host.commands){
    const ready=()=>{if(!valid()||!body.isConnected)throw Error('The simulator window is closed.');};
    const argsFor=(args,keys)=>{if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!keys.includes(k)))throw Error('Invalid command arguments.');};
    const inspect=host.commands.register({id:'inspect',description:'Inspect the simulated Pico board and flash state.',parameters:{type:'object',additionalProperties:false}},args=>{ready();argsFor(args,[]);return {mode:worker?(bridgeMode?'firmware':'blink'):'stopped',led:!!led.value,romLoaded:!!rom,flashLoaded:!!flash,flashChanged:changed,flashUncertain,path:savedPath,status:status.textContent,fileNotice:fileWarning.hidden?'':fileWarning.textContent,note:'Simulated board only; timing and electrical behavior are not hardware validation.'};});host.onDispose(inspect);
    const read=host.commands.register({id:'read-serial',description:'Read the most recent retained simulated serial output.',parameters:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:4096}},additionalProperties:false}},args=>{ready();argsFor(args,['limit']);const limit=args.limit??1024;if(!Number.isSafeInteger(limit)||limit<1||limit>4096)throw Error('Invalid serial text limit.');const text=serial.textContent;let result=text.slice(-limit),truncated=text.length>limit||serialInfo.textContent.startsWith('Earlier serial output was trimmed');if(/^[\uDC00-\uDFFF]/.test(result)){result=result.slice(1);truncated=true;}return {text:result,truncated,mode:worker?(bridgeMode?'firmware':'blink'):'stopped',note:'Only the currently retained serial output is available.'};});host.onDispose(read);
  }
  const launch=w.launchContext;
  if(['mirror','temporary'].includes(launch?.storage)&&launch.owner===owner) {
    queueMicrotask(()=>openProject(launch.path,{initialLoad:true,expectedSHA:launch.sha256}));
  }
  return { element: body, dispose() { disposed = true;clearWatch();clearOutputWatch(); openEpoch++;delete state.hasChanges; stop(); } };
}
