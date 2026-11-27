# Build the OpenPaw collar

Three steps, about 15 minutes, no soldering, no software to install.

> **Status:** the firmware compiles for both boards and its feature code passes host tests. It has **not yet been run on real hardware**. Expect rough edges until the first hardware receipts land. Treat everything it reports as movement measurements, not as a diagnosis or a reading of your dog's emotions.

**Using Claude?** Open this repo in Claude Code and run `/build-collar`. It walks you through every step below and checks each one with you.

## 1. Order the parts (about $50)

**Kit A, recommended: sealed, waterproof, no tools needed**

| Part | Price | Where | Notes |
|---|---|---|---|
| Seeed SenseCAP Card Tracker **T1000-E** | $39.90 | [Seeed](https://www.seeedstudio.com/), [Digi-Key](https://www.digikey.com/en/products/detail/seeed-technology-co-ltd/114993369/24814479) | Choose the **"for LoRaWAN / open-source firmware"** version: Seeed's Arduino support targets that one ([guide](https://wiki.seeedstudio.com/t1000_e_arduino_examples/)). It's an 85×55×6.5 mm, 32 g card with an IP65 rating, a 700 mAh battery, an accelerometer and a magnetic USB charger ([specs](https://wiki.seeedstudio.com/t1000_e_intro)). |
| Collar holder for the card | $0–10 | printed T1000-E collar case ([MakerWorld](https://makerworld.com/en/models/2689545-sensecap-t1000e-dog-tracker-case), [Thingiverse](https://thingiverse.com/thing:7138244)), or 2 UV-rated zip ties | Libraries and makerspaces often print for free. Ask for PETG or ASA, not PLA. |
| Flat buckle collar, 25 or 38 mm | $10–20 | any pet store | Use a separate collar just for the sensor. **Never** mount it on a slip, prong or martingale collar. Clip the leash to a harness. |

**Optional heart-rate add-on:** a [Polar H10](https://www.polar.com/us-en/sensors/h10) chest strap ($70–105). It sends beat-to-beat intervals over standard Bluetooth, and the OpenPaw app reads it directly. Polar's older straps have been checked against ECG on dogs (Essner et al. 2015). The H10 itself is widely used in canine studies but has not been formally validated on dogs. Good contact usually needs water or electrode gel, and sometimes trimmed fur. Ask your vet.

**Kit B, a bare board:** a [Seeed XIAO nRF52840 Sense](https://wiki.seeedstudio.com/XIAO_BLE/) ($15.90), a protected 400–500 mAh LiPo and an IP67/68 box (for example a Hammond 1551 series). It is cheaper and has 2 MB of storage, but the battery needs **two solder joints** (a makerspace can do them in 5 minutes). The same firmware runs on it.

## 2. Put the OpenPaw firmware on it (drag and drop)

1. Download the `.uf2` file for your board from the [collar-v0.4.0 release](https://github.com/kvnloo/openpaw/releases/tag/collar-v0.4.0) (all collar releases are [listed here](https://github.com/kvnloo/openpaw/releases?q=collar)):
   - Kit A: `openpaw-collar-t1000-e.uf2`
   - Kit B: `openpaw-collar-xiao-nrf52840-sense.uf2`
2. Put the board into "update mode":
   - **T1000-E:** hold the button and quickly connect the magnetic charging cable to your computer twice. The green LED goes solid ([Seeed instructions](https://wiki.seeedstudio.com/sensecap_t1000_e_meshcore)).
   - **XIAO:** connect USB-C and double-tap the tiny reset button.
3. A USB drive appears (for example `T1000-E` or `XIAO-SENSE`). Drag the `.uf2` file onto it. It copies, the drive disappears and the board restarts. That's it.

Startup light: **1 long green blink** means the motion sensor is working. **5 fast blinks** means no motion sensor was found (see troubleshooting). After that, the light gives one tiny blink every 5 seconds while it records and nothing is connected.

Use only this USB drag-and-drop method. Don't use phone "OTA" or "DFU" updater apps on the T1000-E: Seeed warns they can permanently brick it.

## 3. Open the app and connect

Open **https://kvnloo.github.io/openpaw/app/** in Chrome or Edge (Android, Windows, macOS, ChromeOS). On iPhone, use the free [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) browser. There's nothing to install and no account.

1. Tap **Connect collar** and pick `OpenPaw-XXXX`.
2. You'll see live movement every 5 seconds. Tap **Beep / blink collar** to confirm you're connected to the right device.
3. Optional: tap **Add heart-rate strap** for the Polar H10.
4. Tap **Export OpenPaw JSONL** any time to download everything. Your data stays in your browser until you export it.

The collar keeps recording while your phone is away. Reconnect and tap **Download backlog** to fill the gaps. Firmware 0.2 and later saves epochs to the board's flash chip, about 5 days on the 2 MB chip, and keeps them through a restart or a flat battery (this compiles and passes host tests, including simulated power cuts, but has not yet run on a real board). With firmware 0.2, after a restart the app downloads only what was recorded since that restart, because the collar has no clock to date older epochs. Firmware 0.3 and later can date those too (host-tested, not yet run on hardware): each time the app connects it tells the collar the time, the collar saves that next to its epochs, and later downloads use it. Epochs from a stretch when no phone connected at all between two restarts still can't be dated; the app skips them and says how many. If no flash chip answers at startup, firmware after 0.4.0 saves to the processor's own flash instead: about 15 hours, kept through a restart (compiles and passes host tests, not yet run on a real board). Firmware 0.4.0 and earlier then holds only the last 5.7 hours in memory, as does firmware 0.1.x, and a restart clears it.

Firmware 0.4 and later samples 10 times a second instead of 50 to save battery, once the dog has been still for 5 minutes and no phone is connected. It goes back to 50 at the next 5-second epoch once the dog moves. The export marks those epochs `low_rate`. The power budget is in [POWER.md](POWER.md). It is estimated from datasheets and has not been measured on hardware yet.

## Fit and safety

- **Fit:** snug enough that two fingers slide under the collar. Mount the card **under the neck, the same way up every time** (mark the top with a sticker). The weight (about 32 g) is negligible for medium and large dogs.
- **Water:** IP65 means splashes and rain, not swimming. Take it off for swimming and baths.
- **Chewing:** a punctured lithium battery can burn. Don't leave the collar where your dog can chew it, and remove it if the case is cracked.
- **Charging:** charge with the collar off the dog, at room temperature (0–45 °C), on a non-flammable surface.
- **Reactive dogs:** put the sensor on its own flat collar and put the leash on a harness, so leash pressure never goes through the sensor collar.

## Troubleshooting

| You see | Do this |
|---|---|
| No USB drive appears | Use a data-capable cable (some cables only charge). On the T1000-E, retry the hold-button-and-connect-twice sequence. |
| 5 fast blinks at startup | The motion sensor didn't answer. Reflash. If it keeps happening, open an issue with your board name. |
| App can't find `OpenPaw-XXXX` | The collar advertises quickly for the first 30 s after boot or disconnect, then slows down. Wait a few seconds, keep the phone close and turn Bluetooth on. iPhone: use Bluefy. |
| Battery shows `-` | The collar couldn't see a battery (for example a bare board running on USB power), so it reports "unknown" rather than a guess. The percentage is a rough estimate from the battery voltage. |

## What it measures

Every 5-second epoch produces one record (the source is [openpaw_core.h](../firmware/openpaw-collar/openpaw_core.h)):

- **Movement (VeDBA)**: average dynamic acceleration in milli-g. This is a standard biologging measure of activity.
- **Active share**: the fraction of the epoch spent above 120 mg.
- **Bursts**: sharp events above 1.5 g (lunges, shakes, jumps), counted once each.
- **Posture**: average head pitch and roll.
- **Quality flags**: sensor range exceeded, and gaps.

Research on collar accelerometers supports activity levels, gaits and sniffing (Kumpulainen et al. 2021, [doi:10.1016/j.applanim.2021.105393](https://doi.org/10.1016/j.applanim.2021.105393)), and eating, drinking, scratching and licking (Chambers et al. 2021). Resting postures are weaker on a collar than on a harness. **Physiological arousal is not something a movement sensor measures.** OpenPaw links movement to what you and your trainer or vet observed. It doesn't guess feelings.
