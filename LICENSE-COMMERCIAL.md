# Embedito95 Licensing

Copyright (c) 2026 David Melara.

Embedito95 is dual-licensed:

- **AGPL-3.0-only** for everyone who can comply with it. See [LICENSE](LICENSE).
- **Commercial license** for anyone who cannot or does not want to comply.

A commercial license is only granted through a signed commercial agreement with
David Melara ("Licensor"). The rest of this document explains the policy.

## In plain terms

| Who you are | What it costs |
| --- | --- |
| Student, hobbyist, personal projects | **Free.** You do not distribute firmware, so the AGPL asks nothing from you. |
| Open-source project | **Free.** Publish your source under the AGPL. |
| Company using it internally | **Free** while you do not distribute firmware. |
| Shipping a product, or flashing devices you sell | **AGPL applies.** Publish the source of the firmware. Otherwise, buy a commercial license. |
| Private firmware | **Commercial license.** |
| Distributing a modified Embedito95 without publishing it | **Commercial license.** |

The rule is simple: **if the firmware leaves your hands, it is either open
source or licensed.**

## 1. Definitions

- "Software": the Embedito95 compiler, command-line interface, language
  server, editor extensions, runtime, core libraries, the standard e95
  libraries published by the Licensor in the official registry, documentation
  and build tooling, in source and binary form.
- "Firmware": any C++, object file or binary image produced with the Software,
  or containing any part of the Embedito95 runtime or core libraries, including
  `.bin`, `.hex`, `.elf` and OTA update packages, whether programmed into a
  device, shipped as a file or delivered over the network.
- "Seat": one named individual who writes, reviews, builds or maintains `.e95`
  code that ends up in Firmware distributed under this license.

## 2. Grant

Subject to payment of the applicable fees, the Licensor grants the Licensee a
non-exclusive, non-transferable, worldwide license during the term to:

- use the Software to develop and build Firmware;
- reproduce, link and embed the Software's runtime, core libraries and official
  registry libraries into Firmware;
- distribute that Firmware without the source-disclosure, installation
  information and network obligations of the AGPL;
- keep the Licensee's sketches and generated code confidential.

## 3. Seats and devices

- One Seat per individual who contributes code to distributed Firmware,
  including work done earlier under the AGPL.
- CI runners and AI agents operated by licensed Seats do not need their own
  Seat.
- Each Seat covers unlimited products and unlimited devices.
- Seats may be reassigned to another individual with written notice.
- Affiliates and contractors need their own Seats unless agreed otherwise.

## 4. Restrictions

The Licensee may not:

- redistribute the Software, its source, its runtime or its core libraries as a
  standalone product, SDK or development tool;
- sublicense, rent, lease or resell the Software;
- offer the Software as a hosted or managed service;
- use the Software to build a competing compiler or language toolchain;
- remove copyright, license or attribution notices.

## 5. Output ownership

The Licensee owns its sketches, its own libraries, the C++ code generated from
them and the resulting Firmware. The Embedito95 runtime, core libraries and
standard registry libraries remain under the AGPL-3.0-only or this commercial
license, as applicable.

Third-party components are not covered by this license and keep their own
terms. This includes target SDKs, HALs, bootloaders and toolchains such as the
Arduino AVR core (LGPL-2.1), STM32 vendor libraries, and community libraries
installed from the registry.

## 6. Fees and payment

- Fees are per Seat per year, as set in the order form.
- Fees are invoiced annually in advance and are exclusive of taxes.
- Late payments may suspend the license after written notice.

## 7. Updates and support

- Updates released during the active term are included.
- Support, SLA, training and custom development are contracted separately.
- The Licensee may continue to distribute Firmware built during the term after
  the term ends, but may not build new Firmware without an active license.
  Only the exact binary produced during the term survives.
- Rebuilding an already shipped version is new Firmware. Any change to code,
  libraries, configuration or build that produces a different binary counts as
  new Firmware, including a new version, a bug fix or a runtime update. It
  requires an active license before it can be built or distributed.

## 8. Term and termination

- The license starts on the effective date and renews annually unless cancelled.
- The Licensor may terminate for material breach not cured within 30 days.
- On termination the Licensee must stop using the Software to build new
  Firmware and stop redistributing the Software itself.

## 9. Audit

Once per year, with 30 days' notice, the Licensor may request a written
declaration of the number of Seats in use and of the Firmware distributed under
the license. Remote or on-site audits require mutual agreement.

## 10. Warranty and liability

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM
EXTENT PERMITTED BY LAW, THE LICENSOR'S TOTAL LIABILITY IS LIMITED TO THE FEES
PAID IN THE TWELVE MONTHS BEFORE THE CLAIM.

## 11. Governing law

Signed commercial agreements are governed by the laws of the Republic of
Guatemala, with venue in the courts of Quetzaltenango, Guatemala. Where a
translation is required by local procedure, the Spanish version prevails.

## Contact

licensing@voldrek.com
