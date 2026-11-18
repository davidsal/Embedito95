# Embedito95 Runtime Exception

Version 1.0, effective 2026-11-17

Copyright (c) 2026 David Melara.

This Embedito95 Runtime Exception ("Exception") is an additional permission
under Section 7 of the GNU Affero General Public License, version 3.0 only
(`AGPL-3.0-only`, see [LICENSE](LICENSE)). It applies to the Embedito95
Software distributed by the Licensor and governs the propagation and
distribution of Output built with the Software.

## 1. Definitions

- "Licensor": David Melara, copyright holder of the Software.
- "AGPL": the GNU Affero General Public License, version 3.0 only
  (`AGPL-3.0-only`), as published by the Free Software Foundation and set forth
  in [LICENSE](LICENSE).
- "Software": the Embedito95 compiler, command-line interface, language server,
  editor extensions, runtime, core libraries, the standard e95 libraries
  published by the Licensor in the official registry, documentation and build
  tooling, in source and binary form, together with any C++ runtime headers,
  startup code or support code emitted by the Software when compiling `.e95`
  sources.
- "Output": any firmware, executable, binary, object file, kernel,
  operating-system image, application, package, container image, transpiled C++
  source or other artifact produced by compiling, transpiling or linking user
  `.e95` code with the Software, including any portion of the Software's
  runtime, core libraries or official registry libraries copied into, emitted
  into or linked with that artifact during compilation. Output includes device
  firmware (such as `.bin`, `.hex`, `.elf` and over-the-air update packages),
  host executables and app bundles, and software distributed for embedded,
  bare-metal, desktop, server or other hardware, whether programmed into a
  device, shipped as a file, installed on hardware or delivered over a network.
- "Eligible Process": the use of the unmodified Software (or a modified version
  of the Software whose modifications are made available to recipients in full
  compliance with the AGPL if and when conveyed, or authorized under a written
  commercial agreement with the Licensor) to translate, transpile, compile and
  link `.e95` code into Output, without exposing or repackaging the Software
  itself as a standalone compiler, library, software development kit or
  development tool.

## 2. Grant of Additional Permission

Under Section 7 of the AGPL, the Licensor grants you permission to propagate,
convey and distribute Output produced through an Eligible Process, in source or
binary form (including pre-installed on physical devices or delivered as
firmware updates), under terms of your choice—including proprietary and
confidential terms—without being required to provide Corresponding Source,
Installation Information or source-code offers under Sections 4, 5, 6 or 13 of
the AGPL for that Output or for the portions of the Software's runtime, core
libraries and official registry libraries embedded in it.

You retain full ownership of your `.e95` sources, your own libraries, the C++
code generated from them and the resulting Output.

## 3. Scope and Exclusions

### 3.1. Modifications to the Software remain under the AGPL

This Exception does not permit distributing modified versions of the Software
(including modifications to the compiler, command-line interface, language
server, runtime, core libraries or official registry libraries) under
proprietary terms. Any modification to the Software itself remains governed by
the AGPL unless covered by a separate commercial license from the Licensor. If
you modify the Software's runtime, core libraries or official registry
libraries and link those modifications into Output, this Exception covers the
resulting Output only if you make available the Corresponding Source of your
modifications to your recipients as required by the AGPL.

### 3.2. No standalone redistribution of the Software

This Exception applies to the Software's runtime, core libraries and official
registry libraries solely to the extent they are emitted into, compiled into or
linked with Output through an Eligible Process. It does not grant permission to
redistribute the Software, its runtime or its libraries as a standalone
product, software development kit (SDK), library package, framework or
development tool under non-AGPL terms.

### 3.3. No competing compiler or toolchain

This Exception does not apply if the Software, or any part of its runtime, core
libraries or code emitted by the Software when compiling `.e95` sources, is used
to build, bootstrap, wrap or distribute a product whose primary purpose is to
reproduce or replace the functionality of the Software's own compiler,
transpiler, language server or toolchain, or if the Output itself exposes the
Software's compilation or code-generation capabilities to third parties as a
hosted or embeddable e95 toolchain.

### 3.4. Network interaction (AGPL Section 13)

Section 13 of the AGPL applies to the Software itself—for example, when offering
a modified version of the Embedito95 compiler, language server or command-line
interface to users over a network as a hosted compilation, build or development
service. Section 13 of the AGPL does not apply to Output running on a
microcontroller, server or host that communicates over a network, provided that
the Output does not itself expose the Software as a hosted compiler or
development service.

## 4. Trademarks and Patents

- **No trademark grant.** This Exception does not grant any right to use the
  "Embedito95" name, logo or other trademarks of the Licensor, except for
  truthful factual reference as permitted by applicable law.
- **No additional patent license.** This Exception does not grant any patent
  license beyond the express patent license provided in Section 11 of the AGPL
  for the unmodified Software.

## 5. Termination and Reinstatement

If you fail to comply with the AGPL or the conditions of this Exception, your
rights under this Exception terminate automatically in accordance with Section
8 of the AGPL. Any reinstatement of your rights under Section 8 of the AGPL
also reinstates your rights under this Exception. When you convey a copy of the
Software to which you have added modifications, you may remove this Exception
from that copy as provided in Section 7 of the AGPL.

## 6. Compatibility with Commercial License and Third-Party Components

### 6.1. Commercial license

This Exception coexists with the Licensor's commercial licensing program (see
[LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md)). You do not need a commercial
license to build, use, sell or distribute proprietary Output covered by this
Exception. A commercial agreement is needed only for uses of the Software
outside the AGPL and this Exception (such as proprietary redistribution or
embedding of the Software itself, hosted toolchain services, or commercial SLA
support, priority bug fixes, custom features and training).

### 6.2. Third-party components

This Exception applies solely to code whose copyright is held by the Licensor.
It does not modify or supersede the license terms of third-party components
used with or linked into Output, including target SDKs, hardware abstraction
layers, bootloaders, C/C++ standard libraries and board cores such as the
Arduino AVR core (`LGPL-2.1`), ESP32 / ESP-IDF libraries, STM32 vendor
libraries, host platform SDKs and third-party community libraries. You are
solely responsible for complying with the applicable third-party licenses.

## 7. No Warranty and Limitation of Liability

THE SOFTWARE AND ANY RUNTIME OR LIBRARY CODE INCLUDED IN OUTPUT ARE PROVIDED
"AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, AND SUBJECT TO THE
DISCLAIMERS OF WARRANTY AND LIMITATIONS OF LIABILITY SET FORTH IN SECTIONS 15,
16 AND 17 OF THE AGPL.

## How to Apply

This Exception applies automatically to the Software distributed by the
Licensor, and to any package that includes both `LICENSE` and
`LICENSE-EXCEPTION.md`. Projects and package metadata referencing this license
combination may identify it as:

```text
SPDX-License-Identifier: AGPL-3.0-only WITH LicenseRef-Embedito95-Runtime-Exception-1.0
```

or include the following notice in relevant documentation or source files:

```text
Licensed under the GNU Affero General Public License v3.0 only (AGPL-3.0-only)
with the Embedito95 Runtime Exception v1.0 (see LICENSE and LICENSE-EXCEPTION.md).
```
