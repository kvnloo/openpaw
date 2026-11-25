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
| **Active** | Default | XIAO: LSM6DS3TR-C at 52 Hz low-power, samples queued in its FIFO; T1000-E: QMA6100P polled at 50 Hz | XIAO: 1 per second (FIFO read); T1000-E: 50 per second | Advertising every 100 ms for 30 s after boot or a disconnect, then every 1 s; Advertising every 2 s once no phone has connected for 10 min ("parked") |
| **Still** | 5 min of still epochs (mean VeDBA under 60 mg, no burst, no sensor gap) and no phone connected | XIAO: 12.5 Hz low-power, FIFO; T1000-E: unchanged, polled at 10 Hz | XIAO: 1 per second; T1000-E: 10 per second | As in Active (usually parked: 2 s) |
| **Connected, downloading** | The app is connected and a backlog download runs (and for 2 s after it ends) | As in Active (a connected phone always gets the full rate) | As in Active | Asks for connection events every 15 ms |
| **Connected, idle** | Connected, no download for 2 s | As in Active | As in Active | Asks for 200 ms events with peripheral latency 4: the collar may skip up to 4 empty events, so it answers at least once a second, and sooner whenever it has a live record to send |

Any epoch that is not still, any burst, a sensor gap, or a phone connecting switches the collar back to
Active at the next 5 s epoch boundary. Epochs recorded in Still mode carry record flag `0x10` (`LOWRATE`),
and the app exports it as `provenance.quality.low_rate`, so analysis never confuses a low-rate epoch with a
full-rate one. The 60 mg limit is a provisional power setting. It is tighter than the app's "still" band
(under 250 mg, which also covers standing), and it has not been calibrated against labelled data.

On the XIAO an epoch is 260 of the IMU's own 52 Hz samples (63 at 12.5 Hz in Still mode), so its
length follows the IMU's clock: nominally 5 s, not measured. Each sample is dated from the moment
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
| QMA6100P (T1000-E) | Master clock 51.2 kHz (what the firmware sets), any ODR | 38 µA | [D] QST datasheet Rev F, "Power current" |

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
- **Polled (T1000-E):** each sample is its own wake-up and read of about 9 bytes on the wire,
  ~0.2 ms at 400 kHz (0.8 ms at 100 kHz). Counting the wake-up itself, assume **~0.4 ms awake
  per sample** [E] (~1 ms at 100 kHz): 20 ms per second at 50 Hz, 4 ms at 10 Hz.

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

On the T1000-E (polled, 400 kHz) the CPU line is ~66 / ~126 / ~13 / ~25 µA, and with the
QMA6100P's 38 µA the totals are ~115 / ~175 / ~60 / ~75 µA [E].

Advertising every 1 s (the first 10 min after a phone leaves) costs about twice the parked
figure, ~15 µA [E]. Parking saves ~7 µA, which matters most in Still mode (~28% of the
XIAO's Still total). The trade-off: a phone that opens the app waits up to one advertising interval to
see the collar, so about 2 s instead of 1 s (not measured). The 10 min limit and the 2 s
interval are `OPENPAW_ADV_PARK_MS` and `OPENPAW_ADV_PARKED` in `openpaw_core.h`
(`openpaw_adv_step`, host-tested). A connection restores the 100 ms / 1 s pair, so the
next disconnect starts with the fast 30 s again.

On the T1000-E, the QMA6100P adds 38 µA in both modes instead of the LSM6DS3TR-C
figures. The board's LoRa radio, GNSS and other sensors are never switched on by this
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

## What else costs power (not done yet)

- **Wake on motion.** Both accelerometers can raise an interrupt on motion: LSM6DS3TR-C wake-up and
  activity/inactivity, and QMA6100P `ANY_MOT_INT`. The CPU could then sleep until the dog moves,
  instead of polling at 10 Hz. That needs the interrupt pin wiring checked on real boards.
- **FIFO batching on the T1000-E.** Done for the XIAO's LSM6DS3TR-C (above). The QMA6100P also has
  a FIFO; it is still polled. At 400 kHz polling costs ~66 µA of CPU time (DC/DC), so batching
  would save roughly 40 µA in Active mode.

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
- QST, *QMA6100P datasheet Rev F*, electrical characteristics, I²C section and table 9 "I2C Timings"
  (fSCL max 400 kHz; fast mode needs external pull-ups)
  (https://qstcorp.com/upload/pdf/202602/13-52-20%20QMA6100P%20Datasheet%20Rev%20F.pdf).
