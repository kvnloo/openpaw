# Credits and provenance

OpenPaw is intended to preserve the origin of ideas, evidence, design decisions, and expert feedback.

## Project framing

- **OpenPaw concept / project direction:** Kevin Rajan (@kvnloo).
- **Behavior inspiration:** Pet Harmony's force-free, consent-based behavior work (body language, consent checks, owner-led training). OpenPaw is not officially affiliated with or endorsed by Pet Harmony.
- **Blueprint framing inspiration:** Bryan Johnson's public Blueprint work around longitudinal measurement, personal baselines, and iterative protocols. OpenPaw is independent and unaffiliated.
- **Veterinary and behavior foundations:** future protocol decisions should cite the specific veterinarian, behavior professional, researcher, paper, or guideline that motivated them.
- **Open hardware and wearable ecosystem:** OpenPaw should reuse and credit existing work where possible instead of presenting established sensing/tracking primitives as novel.

## Reference collar

- LSM6DS3TR-C FIFO batching (XIAO): register values from the ST LSM6DS3TR-C datasheet, cross-checked against STMicroelectronics' [lsm6ds3tr-c driver](https://github.com/STMicroelectronics/lsm6ds3tr-c) (`lsm6ds3tr-c_reg.h/.c`, BSD-3-Clause). Facts only; no code copied.
- QMA6100P accelerometer init sequence (T1000-E): Seeed Studio, `Tracker_T1000_E_LoRaWAN_Examples` (MIT), shipped with the Seeed nRF52 Arduino core.
- QMA6100P FIFO batching (T1000-E): register values and FIFO behaviour from the QST [QMA6100P datasheet Rev F](https://qstcorp.com/upload/pdf/202602/13-52-20%20QMA6100P%20Datasheet%20Rev%20F.pdf) (section 7.8, registers 0Bh, 0Eh, 10h, 3Eh, 3Fh). Facts only; no code copied.
- QMA6100P Still-mode master clock (T1000-E): current per clock from the same datasheet (table 2, register 11h); Seeed's `Seeed-Tracker-T1000-E-for-LoRaWAN-dev-board` `qma6100p_defs.h` (MCLK enum) was read to confirm the register codes. Facts only; no code copied.
- QMA6100P any-motion wake pin (T1000-E Quiet mode): registers 09h, 18h, 1Ah, 20h, 21h, 2Ch, 2Eh, 2Fh from the same datasheet (section 7.3, 7.9); cross-checked against Seeed's `Seeed-Tracker-T1000-E-for-LoRaWAN-dev-board` `qma6100p.c` (`qma6100p_motion_init`) and [Meshtastic](https://github.com/meshtastic/firmware) `src/motion/QMA6100PSensor.cpp` (GPL-3.0). Facts only; no code copied.
- Bluetooth stack and bootloader: Adafruit nRF52 Arduino core / Bluefruit and the Adafruit UF2 bootloader, via Seeed's fork (LGPL-2.1 / MIT).
- T1000-E battery divider (x2 on P0.02, 3.0 V reference) and flash wiring (QSPI IO3 on P1.00, Flash Enable on P1.13): cross-checked from Seeed's [T1000-E LoRaWAN dev-board firmware](https://github.com/Seeed-Studio/Seeed-Tracker-T1000-E-for-LoRaWAN-dev-board) (`sensor.c`), the Seeed wiki pin table, the Seeed nRF52 core `variant.cpp`, [Meshtastic](https://github.com/meshtastic/firmware) `tracker-t1000-e/variant.h` (GPL-3.0) and [SoftRF](https://github.com/lyusupov/SoftRF) `Seeed_T1000E.h` (GPL-3.0), which also flagged the possible GD25Q64 part. Facts only; no code copied.
- Flash log (`openpaw_flog.h`): standard SPI NOR commands (0x03/0x02/0x06/0x05/0x20) from the Puya P25Q16H and GigaDevice GD25Q64 datasheets; CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF). The sector-generation layout follows the common log-structured flash pattern (as in LittleFS / Nordic FDS); no code copied.
- Internal-flash backend (`openpaw_iflash.h`): Nordic nRF52840 Product Specification v1.5 (NVMC: 4 KB pages, word writes, nWRITE = 2) and the S140 SoftDevice Specification flash API (`sd_flash_write` / `sd_flash_page_erase`, NRF_ERROR_BUSY, completion events). The region below `__flash_arduino_end` and the busy-retry loop follow Adafruit's `flash_nrf5x.c` (InternalFileSystem, MIT); no code copied.
- VeDBA as an activity measure: standard biologging practice (e.g. Qasem et al. 2012, PLoS ONE, doi:10.1371/journal.pone.0031187).
- Collar accelerometer evidence used to set expectations: Kumpulainen et al. 2021 (doi:10.1016/j.applanim.2021.105393; dataset by Vehkaoja et al., CC BY 4.0, doi:10.17632/vxhx934tbn.4) and Chambers et al. 2021.
- Collar band calibration: Vehkaoja et al., [Movement Sensor Dataset for Dog Behavior Classification v4](https://data.mendeley.com/datasets/vxhx934tbn/4) (CC BY 4.0), with [data descriptor](https://jyx.jyu.fi/bitstreams/f82fe7ff-533f-4e48-a444-f29a636fa607/download) and [original study](https://researchportal.tuni.fi/en/publications/dog-behaviour-classification-with-movement-sensors-placed-on-the-/). Marcato et al., [Inertial sensor dataset for Dog Posture Recognition v1](https://data.mendeley.com/datasets/mpph6bmn7g/1) (CC BY 4.0; [publication](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286311)) is used for the external classifier check. See [methods and results](research/calibration/RESULTS.md).
- The printed T1000-E collar cases linked in docs/COLLAR.md are by their MakerWorld/Thingiverse authors.

## App guidance

- Field "Session check" stop rule (`app/session-check.js`): threshold signs (can't look away, stops taking favourite food) and "make distance" from East Bay SPCA's [Look At That handout](https://eastbayspca.org/wp-content/uploads/2024/05/Look-At-That_A-Reactivity-Exercise.pdf) (CC BY-NC 4.0; LAT by Leslie McDevitt); shivering, pacing, panting -> stop or add distance from Grisha Stewart's [BAT demo](https://www.youtube.com/watch?v=Q9BsLd6KQqM&t=350s) (5:50); reward-based, distance-first framing from AVSAB 2021; the panting caveat from Clark et al. 2020 (panting common in therapy-dog visits, cortisol unchanged). The "doesn't answer a cue it knows" sign (rule v2) from Eileen Anderson's [Dog over Threshold](https://www.youtube.com/watch?v=EBfq1Wz8jHw) (eileenanddogs: a known sit cue at the door gets no response, and food is refused when she does sit); the same clip is the second, force-free example on the Learn card "quiet is not calm" (`c-quiet-aroused`). Wording is ours; no endorsement implied.
- Learn card "one change at a time" (`c-one-step`): the hat-on-the-ground, then held, then worn order, the coat step, the doorway version and the "keep the dog out of reach" warning are from Kikopup's [Barking Episode 4: Barking at Strangers](https://www.youtube.com/watch?v=LXCELHDT2fs) (Emily Larlham; footage thanks to YouTube user pamelamarxsen); graded steps from Riemer 2023 and Butler et al. 2011, reward-based framing from AVSAB 2021. Linked at timestamps only, no media copied. Wording is ours; no endorsement implied.
- Learn practice choice order (`app/choice-order.js`): the Fisher-Yates shuffle in Durstenfeld's in-place form (R. Durstenfeld, "Algorithm 235: Random permutation", Commun. ACM 7(7):420, 1964, doi:10.1145/364520.364540).

## Fonts

- Self-hosted fonts (SIL Open Font License 1.1, latin subsets): [Fraunces](https://github.com/undercasetype/Fraunces) by The Fraunces Project Authors, [Hanken Grotesk](https://github.com/marcologous/hanken-grotesk) by Alfredo Marco Pradil, [IBM Plex Mono](https://github.com/IBM/plex) by IBM. `site/fonts/fraunces-latin-opsz-normal.woff2` is a modified version: its weight axis is limited to 400-600 (the weights the site uses) with [fontTools](https://github.com/fonttools/fonttools) `varLib.instancer`; it stays under the OFL.

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
