# Embedito95 Licensing

Version 1.0, effective 2026-11-17

Copyright (c) 2026 David Melara.

Embedito95 is available under two licensing tracks:

- **AGPL-3.0-only with the Embedito95 Runtime Exception** for everyone building
  and distributing firmware or software with Embedito95, and for everyone using
  or modifying the toolchain in compliance with the AGPL. See
  [LICENSE](LICENSE) and [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md).
- **Commercial license and services** for organizations that need to
  redistribute or embed the Software itself under proprietary terms, offer it as
  a managed service, or contract SLA support, priority bug fixes, custom
  features, training and consulting.

A commercial license or service agreement is granted only through a signed
written agreement with David Melara ("Licensor").

**You do not need a commercial license to sell or distribute products built
with Embedito95.** Under the [Runtime Exception](LICENSE-EXCEPTION.md), the
firmware, executables and other Output you build with `.e95` belong to you and
may be distributed under any terms—including proprietary, closed-source
terms—without paying royalties or publishing your Output's source code.

## In plain terms

| Who you are / What you do | What it costs |
| --- | --- |
| Student, hobbyist, personal or open-source project | **Free.** Covered by the AGPL and the Runtime Exception. |
| Company using Embedito95 internally | **Free.** Covered by the AGPL and the Runtime Exception. |
| Shipping a commercial product, flashing devices you sell, or distributing proprietary firmware, executables, kernels or OS images built with `.e95` | **Free.** Covered by the [Runtime Exception](LICENSE-EXCEPTION.md), with no obligation to publish your Output's source code. |
| Redistributing the Software, runtime or core libraries as a standalone product, SDK or development tool under proprietary terms | **Commercial license.** |
| Embedding the Software into another toolchain, IDE or competing product | **Commercial license.** |
| Offering the Software as a managed or hosted service without AGPL §13 disclosure | **Commercial license.** |
| SLA support, priority bug fixes, custom features or targets, training and consulting | **Commercial agreement.** |
| Additional legal permissions (removing attribution notices, custom indemnification or compliance assurances) | **Commercial license.** |

## 1. Definitions

- "Licensor": David Melara, copyright holder of the Software.
- "Licensee": the party identified in the signed order form.
- "Order form": the signed written agreement between the Licensor and the
  Licensee that sets the fees, scope and term of the commercial permissions.
- "Term": the effective period set out in the order form.
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
- "Runtime Exception": the Embedito95 Runtime Exception v1.0 set forth in
  [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md).
- "Seat": one named individual who is designated to receive commercial support,
  training or consulting from the Licensor, or who modifies, integrates,
  maintains, packages, redistributes or hosts the Software for proprietary
  redistribution or hosted service deployment under a commercial license.

## 2. Commercial grant and services

Upon execution of the order form and payment of the applicable fees, the
Licensor grants the Licensee a non-exclusive, non-transferable, worldwide
commercial license for the Term, covering one or more of the following as
specified in the signed order form:

- **(a) Redistribution of the Software:** permission to redistribute the
  Software, its runtime or its core libraries (modified or unmodified) as part
  of a proprietary product, software development kit (SDK) or development tool
  without the source-disclosure obligations of the AGPL;
- **(b) Toolchain integration:** permission to embed or integrate the Software
  into another compiler, IDE, language toolchain or competing product;
- **(c) Managed or hosted services:** permission to offer modified versions of
  the Software over a network as a hosted compilation, build or development
  service without the network source-disclosure obligations of Section 13 of
  the AGPL, where those obligations would otherwise apply;
- **(d) Support, custom engineering and training:** support under a Service
  Level Agreement (SLA), priority bug fixes, custom language or board features,
  training and technical consulting;
- **(e) Additional legal permissions:** custom contractual terms requested by
  the Licensee, such as removal of Software attribution notices, custom
  indemnification or enterprise compliance provisions.

## 3. Seats

