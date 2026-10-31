# Pico Simulator — in development

The SPI NOR model implements a tested starting subset of the Pico's external
flash protocol. It is **not connected to RP2040js SSI**, and this folder is not
a working or launchable simulator yet. GPIO, firmware loading, serial REPL,
SSI integration, realistic busy timing, durable flash storage and real
MicroPython write/read tests remain to be implemented. The flash model does not
claim full chip compatibility or arbitrary firmware support.
