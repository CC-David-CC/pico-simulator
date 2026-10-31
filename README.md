# Pico Simulator — experimental

This separate app runs RP2040 machine code locally in a worker. **Run Blink**
needs no ROM and displays GPIO 25 through a Wokwi LED. Each window owns its
board and worker; closing it stops the worker.

For MicroPython, first put your own 16 KiB RP2040 B1 ROM binary and Pico UF2
firmware in My files. Choose **Open ROM**, then **Open UF2**. The app executes
the firmware and provides a USB serial command line. The emulator supports a
subset of Pico hardware; firmware and peripheral compatibility are not general.
No ROM or MicroPython firmware is distributed with this app.

**Save project** saves the ROM, current 2 MiB simulated flash, and original
firmware flash in one `.pico` file in My files. It saves to browser storage
first; the existing account service synchronizes that file to the server.
Save is explicit, not automatic. Open the project again after a reload to
restart the board with the saved flash; CPU execution and serial session state
are not restored. Each window has independent in-memory state. Two windows can
open the same project, but a conflicting save must be resolved in Files.
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

## Tests and build

From this folder, run `npm ci --ignore-scripts` and `npm test`. This checks
UF2 and project validation, actual RP2040 instruction execution, and flash
register programming and erase. `examples/blink.S` is the Blink source;
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
