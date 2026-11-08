#ifndef _E95_RUNTIME_HOST_AVR_IO_H
#define _E95_RUNTIME_HOST_AVR_IO_H
// Host stand-in for the ATmega328P register surface used by the real arduino
// timer header. The names, widths and bit positions mirror `avr/iom328p.h`:
// the 16-bit Timer1 registers are `uint16_t`, the 8-bit Timer0/Timer2
// registers are `uint8_t`, and the clock-select/waveform/interrupt bits keep
// their datasheet values. On the host the memory-mapped registers become
// volatile variables so a test can observe what the driver wrote.
#include <stdint.h>

#define F_CPU 16000000UL

#define _BV(bit) (1 << (bit))

// Timer/Counter clock-select bits (datasheet 15.9.2 / 17.9.2 / 18.9.2).
#define CS10 0
#define CS11 1
#define CS12 2

// Waveform generation mode bits.
#define WGM01 1
#define WGM21 1
#define WGM11 1
#define WGM12 3
#define WGM13 4

// Timer1 compare output mode bits (datasheet 15.9.1): COM1A1/COM1A0 select the
// OCR1A compare output mode, COM1B1/COM1B0 the OCR1B one. The positions mirror
// `avr/iom328p.h` (COM1A0 = 6, COM1A1 = 7, COM1B0 = 4, COM1B1 = 5).
#define COM1A0 6
#define COM1A1 7
#define COM1B0 4
#define COM1B1 5

// Output compare interrupt enable/flag bits.
#define OCIE0A 1
#define OCIE1A 1
#define OCIE2A 1
#define OCF0A 1
#define OCF1A 1
#define OCF2A 1

extern volatile uint8_t TCCR0A;
extern volatile uint8_t TCCR0B;
extern volatile uint8_t TCNT0;
extern volatile uint8_t OCR0A;
extern volatile uint8_t TIMSK0;
extern volatile uint8_t TIFR0;

extern volatile uint8_t TCCR1A;
extern volatile uint8_t TCCR1B;
extern volatile uint16_t TCNT1;
extern volatile uint16_t OCR1A;
extern volatile uint16_t OCR1B;
extern volatile uint16_t ICR1;
extern volatile uint8_t TIMSK1;
extern volatile uint8_t TIFR1;

extern volatile uint8_t TCCR2A;
extern volatile uint8_t TCCR2B;
extern volatile uint8_t TCNT2;
extern volatile uint8_t OCR2A;
extern volatile uint8_t TIMSK2;
extern volatile uint8_t TIFR2;

// EEPROM surface (datasheet section 8 and `avr/iom328p.h` lines 180-212):
// EECR at 0x1F holds EERE/EEPE/EEMPE/EERIE, EEDR at 0x20 holds the data byte,
// and EEARH:EEARL at 0x22:0x21 hold the 10-bit address. The control register is
// modelled as a small object on the host so a write to EERE can deliver the
// addressed cell into EEDR and a write to EEPE can complete the store, exactly
// the side effects the real peripheral performs.
#define EERE 0
#define EEPE 1
#define EEMPE 2
#define EERIE 3

// Host model of the EEPE "busy" flag: on the device a program cycle completes
// asynchronously and clears EEPE. A test seeds `eepromHostBusyPollsRemaining`
// to keep EEPE set for a number of reads, so `waitForReady()` can be observed
// spinning; the final read clears the flag and lets the driver continue.
inline uint32_t eepromHostBusyPollsRemaining = 0;
inline uint32_t eepromHostControlRegisterReadCount = 0;

class EepromControlRegister {
public:
	// `bits` is mutable so the const read operator can model the peripheral
	// clearing EEPE when a seeded busy period elapses.
	mutable uint8_t bits;

	volatile EepromControlRegister &operator=(uint8_t value) volatile {
		bits = value;
		return *this;
	}

	operator uint8_t() const volatile {
		eepromHostControlRegisterReadCount++;
		if (eepromHostBusyPollsRemaining > 0) {
			eepromHostBusyPollsRemaining--;
			if (eepromHostBusyPollsRemaining == 0) {
				bits = (uint8_t)(bits & (uint8_t)~_BV(EEPE));
			}
		}
		return bits;
	}

	volatile EepromControlRegister &operator|=(uint8_t mask) volatile;
	volatile EepromControlRegister &operator&=(uint8_t mask) volatile {
		bits = (uint8_t)(bits & mask);
		return *this;
	}
};

extern volatile EepromControlRegister EECR;
extern volatile uint8_t EEDR;
extern volatile uint8_t EEARL;
extern volatile uint8_t EEARH;

// Status register (avr/common.h): only the global interrupt flag is used by the
// EEPROM write sequence.
#define SREG_I 7
extern volatile uint8_t SREG;

// Port registers used by the software-serial driver. The names, widths and bit
// positions mirror `avr/iom328p.h` (PINB/DDRB/PORTB at 0x03/0x04/0x05,
// PINC/DDRC/PORTC at 0x06/0x07/0x08, PIND/DDRD/PORTD at 0x09/0x0A/0x0B).
extern volatile uint8_t PINB;
extern volatile uint8_t DDRB;
extern volatile uint8_t PORTB;
extern volatile uint8_t PINC;
extern volatile uint8_t DDRC;
extern volatile uint8_t PORTC;
extern volatile uint8_t PIND;
extern volatile uint8_t DDRD;
extern volatile uint8_t PORTD;

// Pin-change interrupt registers (avr/iom328p.h): PCIFR at 0x1B, PCICR at
// 0x68 and PCMSK0/PCMSK1/PCMSK2 at 0x6B/0x6C/0x6D. The enable bits are PCIE0
// (port B), PCIE1 (port C) and PCIE2 (port D).
#define PCIE0 0
#define PCIE1 1
#define PCIE2 2
extern volatile uint8_t PCIFR;
extern volatile uint8_t PCICR;
extern volatile uint8_t PCMSK0;
extern volatile uint8_t PCMSK1;
extern volatile uint8_t PCMSK2;

#endif
