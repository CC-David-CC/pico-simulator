/* Direct SRAM entry on Cortex-M0+. Light GPIO25 when the driven GPIO2 is low. */
.syntax unified
.cpu cortex-m0plus
.thumb
.global _start
_start:
    movs r1, #5             /* Select SIO for both pins */
    ldr r0, =0x40014014     /* IO_BANK0.GPIO2_CTRL */
    str r1, [r0]
    ldr r0, =0x400140cc     /* IO_BANK0.GPIO25_CTRL */
    str r1, [r0]
    ldr r0, =0x4001e00c     /* PADS_BANK0.GPIO2 atomic SET alias */
    movs r1, #0x40          /* Enable input buffer */
    str r1, [r0]
    ldr r0, =0xd0000000     /* SIO base; GP2 stays an input after reset */
    movs r1, #1
    lsls r1, r1, #25
    str r1, [r0, #0x24]     /* GPIO_OE_SET for GP25 */
    movs r2, #4             /* GP2 mask */
sample:
    ldr r3, [r0, #0x04]     /* GPIO_IN */
    tst r3, r2
    bne high
    str r1, [r0, #0x14]     /* Low input: GPIO_OUT_SET */
    b sample
high:
    str r1, [r0, #0x18]     /* High input: GPIO_OUT_CLR */
    b sample
    .ltorg
