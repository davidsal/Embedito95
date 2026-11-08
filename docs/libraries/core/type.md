# Type

Backs the built-in `array`, `string`, `object` and 128-bit integer types. It is
auto-imported and has no functions of its own: arrays, strings and objects use
methods that are part of the language.

## Array methods

Available on every `T[]` and `T[N]`.

| API | Description |
| --- | --- |
| `length(): u16` | Number of elements. |
| `capacity(): u16` | Elements that fit without reallocating. |
| `push(value: T): void` | Appends an element. |
| `pop(): void` | Removes the last element. |
| `reserve(newCapacity: u16): void` | Grows the capacity up front. |
| `shrink(newCapacity: u16): void` | Reduces the capacity when possible. |
| `truncate(newSize: u16): void` | Drops elements after `newSize`. |

## String methods

Available on every `string`.

| API | Description |
| --- | --- |
| `length(): u16` | Number of characters. |
| `push(value: char): void` | Appends one character. |
| `pop(): void` | Removes the last character. |
| `getCharacter(index: u16): char` | Character at an index. |
| `getSlice(start: u16, end: u16): string` | Substring in `[start, end)`. |
| `findTextFrom(needle: string, from: u16): i16` | First position of `needle`, or `-1`. |
| `findLastTextFrom(needle: string, from: u16): i16` | Last position of `needle`, or `-1`. |
| `hasPrefix(prefix: string): boolean` | Starts with `prefix`. |
| `hasSuffix(suffix: string): boolean` | Ends with `suffix`. |
| `matchesText(other: string): boolean` | Exact match. |
| `matchesTextIgnoringCase(other: string): boolean` | Match ignoring case. |
| `setCharacter(index: u16, value: char): void` | Replaces one character. |
| `appendText(other: string): void` | Appends text in place. |
| `replaceText(search: string, replacement: string): boolean` | Replaces the first match. |
| `removeRange(start: u16, end: u16): void` | Removes a range. |
| `trimWhitespace(): void` | Removes surrounding whitespace. |
| `toUpperCase(): void` | Uppercases in place. |
| `toLowerCase(): void` | Lowercases in place. |
| `parseInteger(): i32` | Parses an integer; `0` when none is found. |
| `parseFloat32(): f32` | Parses a `f32`. |
| `parseFloat64(): f64` | Parses a `f64`. |
| `toByteArray(): u8[]` | One byte per character, no terminator. |
| `toCharacterArray(): char[]` | Characters plus a trailing `'\0'`. |
| `reserveCapacity(minimumCapacity: u16): void` | Grows the buffer up front. |

`int128` backs `i128` and `u128`; `object` backs `type` values. They expose no
callable API.
