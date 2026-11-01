# Pico Simulator — experimental

This separate app runs RP2040 machine code locally in a worker. **Run Blink**
needs no ROM and displays GPIO 25 through a Wokwi LED. Each window owns its
board and worker; closing it stops the worker.

For MicroPython, first put your own 16 KiB RP2040 B1 ROM binary and Pico UF2
firmware in My files. Choose **Open ROM**, then **Open UF2**. The app executes
the firmware and provides a USB serial command line. The emulator supports a
subset of Pico hardware; firmware and peripheral compatibility are not general.
No ROM or MicroPython firmware is distributed with this app.

ROM and UF2 may be opened in either order; the board starts once both are
loaded. The serial console sends UTF-8 text plus CR/LF and provides Ctrl+C and
Ctrl+D for MicroPython. Each send is limited to 256 bytes including CR/LF;
input remains in the field if the device is not ready or its USB buffer is
full. A queued command may not have been consumed by the firmware yet. The
tested MicroPython 1.20 interactive REPL dropped non-ASCII input, so use Python
escape sequences for those characters; UTF-8 output is decoded across USB
packets. Firmware and device behavior can differ. **Save serial output** writes the visible decoded text to a `.txt` file in My files, where Text can reopen it. The monitor keeps a maximum of 65,536 UTF-16 code units and warns when older output is trimmed; running or restarting a board clears it. This is a visible text snapshot, not a complete raw-byte or timestamped log.

UF2 file containers are rejected rather than interpreted as flash firmware;
the current simulated board remains open. Ordinary non-flash metadata blocks
in a firmware UF2 continue to be ignored.

Enter used to finish an input-method composition is left to the keyboard; it
does not send the serial command. Press Enter again after composition finishes
or select **Send**. The app still cannot guarantee that a particular firmware
accepts non-ASCII input.

**Save project** saves the ROM, current 2 MiB simulated flash, and original
firmware flash in one `.pico` file in My files. It saves to browser storage
first; the existing account service synchronizes that file to the server.
Save is explicit, not automatic. Open the project again after a reload, including directly from Files, to
restart the board with the saved flash; CPU execution and serial session state
are not restored. Each window has independent in-memory state. Two windows can open the same project; an out-of-date save is rejected so the newer copy is not overwritten. A folder picker and replacement confirmation are available. Closing or replacing a running firmware board warns because it may have flash changes not yet captured.
**Reset flash** discards that window's simulated flash changes and starts the
original firmware; save afterward to retain the reset. These files are user
account data, not the temporary v86 Linux filesystem.

