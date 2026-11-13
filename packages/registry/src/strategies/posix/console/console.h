#ifndef _E95_CONSOLE_H
#define _E95_CONSOLE_H

#include "core_type.h"
#include "core_string.h"

namespace core_console {

void log(const char *data);
void log(const core_string::String &data);
void log(char value);
void log(u8 value);
void log(i8 value);
void log(u16 value);
void log(i16 value);
void log(u32 value);
void log(i32 value);
void log(u64 value);
void log(i64 value);
void log(f32 value);
void log(f64 value);
void log(boolean value);
void log(nullable<core_string::String> value);

} // namespace core_console

#endif
