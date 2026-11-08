#ifndef _E95_RUNTIME_HOST_AVR_INTERRUPT_H
#define _E95_RUNTIME_HOST_AVR_INTERRUPT_H
// Host stand-in for `avr/interrupt.h`. The `ISR` macro keeps the real shape
// (an `extern "C"` function with external visibility) so the emitted handlers
// compile exactly where the device would place them. The vector names map to
// plain host functions, which a test can call to simulate a compare match or a
// pin change.
#define ISR(vector) extern "C" void vector(void) __attribute__((used)); void vector(void)

#define TIMER0_COMPA_vect e95_timer0_compare_a_interrupt
#define TIMER1_COMPA_vect e95_timer1_compare_a_interrupt
#define TIMER2_COMPA_vect e95_timer2_compare_a_interrupt
#define PCINT0_vect e95_pcint0_interrupt
#define PCINT1_vect e95_pcint1_interrupt
#define PCINT2_vect e95_pcint2_interrupt

// The device defines these as compiler intrinsics; on the host the interrupt
// flag is part of the stand-in `SREG` variable, so both are no-ops.
inline void cli() {}
inline void sei() {}

#endif
