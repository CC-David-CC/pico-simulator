/* RP2040 GPIO25 blink, runs directly from SRAM without a boot ROM. */
.syntax unified
.cpu cortex-m0plus
.thumb
.global _start
_start:
    ldr r0, =0x400140cc /* GPIO25 control */
    movs r1, #5         /* SIO function */
    str r1, [r0]
    ldr r0, =0xd0000024 /* SIO GPIO output enable set */
    movs r1, #1
    lsls r1, #25
    str r1, [r0]
    ldr r0, =0xd000001c /* SIO GPIO output XOR */
loop:
    str r1, [r0]
    ldr r2, =125000
wait:
    subs r2, #1
    bne wait
    b loop
