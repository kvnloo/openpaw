# Collar power budget

Status: **estimates from datasheets, not measurements.** No OpenPaw collar has run
on a real board yet, so these numbers come from the chip datasheets and simple
arithmetic. The hardware-in-the-loop item in the backlog replaces them with measured
current. Real boards draw more than this table, because it leaves out regulators,
the charger, the flash chip's standby current and LEDs.

Legend: **[D]** = value from a datasheet (source linked below), **[E]** = estimate
(the arithmetic is shown, and it needs a measurement).

## Modes (firmware 0.4 and later)

| Mode | When | Accelerometer | CPU wake-ups | Radio |
|---|---|---|---|---|
| **Active** | Default | XIAO: LSM6DS3TR-C at 52 Hz low-power, samples queued in its FIFO; T1000-E: QMA6100P at 50 Hz, samples queued in its 64-frame FIFO | XIAO: 1 per second (FIFO read); T1000-E: 1.25 per second (FIFO read every 0.8 s) | Advertising every 100 ms for 30 s after boot or a disconnect, then every 1 s; Advertising every 2 s once no phone has connected for 10 min ("parked") |
| **Still** | 5 min of still epochs (mean VeDBA under 60 mg, no burst, no sensor gap) and no phone connected | XIAO: 12.5 Hz low-power, FIFO; T1000-E: 12.5 Hz, FIFO | XIAO: 1 per second; T1000-E: 1.25 per second | As in Active (usually parked: 2 s) |
| **Quiet** (both boards, firmware after 0.4.0; T1000-E since the QMA6100P any-motion change) | 1 more minute of still epochs in Still mode (12 epochs), no phone connected | XIAO: still running at 12.5 Hz low-power, FIFO off, wake-up interrupt latched on INT1; T1000-E: QMA6100P still running at its Still rate, FIFO not read, any-motion interrupt latched on INT1 (P1.02) | 1 per 5 s epoch (one pin read, one no-sample record); every 12th epoch is sampled for real (a check epoch) | As in Still |
| **Connected, downloading** | The app is connected and a backlog download runs (and for 2 s after it ends) | As in Active (a connected phone always gets the full rate) | As in Active | Asks for connection events every 15 ms |
| **Connected, idle** | Connected, no download for 2 s | As in Active | As in Active | Asks for 200 ms events with peripheral latency 4: the collar may skip up to 4 empty events, so it answers at least once a second, and sooner whenever it has a live record to send |

Any epoch that is not still, any burst, a sensor gap, or a phone connecting switches the collar back to
Active at the next 5 s epoch boundary. Epochs recorded in Still mode carry record flag `0x10` (`LOWRATE`),
and the app exports it as `provenance.quality.low_rate`, so analysis never confuses a low-rate epoch with a
full-rate one. The 60 mg limit is a provisional power setting. It is tighter than the app's "still" band
(under 250 mg, which also covers standing), and it has not been calibrated against labelled data.

On the XIAO an epoch is 260 of the IMU's own 52 Hz samples (63 at 12.5 Hz in Still mode), so its
length follows the IMU's clock: nominally 5 s, not measured. On the T1000-E it is 250 of the
QMA6100P's 50 Hz samples (63 at 12.5 Hz). Each sample is dated from the moment
the FIFO was read and its place in the batch (`openpaw_push_batch`), so an epoch that ends in the
middle of a batch keeps its own end time. If the FIFO overflows (samples lost), the open epoch is
closed with the `GAP` flag.

## Per-part current

