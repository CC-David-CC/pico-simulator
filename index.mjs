import '@wokwi/elements/dist/esm/led-element.js';
import './style.css';
import { parseUF2, encodeProject, decodeProject, ROM_SIZE } from './project.mjs';

export function mount(host) {
  const { make, textButton } = host.ui, { mirrorFileContext, signedInSubject } = host.storage;
  const owner = signedInSubject(), body = make('div', 'window-content pico-simulator');
  const toolbar = make('div', 'pico-toolbar'), status = make('p', 'pico-status', 'Ready to run the Blink example.');
  const stage = make('div', 'pico-stage'), led = document.createElement('wokwi-led');
  led.color = 'green'; led.label = 'GPIO 25'; led.value = false;
  stage.append(led, make('span', '', 'Pico onboard LED (GPIO 25)'));
  const serial = make('pre', 'pico-serial'); serial.setAttribute('aria-label', 'Pico serial output');
  const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Serial command'; input.setAttribute('aria-label', 'Pico serial command');
  const path = document.createElement('input'); path.value = '/Pico-' + crypto.randomUUID() + '.pico'; path.setAttribute('aria-label', 'Pico project path');
  const note = make('p', 'pico-note', 'Blink runs locally. To use firmware, open your own 16 KiB RP2040 B1 ROM and Pico UF2 from My files. Save a project to retain simulated flash; opening it restarts the board.');
  let worker = null, generation = 0, disposed = false, bridgeMode = false, rom = null, flash = null, baseline = null, version = null, savedPath = null, changed = false, changeSerial = 0, saving = false, request = 0;
  const pending = new Map();
  const valid = () => !disposed && !host.signal.aborted && owner === signedInSubject();
  const tell = value => { if (valid()) status.textContent = value; };
  function stop() { generation++; worker?.terminate(); worker = null; bridgeMode = false; led.value = false; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Board stopped.')); } pending.clear(); }
  function start(mode) {
    stop(); const current = generation;
    worker = new Worker(new URL('./workers/pico.mjs', import.meta.url), { type: 'module' }); bridgeMode = mode === 'firmware'; serial.textContent = '';
    worker.onmessage = event => {
      if (!valid() || current !== generation) return;
      const m = event.data;
      if (m.type === 'led') led.value = m.on;
      else if (m.type === 'started') tell(mode === 'firmware' ? 'Running firmware locally. Save the project to keep flash changes.' : 'Running the Blink example locally.');
      else if (m.type === 'serial') { serial.textContent = (serial.textContent + m.text).slice(-65536); serial.scrollTop = serial.scrollHeight; }
      else if (m.type === 'flash-changed') { changed = true; changeSerial++; }
      else if (m.type === 'snapshot') { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); p.resolve(new Uint8Array(m.bytes)); } }
      else if (m.type === 'error') { stop(); tell('Simulator stopped: ' + m.message); }
    };
    worker.onerror = () => { if (current === generation && valid()) { stop(); tell('Simulator worker could not start.'); } };
    worker.postMessage(mode === 'blink' ? { type: 'blink' } : { type: 'firmware', rom, flash });
  }
  async function snapshot() {
    if (!worker || !bridgeMode) return flash;
    return new Promise((resolve, reject) => { const id = ++request; const timer = setTimeout(() => { pending.delete(id); reject(Error('Board did not respond.')); }, 10000); pending.set(id, { resolve, reject, timer }); worker.postMessage({ type: 'snapshot', id }); });
  }
  async function pick(extensions) {
    const selected = await host.storage.pickFile({ extensions, signal: host.signal }); if (!selected || !valid()) return null;
    const c = await mirrorFileContext(), f = await c.files.read(selected);
    if (!valid() || !c.valid()) return null;
    if (f.status === 'conflict') throw Error('Resolve this file conflict in Files first.');
    return { path: selected, data: new Uint8Array(f.data), version: f.version };
  }
  async function openRom() { try { const f = await pick(['.bin']); if (!f) return; if (f.data.length !== ROM_SIZE) throw Error('ROM must be exactly 16 KiB.'); if (changed && !confirm('Discard unsaved board changes?')) return; stop(); rom = f.data; changed = true; changeSerial++; tell('ROM loaded. Open a Pico UF2 next.'); } catch (e) { tell(e.message); } }
  async function openFirmware() { try { const f = await pick(['.uf2']); if (!f) return; const newFlash = parseUF2(f.data); if (changed && !confirm('Discard unsaved board changes?')) return; stop(); flash = newFlash; baseline = newFlash.slice(); version = null; savedPath = null; changed = true; changeSerial++; if (rom) start('firmware'); else tell('Firmware loaded. Open your RP2040 B1 ROM to run it.'); } catch (e) { tell(e.message); } }
  async function openProject() { try { const f = await pick(['.pico']); if (!f) return; const project = decodeProject(f.data); if (changed && !confirm('Discard unsaved board changes?')) return; stop(); ({ rom, flash, baseline } = project); savedPath = f.path; path.value = f.path; version = f.version; changed = false; start('firmware'); } catch (e) { tell(e.message); } }
  async function saveProject() { if (saving) return; saving = true; try { if (!rom || !flash || !baseline) throw Error('Open a ROM and firmware first.'); const copy = await snapshot(); const atSnapshot = changeSerial; if (!valid()) return; const c = await mirrorFileContext(), target = c.path(path.value); if (!/\.pico$/i.test(target)) throw Error('Project names must end in .pico.'); const data = encodeProject(rom, copy, baseline); const result = await c.files.write(target, data, target === savedPath ? version : null); if (!valid() || !c.valid()) return; flash = copy; savedPath = target; version = result.version; changed = changeSerial !== atSnapshot; tell(changed ? 'Saved earlier flash changes; newer changes are unsaved.' : 'Project saved on this device; syncing with the server.'); } catch (e) { tell(e.message); } finally { saving = false; } }
  async function halt() { try { if (bridgeMode) flash = await snapshot(); stop(); tell('Board stopped. Save the project to keep flash changes.'); } catch(e) { tell(e.message); } }
  function resetFlash() { if (!baseline || !rom) { tell('Open a ROM and firmware first.'); return; } if (!confirm('Erase this board’s simulated flash changes and restore its original firmware?')) return; stop(); flash = baseline.slice(); changed = true; changeSerial++; start('firmware'); }
  function send() { if (!worker || !bridgeMode) { tell('Start a firmware board before sending serial input.'); return; } worker.postMessage({ type: 'serial', text: input.value + '\r\n' }); input.value = ''; }
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  toolbar.append(textButton('Run Blink', () => { if (changed && !confirm('Discard unsaved board changes?')) return; changed = false; start('blink'); }), textButton('Open ROM', openRom), textButton('Open UF2', openFirmware), textButton('Open project', openProject), textButton('Run firmware', () => { if (!rom || !flash) tell('Open a ROM and firmware first.'); else if (!bridgeMode) start('firmware'); }), textButton('Stop', halt), textButton('Reset flash', resetFlash));
  const savebar = make('div', 'pico-toolbar'); savebar.append(path, textButton('Save project', saveProject));
  const serialbar = make('div', 'pico-toolbar'); serialbar.append(input, textButton('Send', send));
  body.append(toolbar, note, stage, savebar, make('h3', '', 'Serial console'), serial, serialbar, status);
  return { element: body, dispose() { disposed = true; stop(); } };
}