- Seats apply only to contracted support/services and to commercial
  redistribution, integration or hosted deployment of the Software itself.
  Developers who merely write `.e95` code to build and distribute Output do not
  require a Seat.
- One Seat is required per named individual who uses SLA support or who works
  on redistributing, embedding, hosting, maintaining or packaging the Software
  under a commercial license.
- CI runners and AI agents operated by licensed Seats do not require their own
  Seat.
- Seats may be reassigned to another individual with written notice to the
  Licensor.
- Affiliates and contractors require their own Seats unless agreed otherwise in
  the order form.

## 4. Restrictions

Unless expressly permitted in the signed order form, the Licensee may not:

- redistribute, resell, sublicense, rent or lease the Software, its runtime or
  its core libraries as a standalone product, SDK or development tool;
- offer the Software as a hosted or managed service;
- embed or use the Software to build or distribute a competing compiler or
  language toolchain;
- remove or alter copyright, license or attribution notices in the Software.

## 5. Output ownership and third-party components

Users and Licensees always own their `.e95` sketches, their own libraries, the
C++ code generated from them and the resulting Output. The Licensor claims no
ownership over your Output and imposes no obligation to publish the source code
of your Output. Under the [Runtime Exception](LICENSE-EXCEPTION.md), you may
build, use, sell and distribute Output under proprietary terms at any time,
with or without a commercial agreement.

The Software itself—including the Embedito95 compiler, command-line interface,
language server, runtime, core libraries and official registry libraries as
software—remains copyright of the Licensor under the AGPL-3.0-only, the Runtime
Exception or a signed commercial agreement, as applicable.

Third-party components are not covered by this license and keep their own
terms. This includes target SDKs, hardware abstraction layers, bootloaders and
toolchains such as the Arduino AVR core (`LGPL-2.1`), ESP32 / ESP-IDF
libraries, STM32 vendor libraries, host platform SDKs and community libraries
installed from the registry.

## 6. Fees and payment

- Fees for Seats, Software redistribution, hosted services, SLA support, custom
  development or training are as set in the order form.
- Recurring fees are invoiced annually in advance unless stated otherwise in
  the order form, and all fees are exclusive of taxes.
- Late payments may suspend commercial permissions and support services after
  written notice.

## 7. Updates, support and survival of Output rights

- Software updates released during an active term are included.
- SLA response times, priority bug resolution, custom features, training and
  consulting are provided according to the scope set in the order form.
- Because the right to build and distribute Output comes from the
  [Runtime Exception](LICENSE-EXCEPTION.md), expiration or termination of a
  commercial agreement never restricts your right to build, rebuild, update or
  distribute Output using the unmodified Software.

## 8. Term and termination

- The agreement starts on the effective date set in the order form and renews
  annually unless cancelled in accordance with the order form.
- Either party may terminate for material breach not cured within 30 days of
  written notice.
- On termination, the Licensee must stop exercising the commercial rights
  granted in the order form (such as proprietary redistribution of the
  Software, hosted toolchain services or SLA support), while retaining all
  rights granted under the AGPL and the Runtime Exception.

## 9. Audit

Once per year, with 30 days' written notice, the Licensor may request a written
declaration verifying the number of contracted Seats in use and the scope of
any redistribution, embedding or hosted deployment of the Software under the
commercial agreement. Audits never apply to or inspect the Licensee's `.e95`
projects or distributed Output. Remote or on-site audits require mutual
agreement.

## 10. Warranty and liability

Unless expressly agreed otherwise in a signed order form, THE SOFTWARE IS
PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED
BY LAW, THE LICENSOR'S TOTAL LIABILITY IS LIMITED TO THE FEES PAID IN THE
TWELVE MONTHS BEFORE THE CLAIM.

## 11. Governing law

Signed commercial agreements are governed by the laws of the Republic of
Guatemala, with venue in the courts of Quetzaltenango, Guatemala. Where a
translation is required by local procedure, the Spanish version prevails.

## Contact

licensing@voldrek.com