| Part | Condition | Current | Source |
|---|---|---|---|
| nRF52840 | System ON, full RAM retained, RTC wake (sleeping between samples) | 3.16 µA | [D] PS v1.5 §5.2.1.1 `ION_RAMON_RTC` |
| nRF52840 | CPU running from flash, 64 MHz, DC/DC on | 3.3 mA | [D] PS v1.5 §5.2.1.3 `ICPU0` |
| nRF52840 | CPU running from flash, 64 MHz, LDO | 6.3 mA | [D] PS v1.5 §5.2.1.3 `ICPU1` |
| nRF52840 | Radio TX 0 dBm, 1 Mbps BLE, DC/DC | 6.40 mA | [D] PS v1.5 §5.2.1.5 `IRADIO_TX1` |
| nRF52840 | Radio RX 1 Mbps BLE, DC/DC | 6.26 mA | [D] PS v1.5 §5.2.1.5 `IRADIO_RX0` |
| LSM6DS3TR-C (XIAO) | Accelerometer only, 52 Hz low-power | 25 µA | [D] ST AN5130 Table 7 |
| LSM6DS3TR-C (XIAO) | Accelerometer only, 12.5 Hz low-power | 9 µA | [D] ST datasheet `LA_IddLM`; AN5130 Table 7 |
| LSM6DS3TR-C (XIAO) | Power-down | 3 µA | [D] ST datasheet `IddPD` |
| QMA6100P (T1000-E) | Master clock 51.2 kHz (Active mode), any ODR | 38 µA | [D] QST datasheet Rev F, table 2 "Power current" |
| QMA6100P (T1000-E) | Master clock 12.8 kHz (Still mode, if the rate check passes), any ODR | 10 µA | [D] QST datasheet Rev F, table 2 "Power current" |

## Estimated average current, not connected

The largest item is the CPU being awake for I²C reads. The Seeed core's `Wire` driver
(`Wire_nRF52.cpp`, core 1.1.13) spins in a loop until each transfer ends, so the CPU stays
awake for the whole time a byte is on the wire. Its `begin()` sets the bus to 100 kHz
(about 90 µs per 9-bit byte). Since firmware 0.4 the sketch calls `setClock(OPENPAW_I2C_HZ)`
right after every `begin()` and runs both sensors' bus at **400 kHz** fast mode, about
22.5 µs per byte. Both sensors support fast mode (LSM6DS3TR-C datasheet I²C timing table;
QMA6100P datasheet Rev F table 9). The QMA6100P datasheet says fast mode needs external
pull-ups. Whether each board's pull-ups are strong enough is not checked on hardware; if reads
fail on a real board, setting `OPENPAW_I2C_HZ` to `100000u` in `openpaw_core.h` restores
100 kHz. Whether the Seeed core turns on the DC/DC converter is not verified either, so both
regulator cases are shown.

- **FIFO batching (XIAO):** one wake-up per second reads the 4 status bytes and then the
  queued samples in 60-byte bursts. At 52 Hz that is about 312 data bytes plus ~25 bytes of
  addressing, ~340 bytes ≈ **~8 ms awake per second** at 400 kHz [E] (~30 ms at 100 kHz);
  at 12.5 Hz about 90 bytes ≈ 2 ms (8 ms at 100 kHz). This ignores the driver's per-transfer
  set-up time, which a measurement would include.
- **FIFO batching (T1000-E):** the QMA6100P's FIFO holds 64 frames, only 1.28 s at 50 Hz, so
  the CPU drains it every 0.8 s (`OPENPAW_QMA_FIFO_READ_MS`): a 4-byte status burst from 0Bh
  (overrun flag + frame count), then the frames from FIFO_DATA 3Fh in 60-byte bursts. Per
  second at 50 Hz that is 300 data bytes plus ~25 bytes of status and addressing, ≈ **~7 ms
  awake per second** at 400 kHz [E]; at 12.5 Hz about 90 bytes ≈ 2 ms. Same model as the XIAO,
  so the same caveat: the driver's per-transfer set-up time is not counted.
  The burst read from 3Fh relies on the datasheet's FIFO description (section 7.8: a frame not
  read completely is discarded, reading past the fill level returns zeroes); the firmware also
  stops at the first frame whose valid bit is 0. Not yet run on hardware.

| Item | Active, DC/DC | Active, LDO | Still, DC/DC | Still, LDO |
|---|---|---|---|---|
| nRF52840 asleep | 3 µA | 3 µA | 3 µA | 3 µA |
| CPU awake for the FIFO read at 400 kHz (8 ms or 2 ms per second × CPU current) [E] | 26 µA | 50 µA | 7 µA | 13 µA |
| Accelerometer (XIAO) | 25 µA | 25 µA | 9 µA | 9 µA |
| Advertising, parked at 2 s: 3 channels × ~0.6 ms × ~6.4 mA ≈ 12 µC per event, plus radio start-up, every 2 s [E] | ~8 µA | ~8 µA | ~8 µA | ~8 µA |
| **Total (XIAO, parts only)** | **~65 µA** | **~85 µA** | **~25 µA** | **~35 µA** |