The SPI bridge is an intentionally incomplete approximation of the RP2040 SSI
and SPI NOR protocol: writes are immediate and busy timing, full QSPI behavior,
and arbitrary firmware compatibility are not modeled. The approach incorporates
the QSPI and GPIO findings in the MIT-licensed upstream rp2040js proposals
[#155](https://github.com/wokwi/rp2040js/pull/155) and
[#156](https://github.com/wokwi/rp2040js/pull/156), tested at commit
`d18c7cde940adf58e5384b8bb780519c4832525c`. The app uses the pinned released
`rp2040js` dependency and its own partial bridge, not the unmerged fork.

If a firmware worker fails unexpectedly, its latest flash changes may be lost.
The app warns and blocks saving or restarting the stale in-memory snapshot.
Reopen a saved project, load a UF2, or confirm Reset flash to recover. Reset
uses the original firmware image, not the last saved flash. This warning does
not imply that unsaved changes were recovered.

## Tests and build

From this folder, run `npm ci --ignore-scripts` and `npm test`. This checks
UF2 and project validation, actual RP2040 instruction execution, flash
register programming and erase, and all-or-nothing serial buffer admission.
`examples/blink.S` is the Blink source;
`examples/blink.mjs` contains the matching 44 machine-code bytes.

`test-micropython.mjs` is a separate real-firmware test. Supply a private
upstream-compatible B1 bootrom module exporting `bootromB1` (a Uint32Array)
and a Pico MicroPython UF2:

```
node test-micropython.mjs /absolute/path/bootrom.mjs /absolute/path/firmware.uf2
```

With MicroPython 1.20 it formatted blank simulated flash, wrote and read a
file. A fresh emulator restored the saved filesystem and read the same file.
The bundled browser app also passed a save/reload/read, two independent-window,
and single-window-reset test in a browser storage harness. A separate isolated
actual desktop and account-server test saved and synced the project, reopened
it in a fresh phone-sized Chrome context, read the file, and verified worker
termination on close. That is viewport emulation, not a physical-phone test.

The repeatable actual-server test is `tests/pico-account-browser.test.mjs`
from the SIMPLIFIED root. It requires a loopback-only isolated preview with
this app built under the `arduino-simulator` test alias, a Chromium debugging
endpoint on port 19255, and private `PICO_TEST_ROM` (16 KiB binary) and
`PICO_TEST_UF2` file paths. It creates a test account in that isolated preview;
remove the isolated account data when finished. No shared catalog or live
site needs to be changed to run it.

## ROM distribution

The investigated B1 ROM source identifies revision
`00a4a19114195e20fb817bdfbca1165e157eef37` in the upstream rp2040js demo.
[Raspberry Pi's boot ROM license](https://github.com/raspberrypi/pico-bootrom/blob/00a4a19114195e20fb817bdfbca1165e157eef37/LICENSE.TXT)
excludes its floating-point library from the rest of the ROM's BSD terms.
[That library's notice](https://github.com/raspberrypi/pico-bootrom/blob/00a4a19114195e20fb817bdfbca1165e157eef37/bootrom/mufplib.S)
offers a physical-RP2040-only license or GPLv2. Do not bundle a ROM until its
exact binary/source match, applicable GPLv2 terms, corresponding source,
notices and reproducible distribution have been reviewed. The MIT-licensed
rp2040js and Wokwi Elements dependency licenses are included by the app builder.

Local real-firmware account tests checked both ROM/UF2 loading orders, serial commands, Ctrl+C and Ctrl+D, rejected overlong input, invalid-project recovery, close warnings, competing saves, and reopening through Files in a fresh phone-sized session. The live test uses only the bundled Blink example; private ROM and firmware test fixtures are not uploaded to the live site. Physical touch and arbitrary firmware compatibility remain unverified.

A newer open of the same file type or a board-control action supersedes an earlier pending open. Complementary ROM and UF2 selections can finish together; opening a project supersedes both. Overwriting a project checks its version using file metadata before writing instead of reading the full existing project. `tests/pico-open-race.test.mjs` checks these paths with the real local account mirror, synthetic UF2/ROM bytes and a fake Pico worker; it also checks sync, stale-save refusal and window cleanup. This is a file-workflow test, not a firmware-emulation test.

Project saves capture their destination before requesting the flash snapshot. A separate notice reports when My files detects the saved project has changed, is unavailable, or has conflicting copies; the running board stays open. Resolve conflicts in Files or save a separate copy. Detection depends on mirror synchronization. Local desktop, emulated-phone and 4K and live emulated-phone account tests used synthetic project data and a fake worker to test delayed snapshots, conflicts and recovery; a separate real Blink worker check passed locally and live. These checks do not establish arbitrary firmware compatibility.

After a serial-output save, a separate notice reports if synchronization finds that the saved text changed, was removed, or has conflicting copies; resolve conflicts in Files. An immediate conflict is reported in the save status. **Run Blink** clears the previous project association, so restoring the window does not reopen an unrelated saved project. Local desktop, emulated-phone and 4K and live emulated-phone tests used simulated serial messages to check an actual two-session file conflict, the visible notice, recovery and layout association. A separate live and local phone-sized test ran the real Blink worker; physical touch and arbitrary firmware remain unverified.

Board replacement, simulated-flash reset, project overwrite and serial-output overwrite use desktop confirmations. Cancelling leaves the current board or saved file intact. If the board changes while a replacement confirmation is open, the action stops; if the file changes while an overwrite confirmation is open, it is not overwritten. These checks describe the simulated board and do not validate physical hardware.

The local serial-monitor candidate follows new output until the user scrolls up;
incoming text then leaves the scroll position alone. **Jump to latest** resumes
following, and scrolling to the bottom also resumes it. Restarting a board
clears the monitor and follows again. The most-recent-output limit still applies,
so old text can be removed from the buffer while it is being read. Local
desktop, emulated-phone and 4K tests use simulated serial packets with real
account storage; they exercise mouse-wheel, keyboard or emulated-touch scrolling, resume,
snapshot synchronization and worker cleanup. A separate phone-sized test ran
the actual bundled Blink worker; physical touch and real-firmware serial behavior
were not tested for this change. The previous monitor jumped to the bottom in
a negative-control test. A public phone-sized check also passed.

The local pending-save candidate asks before closing while a project or serial
snapshot save is in progress. Desktop, emulated-phone and 4K checks used real
account storage and simulated board data; a separate phone-sized Blink check
used the real worker. An already-dispatched write may still finish after close.

UF2 blocks that write different bytes to the same flash address are rejected
without replacing the running board; identical overlapping bytes are accepted.
This prevents file order from silently changing the firmware image. This check
does not establish firmware completeness or hardware compatibility.

When UF2 blocks declare a nonzero total, all numbered blocks must be present
exactly once with a consistent total; order does not matter. Files whose
blocks all omit the total remain accepted for compatibility, but their
completeness cannot be checked this way. These checks do not verify firmware
functionality or all corruption.

The desktop restores the most recently opened or saved `.pico` project after a
refresh. If the initial project is missing or invalid, the stale association is
cleared and the original file is left unchanged. Local desktop and emulated-phone
project-switch/recovery tests use synthetic ROM and flash with a fake worker;
a separate phone-sized test runs the real Blink worker. These checks do not
validate physical hardware or arbitrary firmware.

If a restored project encounters a storage conflict, temporary read failure or
an invalid account context, its desktop reference is retained for recovery.
A confirmed missing or invalid project still clears the stale reference without
changing the file. Local account tests inject these failures; they do not
establish behavior for every outage or firmware image.

For supported SPI page-program commands, data beyond 256 bytes wraps within
that page and replaces earlier buffered bytes, matching the W25Q16 page-program
behavior. Programming still only clears bits until an erase. Register-level
and flash-model tests cover wraparound; the bridge remains a partial SPI/QSPI
approximation and is not a complete Pico hardware model. See the
[W25Q16DV datasheet](https://content.arduino.cc/assets/Winbond_w25q16dv.pdf).

The project and serial-output folder choosers reject late selections if the
filename, selected project, pending open operation or board changes while the
chooser is open. Only one folder chooser is active at a time, and saving waits
until it closes. Local registered-account desktop and emulated-phone tests
cover changed filenames and board state, serial save/sync and window cleanup;
the test uses simulated worker messages and does not validate real firmware or
physical touch.
