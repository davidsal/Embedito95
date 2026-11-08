// Per-counter register/vector map for the ATmega328P. The definition is data,
// not a branch: every timer goes through the same generators, so adding or
// removing one from `timers.available` only changes the entries in play.

export const AVR_TIMER_DEFINITIONS = {
	TIMER_0: {
		maximumTicks: "MAXIMUM_TICKS_8_BIT",
		counterRegister: "TCNT0",
		compareRegister: "OCR0A",
		compareCast: "u8",
		interruptMaskRegister: "TIMSK0",
		interruptFlagRegister: "TIFR0",
		compareInterruptBit: "OCIE0A",
		compareFlagBit: "OCF0A",
		modeRegister: "TCCR0A",
		modeBit: "WGM01",
		prescalerRegister: "TCCR0B",
		companionRegister: null,
		compareVector: "TIMER0_COMPA_vect",
		callbackVariable: "timer0Callback",
		toneVariable: "timer0TonePin",
		functionSuffix: "Timer0",
	},
	TIMER_1: {
		maximumTicks: "MAXIMUM_TICKS_16_BIT",
		counterRegister: "TCNT1",
		compareRegister: "OCR1A",
		compareCast: "u16",
		interruptMaskRegister: "TIMSK1",
		interruptFlagRegister: "TIFR1",
		compareInterruptBit: "OCIE1A",
		compareFlagBit: "OCF1A",
		modeRegister: "TCCR1B",
		modeBit: "WGM12",
		prescalerRegister: "TCCR1B",
		companionRegister: "TCCR1A",
		compareVector: "TIMER1_COMPA_vect",
		callbackVariable: "timer1Callback",
		toneVariable: "timer1TonePin",
		functionSuffix: "Timer1",
	},
	TIMER_2: {
		maximumTicks: "MAXIMUM_TICKS_8_BIT",
		counterRegister: "TCNT2",
		compareRegister: "OCR2A",
		compareCast: "u8",
		interruptMaskRegister: "TIMSK2",
		interruptFlagRegister: "TIFR2",
		compareInterruptBit: "OCIE2A",
		compareFlagBit: "OCF2A",
		modeRegister: "TCCR2A",
		modeBit: "WGM21",
		prescalerRegister: "TCCR2B",
		companionRegister: null,
		compareVector: "TIMER2_COMPA_vect",
		callbackVariable: "timer2Callback",
		toneVariable: "timer2TonePin",
		functionSuffix: "Timer2",
	},
};

export const resolveTimerDefinition = (entry) => {
	return AVR_TIMER_DEFINITIONS[entry?.name] ?? null;
};

export const listTimerEntries = (timers) => {
	return (timers?.available ?? []).filter((entry) => {
		return (
			entry?.name &&
			entry?.number !== undefined &&
			entry?.number !== null &&
			!entry.reservedByMillis &&
			resolveTimerDefinition(entry) !== null
		);
	});
};