History of the XIAO totals (Active DC/DC / Active LDO / Still DC/DC / Still LDO): polled at
100 kHz ~200 / ~350 / ~55 / ~85 µA; FIFO at 100 kHz ~135 / ~225 / ~45 / ~70 µA; FIFO at
400 kHz (above) ~65 / ~85 / ~25 / ~35 µA.

On the T1000-E (FIFO, 400 kHz) the CPU line is about the XIAO's, ~26 / ~50 / ~7 / ~13 µA, and
with the QMA6100P's 38 µA the totals are **~75 / ~100 / ~55 / ~60 µA** [E]. Polled at 50 Hz
(firmware before the QMA6100P FIFO change) they were ~115 / ~175 / ~60 / ~75 µA: the FIFO saves
~40 µA in Active mode (DC/DC). In Still mode the FIFO saves little, because the QMA6100P's
current depends on its master clock, not its sample rate.

**QMA6100P master clock in Still mode (T1000-E).** The datasheet lists 38 / 19 / 10 / 6 µA at
a master clock (MCLK, register 11h) of 51.2 / 25.6 / 12.8 / 6.4 kHz, for any sample rate. Since
this change, Still mode sets MCLK to 12.8 kHz, so the sensor's share drops from 38 to 10 µA and
the T1000-E Still totals from ~55 / ~60 µA to **~27 / ~32 µA** (DC/DC / LDO) [E]. The
datasheet's sample-rate table (section 9.11) is printed only "when MCLK is 51.2 kHz", and none
of the public drivers we read runs another clock (Seeed's T1000-E examples, QST's Linux driver,
ALIENTEK's examples). So the firmware *assumes* the rate scales with the clock (code 5, 50 Hz at
51.2 kHz, gives 12.5 Hz at 12.8 kHz) and checks it. It counts FIFO frames over the first 4 s of
each Still period (`openpaw_rate_check_*` in `openpaw_core.h`, host-tested). If the rate is
more than 25% away from 12.5 Hz, or no frames arrive, the collar prints `qma_clock=fallback` on
the serial port and uses 51.2 kHz with code 7 (12.5 Hz) until the next reboot. Up to 4 s of
samples taken before a fallback can be dated at the wrong spacing. Whether a lower clock changes
the sensor's noise is not stated in the datasheet. Not yet run on hardware.

