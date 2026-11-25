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
| **Active** | Default | XIAO: LSM6DS3TR-C at 52 Hz low-power; T1000-E: QMA6100P | 50 per second | Advertising every 1 s (100 ms for the first 30 s) |
| **Still** | 5 min of still epochs (mean VeDBA under 60 mg, no burst, no sensor gap) and no phone connected | XIAO: 12.5 Hz low-power; T1000-E: unchanged | 10 per second | Advertising every 1 s |
| **Connected, downloading** | The app is connected and a backlog download runs (and for 2 s after it ends) | As in Active (a connected phone always gets 50 Hz) | 50 per second | Asks for connection events every 15 ms |
| **Connected, idle** | Connected, no download for 2 s | As in Active | 50 per second | Asks for 200 ms events with peripheral latency 4: the collar may skip up to 4 empty events, so it answers at least once a second, and sooner whenever it has a live record to send |

Any epoch that is not still, any burst, a sensor gap, or a phone connecting switches the collar back to
Active at the next 5 s epoch boundary. Epochs recorded in Still mode carry record flag `0x10` (`LOWRATE`),
and the app exports it as `provenance.quality.low_rate`, so analysis never confuses a 10 Hz epoch with a
50 Hz one. The 60 mg limit is a provisional power setting. It is tighter than the app's "still" band
(under 250 mg, which also covers standing), and it has not been calibrated against labelled data.

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

The largest item is the CPU waking for every sample. Each wake reads 6 bytes over
I²C at 100 kHz: about 9 bytes on the wire, roughly 0.8 ms. Assume **~1 ms awake per
sample** [E]. Whether the Seeed core turns on the DC/DC converter is not verified, so
both regulator cases are shown.

| Item | Active, DC/DC | Active, LDO | Still, DC/DC | Still, LDO |
|---|---|---|---|---|
| nRF52840 asleep | 3 µA | 3 µA | 3 µA | 3 µA |
| CPU wake per sample (1 ms × rate × CPU current) [E] | 165 µA | 315 µA | 33 µA | 63 µA |
| Accelerometer (XIAO) | 25 µA | 25 µA | 9 µA | 9 µA |
| Advertising at 1 s: 3 channels × ~0.6 ms × ~6.4 mA ≈ 12 µC per event, plus radio start-up [E] | ~15 µA | ~15 µA | ~15 µA | ~15 µA |
| **Total (XIAO, parts only)** | **~210 µA** | **~360 µA** | **~60 µA** | **~90 µA** |

On the T1000-E, the QMA6100P adds 38 µA in both modes instead of the LSM6DS3TR-C
figures. The board's LoRa radio, GNSS and other sensors are never switched on by this
firmware, but their off-state leakage is not in the table.

A dog that lies still most of the day spends most of its time in Still mode, where
this estimate drops by about 3.5× (DC/DC) to 4× (LDO). For example, 16 h still and
8 h active per day averages about 110 µA (DC/DC) [E]. That is a parts-only lower bound.
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
- **FIFO batching.** The LSM6DS3TR-C FIFO can hold samples so the CPU reads them in one burst
  per second instead of waking 50 times. The data stays identical, and the wake-up cost drops by
  about 50×.
- **I²C at 400 kHz.** Both sensors support fast mode. It would shorten each read about 4×.

## Sources

- Nordic Semiconductor, *nRF52840 Product Specification v1.5*, §5.2 current consumption
  (Seeed mirror: https://files.seeedstudio.com/wiki/XIAO-BLE/nRF52840_PS_v1.5.pdf).
- STMicroelectronics, *LSM6DS3TR-C datasheet*, Table 4 "Electrical characteristics" (Seeed mirror:
  https://files.seeedstudio.com/wiki/XIAO-BLE/ST_LSM6DS3TR_Datasheet.pdf) and *AN5130*, Table 7
  "Power consumption" (https://www.st.com/resource/en/application_note/an5130-lsm6ds3trc-alwayson-3d-accelerometer-and-3d-gyroscope-stmicroelectronics.pdf).
- QST, *QMA6100P datasheet Rev F*, electrical characteristics
  (https://qstcorp.com/upload/pdf/202602/13-52-20%20QMA6100P%20Datasheet%20Rev%20F.pdf).
