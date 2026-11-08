#ifndef _E95_HOST_PGMSPACE_H
#define _E95_HOST_PGMSPACE_H
// Host stand-in for <avr/pgmspace.h>. On the host there is no separate flash
// address space, so PROGMEM is empty and pgm_read_byte is a plain dereference.
// The real core_string.cpp/.h use these for flash string literals.
#include <stdint.h>

#ifndef PROGMEM
#define PROGMEM
#endif

#ifndef pgm_read_byte
#define pgm_read_byte(address_short) (*(const unsigned char *)(address_short))
#endif

#ifndef pgm_read_ptr
#define pgm_read_ptr(address_short) (*(void *const *)(address_short))
#endif

#endif