Advertising every 1 s (the first 10 min after a phone leaves) costs about twice the parked
figure, ~15 µA [E]. Parking saves ~7 µA, which matters most in Still mode (~28% of the
XIAO's Still total). The trade-off: a phone that opens the app waits up to one advertising interval to
see the collar, so about 2 s instead of 1 s (not measured). The 10 min limit and the 2 s
interval are `OPENPAW_ADV_PARK_MS` and `OPENPAW_ADV_PARKED` in `openpaw_core.h`
(`openpaw_adv_step`, host-tested). A connection restores the 100 ms / 1 s pair, so the
next disconnect starts with the fast 30 s again.

On the T1000-E, the QMA6100P adds 38 µA in Active mode and 10 µA in Still mode (38 µA after a
rate-check fallback) instead of the LSM6DS3TR-C figures. The board's LoRa radio, GNSS and other sensors are never switched on by this
firmware, but their off-state leakage is not in the table.

A dog that lies still most of the day spends most of its time in Still mode, where
this estimate drops by about 2.5×. For example, 16 h still and
8 h active per day averages about 40 µA on the XIAO (DC/DC) [E], down from about 75 µA with
the FIFO at 100 kHz and about 100 µA when polled. That is a parts-only lower bound.
The vendor has published no battery life for an always-on accelerometer with BLE
(research/hardware.md); measure it before any page quotes battery days.

## Estimated radio current while a phone stays connected

The collar *asks* the phone for these connection parameters. The phone decides: it
may pick another interval or refuse, so measure on hardware before trusting this.

| Link state | Connection events | Radio, at ~2 µC per empty event [E] |
|---|---|---|
| Downloading (15 ms, latency 0) | ~67 per second | ~130 µA |
| Idle (200 ms, latency 4) | ~1 per second when nothing is waiting, up to 5 per second when it is | ~2–10 µA |

A phone left connected used to keep the 15 ms interval for the whole connection. Since
firmware 0.4 the collar drops to the idle interval 2 s after the last download ends
(`openpaw_link_step` in `openpaw_core.h`, host-tested), and asks for 15 ms again when
the app starts another download. Live records (one per 5 s epoch) and status still arrive.
The intervals stay inside the BLE Core rule that the supervision timeout (4 s) is longer than
2 × interval × (latency + 1) = 2 s.

## Strap scan: a chest strap read by the collar (firmware after 0.4.0)

The collar can log a Heart Rate strap (for example a Polar H10) by itself, as a BLE
central, so heart rate lands in each epoch's `hr_bpm` without a phone nearby. Scanning
keeps the radio receiving, so the firmware never scans on its own: the app's
**pair strap** command (control `0x30`) opens one 30 s window that connects to the first
strap advertising the Heart Rate service. If that link drops, the collar retries only that
strap's address, in 10 s windows that start 30 s, 60 s, 120 s … apart (at most 10 min), and
stops 1 h after the drop (the strap was probably taken off; pair again from the app). The
address is kept in RAM only, so after a reboot the strap needs a new pair command. Control
`0x31` forgets the strap. The policy is `openpaw_strap_step` in `openpaw_core.h` (host-tested).

| Strap state | Radio | Estimate [E] |
|---|---|---|
| Never paired, or given up | Nothing: no scanning | 0 µA |
| Scanning (pair window or a retry) | Listening 50 ms of every 100 ms: 0.5 × 6.26 mA | ~3.1 mA while it lasts |
| One pair window (30 s) | 30 s × ~3.1 mA ≈ 94 mC once | ~1 µA averaged over a day |
| Lost strap, first hour | 10 windows, 100 s of scanning in total (host test) | ~87 µA averaged over that hour, then 0 |
| Connected to the strap | The collar asks for 250–500 ms connection events; at ~2 µC per event (as above) that is 2–4 events per second | ~4–8 µA |

The strap may ask for other connection parameters and the core accepts them; a strap that
insists on short intervals costs more (20 ms would be ~100 µA). None of this is measured.
The phone link and the strap link share the radio; the SoftDevice must have RAM for both
(boot prints `ble=ok` or `ble=FAILED` on the serial port), which is not checked on a board yet.
In Quiet mode the collar still writes no-sample records with no heart rate, even when a strap
is connected.

## What else costs power (not done yet)

- **Wake on motion.** Both accelerometers can raise an interrupt on motion: LSM6DS3TR-C wake-up and
  activity/inactivity, and QMA6100P `ANY_MOT_INT`. The CPU could then sleep until the dog moves,
  instead of draining the FIFO while the dog lies still. What we know so far:
  - *Wiring, from Seeed's own sources (not checked on a real board).* XIAO nRF52840 Sense:
    `PIN_LSM6DS3TR_C_INT1` (pin 18), which the core's `variant.cpp` maps to P0.11 ("6D_INT1").
    T1000-E: `PIN_ACC_INTERRUPT` (pin 34) = P1.02 ("Accelerator Interrupt"); Meshtastic's T1000-E
    variant agrees (`QMA_6100P_INT_PIN`, 32 + 2).
  - *The obvious code costs more than it saves.* The core's `attachInterrupt()` (`WInterrupts.c`,
    core 1.1.13) uses a GPIOTE IN channel. The nRF52840 PS v1.5 (§5.2.1.1) lists System ON sleep
    with a GPIOTE input in event mode at **17.37 µA** (`ION_RAMON_GPIOTE`) and with the GPIOTE PORT
    event at **2.36 µA** (`ION_RAMON_GPIOTEPORT`) [D]. About 15 µA extra is more than the whole
    Still-mode CPU line above (~7 µA, DC/DC). The low-power route is the PORT event (GPIO SENSE on
    the pin), but the core's own `GPIOTE_IRQHandler` only handles IN channels, so it would need a
    core change; reading the pin level with `digitalRead()` on a timer avoids GPIOTE altogether,
    because the LSM6DS3TR-C can latch the interrupt (`TAP_CFG` 58h bit 0 `LIR`, cleared by
    reading `WAKE_UP_SRC` 1Bh; ST `lsm6ds3tr-c_reg.h`). The sketch has a test that fails if
    `attachInterrupt` appears (`app/test/wake-motion.test.mjs`).
  - *Longer FIFO drains alone save little.* Draining every 10 s instead of every 1 s moves the
    same bytes over I²C; only the 4-byte status read and the addressing per drain go away, about
    0.15 ms awake per second, so roughly 0.5 µA [E]. The real saving is not reading samples at
    all while the dog lies still (CPU line ~7 → ~0 µA, and the sensor could drop below its
    12.5 Hz 9 µA). That changes what a Still epoch is: there would be no samples to compute it
    from.
  - *The no-sample record (host-tested; both boards write it in Quiet mode, below).*
    `openpaw_nosample_epoch()` in `openpaw_core.h` closes an epoch without samples: record flag
    `0x20` (`NOSAMPLE`), movement fields 0, and pitch/roll set to -128, a value no real posture
    has, so a reader that ignores the flag still sees an impossible posture rather than "lying
    flat". It refuses to run inside a half-filled epoch, keeps `seq` counting and keeps Still
    mode. The app exports no movement or posture events for it, only `device.no_sample` (and the
    battery), with `provenance.quality.no_sample`; the live views skip it; `tools/check_export.py`
    counts it for spacing and leaves it out of the still/moving, burst and posture checks. It
    records only "the sensor was not read", never "the dog was still".
  - *Quiet mode (XIAO, firmware after 0.4.0; compiled and host-tested, not yet run on hardware).*
    After 12 more still epochs in Still mode (1 minute) with no phone, `openpaw_quiet_step()` in
    `openpaw_core.h` stops the FIFO reads. The LSM6DS3TR-C keeps running at 12.5 Hz with its
    wake-up event routed to INT1 and latched (`TAP_CFG` 58h = `0x81`, `WAKE_UP_THS` 5Bh = 1, i.e.
    125 mg at ±8 g, `WAKE_UP_DUR` 5Ch = 0, `MD1_CFG` 5Eh `INT1_WU`). Once per 5 s epoch the CPU
    reads the pin with `digitalRead()` and writes a no-sample record; a high pin, a phone
    connecting, or a check epoch that is not still returns to Active at the full rate, and the
    5 min Still count starts again. Every 12th quiet epoch is a **check epoch**, sampled from the
    FIFO for real, so a dead or miswired pin cannot hide a moving dog for more than about a
    minute: if a check epoch has a burst or a peak of 500 mg or more while the pin stayed low,
    the collar prints `wake_pin=fallback` on the serial port and stays out of Quiet mode until
    the next reboot. Trade-offs: the first up to 5 s of movement after a quiet epoch is a
    no-sample record (the wake is noticed at the epoch boundary), and about 11 of every 12 quiet
    epochs carry no movement or posture. Estimated saving, DC/DC: the Still CPU line (~7 µA)
    drops to roughly one short wake-up per 5 s plus the check epoch's share (~1 µA) [E], so the
    XIAO's Still total goes from ~25 to ~19 µA (parts only); the accelerometer's 9 µA stays. The
    thresholds (125 mg, 500 mg, 1 min) are provisional power settings, not calibrated.
  - *Quiet mode on the T1000-E (compiled and host-tested, not yet run on hardware).* Same state
    machine (`openpaw_quiet_step`), same check epochs and `wake_pin=fallback`. The QMA6100P keeps
    running at its Still rate and clock, and its any-motion engine (datasheet Rev F §7.3: the
    slope between two successive samples) is switched on only in Quiet mode: `ANY_MOT_TH` 2Eh =
    8, i.e. 8 × 16 LSB × 0.977 mg = 125 mg at ±8 g like the XIAO; `ANY_MOT_DUR` 2Ch = 0 (one
    sample); `INT_EN2` 18h = `0x07` (X/Y/Z); `INT1_MAP1` 1Ah = `0x01` (`INT1_ANY_MOT`).
    `INTPIN_CONF` 20h sets INT1 push-pull, active high, and `INT_CFG` 21h sets `LATCH_INT`
    (bit 0) with `INT_RD_CLR` (bit 7) **off**: with it on, any read of 09h–0Dh clears every
    latch, and a check epoch's FIFO status read starts at 0Bh, so the latch would be lost
    before the epoch ends. With it off only reading `INT_STATUS_0` 09h clears it, which the
    firmware does when it enters Quiet mode. Both registers are read-modify-write, because
    the Rev F and Rev A1 datasheets disagree on 21h's default (`0x00` vs `0x0C`) and 20h bit 6
    changes the I²C address. Seeed's T1000-E driver (`qma6100p.c`, `qma6100p_motion_init`) and
    Meshtastic's `QMA6100PSensor.cpp` use the same threshold and map registers. Whether the
    any-motion engine runs correctly at the 12.8 kHz Still clock is not stated in the
    datasheet; a pin that misses motion is caught by the check epoch as above. Estimated
    saving, DC/DC: the Still CPU line (~7 µA) drops to ~1 µA [E], so the T1000-E's Still total
    goes from ~27 to ~21 µA (parts only; ~49 µA after a `qma_clock=fallback`).
