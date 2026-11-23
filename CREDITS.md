# Credits and provenance

OpenPaw is intended to preserve the origin of ideas, evidence, design decisions, and expert feedback.

## Project framing

- **OpenPaw concept / project direction:** Kevin Rajan (@kvnloo).
- **Behavior inspiration:** Pet Harmony's force-free, consent-based behavior work (body language, consent checks, owner-led training). OpenPaw is not officially affiliated with or endorsed by Pet Harmony.
- **Blueprint framing inspiration:** Bryan Johnson's public Blueprint work around longitudinal measurement, personal baselines, and iterative protocols. OpenPaw is independent and unaffiliated.
- **Veterinary and behavior foundations:** future protocol decisions should cite the specific veterinarian, behavior professional, researcher, paper, or guideline that motivated them.
- **Open hardware and wearable ecosystem:** OpenPaw should reuse and credit existing work where possible instead of presenting established sensing/tracking primitives as novel.

## Reference collar

- QMA6100P accelerometer init sequence (T1000-E): Seeed Studio, `Tracker_T1000_E_LoRaWAN_Examples` (MIT), shipped with the Seeed nRF52 Arduino core.
- Bluetooth stack and bootloader: Adafruit nRF52 Arduino core / Bluefruit and the Adafruit UF2 bootloader, via Seeed's fork (LGPL-2.1 / MIT).
- T1000-E battery divider (x2 on P0.02, 3.0 V reference) and flash wiring (QSPI IO3 on P1.00, Flash Enable on P1.13): cross-checked from Seeed's [T1000-E LoRaWAN dev-board firmware](https://github.com/Seeed-Studio/Seeed-Tracker-T1000-E-for-LoRaWAN-dev-board) (`sensor.c`), the Seeed wiki pin table, the Seeed nRF52 core `variant.cpp`, [Meshtastic](https://github.com/meshtastic/firmware) `tracker-t1000-e/variant.h` (GPL-3.0) and [SoftRF](https://github.com/lyusupov/SoftRF) `Seeed_T1000E.h` (GPL-3.0), which also flagged the possible GD25Q64 part. Facts only; no code copied.
- Flash log (`openpaw_flog.h`): standard SPI NOR commands (0x03/0x02/0x06/0x05/0x20) from the Puya P25Q16H and GigaDevice GD25Q64 datasheets; CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF). The sector-generation layout follows the common log-structured flash pattern (as in LittleFS / Nordic FDS); no code copied.
- VeDBA as an activity measure: standard biologging practice (e.g. Qasem et al. 2012, PLoS ONE, doi:10.1371/journal.pone.0031187).
- Collar accelerometer evidence used to set expectations: Kumpulainen et al. 2021 (doi:10.1016/j.applanim.2021.105393; dataset by Vehkaoja et al., CC BY 4.0, doi:10.17632/vxhx934tbn.4) and Chambers et al. 2021.
- The printed T1000-E collar cases linked in docs/COLLAR.md are by their MakerWorld/Thingiverse authors.

## Contribution provenance

When an external expert or contributor materially influences a design:

1. name them in the relevant issue/PR when permission allows;
2. link the source discussion, paper, commit, or artifact;
3. distinguish their idea from later implementation work;
4. preserve that credit when the work moves between docs, issues, and code.

If a contribution must remain anonymous, preserve its role/source class and the reason for anonymity where appropriate.

## Research claims

Do not turn a cited observation into a stronger claim than the source supports.

In particular:

- physiological arousal is not equivalent to a specific emotion;
- correlation is not prediction;
- population findings are not automatically valid as individual thresholds;
- pretotype hypotheses are not validated clinical endpoints.

## Expert acknowledgments

This section should grow as vets, behavior professionals, trainers, researchers, and hardware contributors participate.

No expert endorsement should be implied merely because someone provided feedback.
