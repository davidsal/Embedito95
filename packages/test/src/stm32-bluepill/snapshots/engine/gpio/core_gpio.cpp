#include "stm32f1xx_ll_bus.h"
#include "stm32f1xx_ll_tim.h"
#include "stm32f1xx_ll_adc.h"
#include "stm32f1xx_ll_rcc.h"
#include "core_gpio.h"

namespace core_gpio {

extern const _e95_PinInfo _e95_PINS[] = {
	{ GPIOA, LL_GPIO_PIN_0 },
	{ GPIOA, LL_GPIO_PIN_1 },
	{ GPIOA, LL_GPIO_PIN_2 },
	{ GPIOA, LL_GPIO_PIN_3 },
	{ GPIOA, LL_GPIO_PIN_4 },
	{ GPIOA, LL_GPIO_PIN_5 },
	{ GPIOA, LL_GPIO_PIN_6 },
	{ GPIOA, LL_GPIO_PIN_7 },
	{ GPIOA, LL_GPIO_PIN_8 },
	{ GPIOA, LL_GPIO_PIN_9 },
	{ GPIOA, LL_GPIO_PIN_10 },
	{ GPIOA, LL_GPIO_PIN_11 },
	{ GPIOA, LL_GPIO_PIN_12 },
	{ GPIOA, LL_GPIO_PIN_13 },
	{ GPIOA, LL_GPIO_PIN_14 },
	{ GPIOA, LL_GPIO_PIN_15 },
	{ GPIOB, LL_GPIO_PIN_0 },
	{ GPIOB, LL_GPIO_PIN_1 },
	{ GPIOB, LL_GPIO_PIN_2 },
	{ GPIOB, LL_GPIO_PIN_3 },
	{ GPIOB, LL_GPIO_PIN_4 },
	{ GPIOB, LL_GPIO_PIN_5 },
	{ GPIOB, LL_GPIO_PIN_6 },
	{ GPIOB, LL_GPIO_PIN_7 },
	{ GPIOB, LL_GPIO_PIN_8 },
	{ GPIOB, LL_GPIO_PIN_9 },
	{ GPIOB, LL_GPIO_PIN_10 },
	{ GPIOB, LL_GPIO_PIN_11 },
	{ GPIOB, LL_GPIO_PIN_12 },
	{ GPIOB, LL_GPIO_PIN_13 },
	{ GPIOB, LL_GPIO_PIN_14 },
	{ GPIOB, LL_GPIO_PIN_15 },
	{ GPIOC, LL_GPIO_PIN_13 },
	{ GPIOC, LL_GPIO_PIN_13 },
	{ GPIOC, LL_GPIO_PIN_14 },
	{ GPIOC, LL_GPIO_PIN_15 },
};

typedef struct {
	Pin pin;
	u8 timerId;
	u8 channel;
} _e95_PwmPin;

typedef struct {
	Pin pin;
	u8 channel;
} _e95_AdcPin;

typedef struct {
	TIM_TypeDef *timer;
	u16 prescaler;
	u16 period;
} _e95_PwmTimerConfig;

static const u8 _e95_ADC_CHANNEL_COUNT = 10;
static const u8 _e95_NO_ADC_CHANNEL = 0xFF;
static const u32 _e95_TIMER_CCMR_VALUE = 0x6868;
static const u8 _e95_ADC_AVERAGE_SAMPLE_COUNT = 7;
static const u32 _e95_ADC_STABILIZE_ITERATIONS = 1000;
static const u8 _e95_SHIFT_BIT_COUNT = 8;
static const u16 _e95_PWM_MAX_PERIOD = 65535;

static u16 _e95_PWM_PINS_CONFIGURED = 0;
static u16 _e95_ADC_CHANNELS_CONFIGURED = 0;

static const _e95_PwmPin _e95_PWM_PINS[] = {
	{ PIN_A0, 2, 1 },
	{ PIN_A1, 2, 2 },
	{ PIN_A2, 2, 3 },
	{ PIN_A3, 2, 4 },
	{ PIN_A6, 3, 1 },
	{ PIN_A7, 3, 2 },
	{ PIN_B0, 3, 3 },
	{ PIN_B1, 3, 4 },
	{ PIN_B6, 4, 1 },
	{ PIN_B7, 4, 2 },
	{ PIN_B8, 4, 3 },
	{ PIN_B9, 4, 4 },
};

static const _e95_AdcPin _e95_ADC_PINS[] = {
	{ PIN_A0, 0 },
	{ PIN_A1, 1 },
	{ PIN_A2, 2 },
	{ PIN_A3, 3 },
	{ PIN_A4, 4 },
	{ PIN_A5, 5 },
	{ PIN_A6, 6 },
	{ PIN_A7, 7 },
	{ PIN_B0, 8 },
	{ PIN_B1, 9 },
};

static const u32 _e95_ADC_CHANNEL_VALUES[_e95_ADC_CHANNEL_COUNT] = {
	LL_ADC_CHANNEL_0,
	LL_ADC_CHANNEL_1,
	LL_ADC_CHANNEL_2,
	LL_ADC_CHANNEL_3,
	LL_ADC_CHANNEL_4,
	LL_ADC_CHANNEL_5,
	LL_ADC_CHANNEL_6,
	LL_ADC_CHANNEL_7,
	LL_ADC_CHANNEL_8,
	LL_ADC_CHANNEL_9,
};

static const _e95_PwmTimerConfig _e95_PWM_TIMER_CONFIGS[] = {
	{ TIM2, 1, 35999 },
	{ TIM3, 1, 35999 },
	{ TIM4, 1, 35999 },
};

static const _e95_PwmPin *_e95_findPwmPin(Pin pin) {
	for (u8 index = 0; index < sizeof(_e95_PWM_PINS) / sizeof(_e95_PWM_PINS[0]); index++) {
		if (pin == _e95_PWM_PINS[index].pin) {
			return &_e95_PWM_PINS[index];
		}
	}
	return nullptr;
}

static u8 _e95_findAdcChannel(Pin pin) {
	for (u8 index = 0; index < sizeof(_e95_ADC_PINS) / sizeof(_e95_ADC_PINS[0]); index++) {
		if (pin == _e95_ADC_PINS[index].pin) {
			return _e95_ADC_PINS[index].channel;
		}
	}
	return _e95_NO_ADC_CHANNEL;
}

typedef struct {
	GPIO_TypeDef *port;
	u32 clock;
} _e95_GpioPortClock;

static const _e95_GpioPortClock _e95_GPIO_PORT_CLOCKS[] = {
	{ GPIOA, LL_APB2_GRP1_PERIPH_GPIOA },
	{ GPIOB, LL_APB2_GRP1_PERIPH_GPIOB },
	{ GPIOC, LL_APB2_GRP1_PERIPH_GPIOC },
};

static void _e95_enableGpioPort(GPIO_TypeDef *port) {
	static u8 enabledPorts = 0;
	static u8 jtagReleased = 0;

	if (!jtagReleased) {
		LL_APB2_GRP1_EnableClock(LL_APB2_GRP1_PERIPH_AFIO);
		SET_BIT(AFIO->MAPR, AFIO_MAPR_SWJ_CFG_JTAGDISABLE);
		jtagReleased = 1;
	}

	for (u8 index = 0; index < sizeof(_e95_GPIO_PORT_CLOCKS) / sizeof(_e95_GPIO_PORT_CLOCKS[0]); index++) {
		if (_e95_GPIO_PORT_CLOCKS[index].port == port) {
			if (!(enabledPorts & (1 << index))) {
				LL_APB2_GRP1_EnableClock(_e95_GPIO_PORT_CLOCKS[index].clock);
				enabledPorts |= (1 << index);
			}
			return;
		}
	}
}

void _e95_setPinAlternate(Pin pin) {
	_e95_enableGpioPort(_e95_pinPort(pin));
	LL_GPIO_SetPinMode(
		_e95_pinPort(pin),
		_e95_pinMask(pin),
		LL_GPIO_MODE_ALTERNATE | LL_GPIO_MODE_OUTPUT_50MHz);
}

typedef struct {
	u8 id;
	TIM_TypeDef *timer;
	u32 clock;
} _e95_PwmTimer;

static const _e95_PwmTimer _e95_PWM_TIMERS[] = {
	{ 2, TIM2, LL_APB1_GRP1_PERIPH_TIM2 },
	{ 3, TIM3, LL_APB1_GRP1_PERIPH_TIM3 },
	{ 4, TIM4, LL_APB1_GRP1_PERIPH_TIM4 },
};

static const _e95_PwmTimer *_e95_findPwmTimer(u8 timerId) {
	for (u8 index = 0; index < sizeof(_e95_PWM_TIMERS) / sizeof(_e95_PWM_TIMERS[0]); index++) {
		if (_e95_PWM_TIMERS[index].id == timerId) {
			return &_e95_PWM_TIMERS[index];
		}
	}
	return nullptr;
}

static void _e95_configurePwmTimer(TIM_TypeDef *timer) {
	u16 prescaler = 0;
	u16 period = _e95_PWM_MAX_PERIOD;

	for (u8 index = 0; index < sizeof(_e95_PWM_TIMER_CONFIGS) / sizeof(_e95_PWM_TIMER_CONFIGS[0]); index++) {
		if (_e95_PWM_TIMER_CONFIGS[index].timer == timer) {
			prescaler = _e95_PWM_TIMER_CONFIGS[index].prescaler;
			period = _e95_PWM_TIMER_CONFIGS[index].period;
			break;
		}
	}

	timer->PSC = prescaler;
	timer->ARR = period;
	timer->CCMR1 = _e95_TIMER_CCMR_VALUE;
	timer->CCMR2 = _e95_TIMER_CCMR_VALUE;
	timer->CCER |= LL_TIM_CHANNEL_CH1 | LL_TIM_CHANNEL_CH2 | LL_TIM_CHANNEL_CH3 | LL_TIM_CHANNEL_CH4;
	timer->EGR = TIM_EGR_UG;
	timer->CR1 |= TIM_CR1_CEN;
}

static void _e95_enablePwm(const _e95_PwmPin *entry) {
	static u8 enabledTimers = 0;

	const _e95_PwmTimer *timer = _e95_findPwmTimer(entry->timerId);
	if (!timer) {
		return;
	}

	if (!(enabledTimers & (1 << entry->timerId))) {
		LL_APB1_GRP1_EnableClock(timer->clock);
		_e95_configurePwmTimer(timer->timer);
		enabledTimers |= (1 << entry->timerId);
	}
	LL_GPIO_SetPinMode(
		_e95_pinPort(entry->pin),
		_e95_pinMask(entry->pin),
		LL_GPIO_MODE_ALTERNATE | LL_GPIO_MODE_OUTPUT_50MHz);
}

static void _e95_stabilizeAdcClock(void) {
	volatile u32 counter = _e95_ADC_STABILIZE_ITERATIONS;
	while (counter > 0) {
		counter--;
	}
}

static void _e95_initializeAdc() {
	static u8 adcInitialized = 0;

	if (adcInitialized) {
		return;
	}

	LL_APB2_GRP1_EnableClock(LL_APB2_GRP1_PERIPH_ADC1);
	LL_RCC_SetADCClockSource(LL_RCC_ADC_CLKSRC_PCLK2_DIV_6);
	LL_ADC_SetDataAlignment(ADC1, LL_ADC_DATA_ALIGN_RIGHT);
	LL_ADC_REG_SetTriggerSource(ADC1, LL_ADC_REG_TRIG_SOFTWARE);
	LL_ADC_REG_SetSequencerLength(ADC1, LL_ADC_REG_SEQ_SCAN_DISABLE);
	for (u8 index = 0; index < _e95_ADC_CHANNEL_COUNT; index++) {
		LL_ADC_SetChannelSamplingTime(
			ADC1, _e95_ADC_CHANNEL_VALUES[index], LL_ADC_SAMPLINGTIME_71CYCLES_5);
	}
	LL_ADC_Enable(ADC1);
	_e95_stabilizeAdcClock();
	LL_ADC_StartCalibration(ADC1);
	while (LL_ADC_IsCalibrationOnGoing(ADC1));
	adcInitialized = 1;
}

void setMode(Pin pin, PinMode mode) {
	GPIO_TypeDef *port = _e95_pinPort(pin);
	u32 mask = _e95_pinMask(pin);
	_e95_enableGpioPort(port);

	switch (mode) {
		case INPUT:
			LL_GPIO_SetPinMode(port, mask, LL_GPIO_MODE_FLOATING);
			break;
		case INPUT_PULLUP:
			LL_GPIO_SetPinMode(port, mask, LL_GPIO_MODE_INPUT);
			LL_GPIO_SetOutputPin(port, mask);
			break;
		case INPUT_PULLDOWN:
			LL_GPIO_SetPinMode(port, mask, LL_GPIO_MODE_INPUT);
			LL_GPIO_ResetOutputPin(port, mask);
			break;
		case OUTPUT:
			LL_GPIO_SetPinMode(port, mask, LL_GPIO_MODE_OUTPUT);
			LL_GPIO_ResetOutputPin(port, mask);
			break;
		default:
			// Defensive: every PinMode value is handled above; an unknown
			// value leaves the pin untouched instead of falling through.
			break;
	}
}

void writeShift(Pin dataPin, Pin clockPin, BitOrder bitOrder, u8 value) {
	setMode(dataPin, OUTPUT);
	setMode(clockPin, OUTPUT);
	for (u8 bit = 0; bit < _e95_SHIFT_BIT_COUNT; bit++) {
		const u8 bitIndex = (bitOrder == MSB_FIRST)
			? (u8)(_e95_SHIFT_BIT_COUNT - 1 - bit)
			: bit;
		setDigital(dataPin, ((value >> bitIndex) & 1) ? HIGH : LOW);
		setDigital(clockPin, HIGH);
		setDigital(clockPin, LOW);
	}
}

u8 readShift(Pin dataPin, Pin clockPin, BitOrder bitOrder) {
	setMode(clockPin, OUTPUT);
	setMode(dataPin, INPUT);
	u8 value = 0;
	for (u8 bit = 0; bit < _e95_SHIFT_BIT_COUNT; bit++) {
		setDigital(clockPin, HIGH);
		const u8 bitIndex = (bitOrder == MSB_FIRST)
			? (u8)(_e95_SHIFT_BIT_COUNT - 1 - bit)
			: bit;
		value |= (u8)(getDigital(dataPin) ? 1 : 0) << bitIndex;
		setDigital(clockPin, LOW);
	}
	return value;
}

void setAnalog(Pin pin, u16 value) {
	const _e95_PwmPin *entry = _e95_findPwmPin(pin);
	if (!entry) {
		return;
	}
	u16 index = (u16)(entry - _e95_PWM_PINS);
	if (!(_e95_PWM_PINS_CONFIGURED & (1u << index))) {
		_e95_enableGpioPort(_e95_pinPort(pin));
		_e95_enablePwm(entry);
		_e95_PWM_PINS_CONFIGURED |= (1u << index);
	}
	const _e95_PwmTimer *timer = _e95_findPwmTimer(entry->timerId);
	if (!timer) {
		return;
	}
	TIM_TypeDef *handle = timer->timer;
	switch (entry->channel) {
		case 1: handle->CCR1 = value; break;
		case 2: handle->CCR2 = value; break;
		case 3: handle->CCR3 = value; break;
		case 4: handle->CCR4 = value; break;
		default: break;
	}
}

static u16 _e95_readAdcValue(void) {
	LL_ADC_ClearFlag_EOS(ADC1);
	LL_ADC_REG_StartConversionSWStart(ADC1);
	while (!LL_ADC_IsActiveFlag_EOS(ADC1));
	return ADC1->DR;
}

i16 getAnalog(Pin pin) {
	u8 channel = _e95_findAdcChannel(pin);
	if (channel == _e95_NO_ADC_CHANNEL) {
		return 0;
	}
	if (!(_e95_ADC_CHANNELS_CONFIGURED & (1u << channel))) {
		_e95_enableGpioPort(_e95_pinPort(pin));
		LL_GPIO_SetPinMode(_e95_pinPort(pin), _e95_pinMask(pin), LL_GPIO_MODE_ANALOG);
		_e95_initializeAdc();
		_e95_ADC_CHANNELS_CONFIGURED |= (1u << channel);
	}
	LL_ADC_REG_SetSequencerRanks(ADC1, LL_ADC_REG_RANK_1, _e95_ADC_CHANNEL_VALUES[channel]);
	_e95_readAdcValue();
	u32 sum = 0;
	for (u8 index = 0; index < _e95_ADC_AVERAGE_SAMPLE_COUNT; index++) {
		sum += _e95_readAdcValue();
	}
	return (i16)(sum / _e95_ADC_AVERAGE_SAMPLE_COUNT);
}

} // namespace core_gpio