- **QMA6100P master clock in Active mode.** Still mode already runs at 12.8 kHz (above).
  Active mode stays at 51.2 kHz; 25.6 kHz would save another ~19 µA if 50 Hz data stays clean
  there. Check the Still-mode rate on a real board first.

## Sources

- Nordic Semiconductor, *nRF52840 Product Specification v1.5*, §5.2 current consumption
  (Seeed mirror: https://files.seeedstudio.com/wiki/XIAO-BLE/nRF52840_PS_v1.5.pdf).
- STMicroelectronics, *LSM6DS3TR-C datasheet*, Table 4 "Electrical characteristics" (Seeed mirror:
  https://files.seeedstudio.com/wiki/XIAO-BLE/ST_LSM6DS3TR_Datasheet.pdf) and *AN5130*, Table 7
  "Power consumption" (https://www.st.com/resource/en/application_note/an5130-lsm6ds3trc-alwayson-3d-accelerometer-and-3d-gyroscope-stmicroelectronics.pdf).
- STMicroelectronics, LSM6DS3TR-C datasheet section 5.5 "FIFO" and register map (FIFO_CTRL3 08h,
  FIFO_CTRL5 0Ah, FIFO_STATUS1-4 3Ah-3Dh, FIFO_DATA_OUT 3Eh), cross-checked against ST's driver
  `lsm6ds3tr-c_reg.h` / `lsm6ds3tr-c_reg.c` (https://github.com/STMicroelectronics/lsm6ds3tr-c, BSD-3-Clause).
- Seeed nRF52 Arduino core 1.1.13, `libraries/Wire/Wire_nRF52.cpp` (`begin()` sets 100 kHz; `setClock()`
  maps anything above 250 kHz to 400 kHz; busy-wait transfers, 64-byte buffer).
- QST, *QMA6100P datasheet Rev F*, section 7.8 "FIFO_INT" and registers 0Bh INT_STATUS_2,
  0Eh FIFO_STATUS, 10h ODR, 3Eh FIFO_CFG0, 3Fh FIFO_DATA (same PDF as below).
- QST, *QMA6100P datasheet Rev F*, table 2 "Power current" (current per master clock), 9.11
  ODR 10h (rate table given for MCLK 51.2 kHz) and 9.12 PM 11h (MCLK[3:0]: 4 = 51.2 kHz,
  6 = 12.8 kHz). Drivers read for other clock settings: Seeed
  `Seeed-Tracker-T1000-E-for-LoRaWAN-dev-board` `t1000_e/peripherals/src/qma6100p.c` and
  `inc/qma6100p_defs.h` (MCLK enum, only 51.2 kHz used); QST's Linux input driver as vendored in
  `tjh-l/HCD3100-8y` `.../gsensor/qma6100p/qma6100p.c` (`qma6100p_set_mode` always 51.2 kHz).
- QST, *QMA6100P datasheet Rev F*, §7.3 "ANY_MOT_INT", §7.9 "Interrupt configuration" and
  registers 09h INT_STATUS_0, 18h INT_EN2, 1Ah INT1_MAP1, 20h INTPIN_CONF, 21h INT_CFG,
  2Ch MOTION_CFG0, 2Eh MOTION_CFG2, 2Fh MOTION_CFG3 (same PDF as below); Rev A1 for the other
  21h default. Cross-checked against Seeed `t1000_e/peripherals/src/qma6100p.c`
  (`qma6100p_motion_init`: threshold in 15.625 mg steps, any-motion on 1Ah bit 0) and Meshtastic
  `src/motion/QMA6100PSensor.cpp` (INT_EN2 `0x07`, `INT1_ANY_MOT`, P1.02).
- QST, *QMA6100P datasheet Rev F*, electrical characteristics, I²C section and table 9 "I2C Timings"
  (fSCL max 400 kHz; fast mode needs external pull-ups)
  (https://qstcorp.com/upload/pdf/202602/13-52-20%20QMA6100P%20Datasheet%20Rev%20F.pdf).
