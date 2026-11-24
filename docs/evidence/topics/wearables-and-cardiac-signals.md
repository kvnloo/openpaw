# Wearables, heart rate and HRV

## What is supported
Accelerometry can distinguish coarse movement categories in validated settings, and HRV calculations depend on signal quality, processing and physiological context. [Bolton 2021](../cards/bolton2021-use-of-a-collar-mounted-triaxial-accelerometer-to.md) [Suttkus 2026](../cards/suttkus2026-feasibility-of-extracting-reliable-canine-heart-rate-variability.md) [Shimamura 2026](../cards/shimamura2026-applicability-of-autoregressive-spectral-analysis-for-heart-rate.md) [Varga 2018](../cards/varga2018-heart-rate-and-heart-rate-variability-during-sleep.md)

OpenPaw should store placement, activity or posture, device and algorithm version, signal-quality flags and the exact measurement window before comparing observations. [Reinstein 2025](../cards/reinstein2025-analysis-of-dog-movement-using-a-single-accelerometer.md) [Karimjee 2024](../cards/karimjee2024-a-standardised-approach-to-quantifying-activity-in-domestic.md) [Suttkus 2026](../cards/suttkus2026-feasibility-of-extracting-reliable-canine-heart-rate-variability.md) [Varga 2018](../cards/varga2018-heart-rate-and-heart-rate-variability-during-sleep.md)

## What is contested
Device performance is not interchangeable: a movement-tracking study showed weaker on-leash agreement, while another found no clear effect of its tested leash or positioning setups, and an energy-estimate validation had poor agreement. [Colpoys 2021](../cards/colpoys2021-evaluation-of-the-fitbark-activity-monitor-for-measuring.md) [McCarter 2025](../cards/mccarter2025-leash-attachment-and-device-position-on-the-collar.md) [Sekhar 2023](../cards/sekhar2023-commercially-available-wearable-health-monitor-in-dogs-is.md)

## What is unknown
These studies do not yield general collar HR/HRV bands for behavior classification or prove that a physiological change specifies emotion. [Beerda 1998](../cards/beerda1998-behavioural-saliva-cortisol-and-heart-rate-responses-to.md) [Varga 2018](../cards/varga2018-heart-rate-and-heart-rate-variability-during-sleep.md) [Koskela 2024](../cards/koskela2024-behavioral-and-emotional-co-modulation-during-dog-owner.md) [Melek 2026](../cards/melek2026-accuracy-and-agreement-of-a-wearable-device-for.md)

## Quantitative anchors
| Study observation | Reported value | Use and boundary | Source |
| --- | --- | --- | --- |
| Actigraph reliability by wear window | 3 d: 91% (95% CI 82–96%); 7 d: 94% (88–97%) | Keep observation length and uncertainty; results are device-specific. | [Yam 2011](../cards/yam2011-validity-practical-utility-and-reliability-of-actigraph-accelerometry.md) |
| Treadmill gait classification | Walk vs faster gait pseudo-R² 0.87; inaccurate speed above 3 m/s | Do not apply as a field speed rule. | [Bolton 2021](../cards/bolton2021-use-of-a-collar-mounted-triaxial-accelerometer-to.md) |
| Lab heart rates | 75 ± 3 bpm baseline (SEM); mean peaks 146–183 bpm across five stimuli | These are group means from one experiment, not reference intervals. | [Beerda 1998](../cards/beerda1998-behavioural-saliva-cortisol-and-heart-rate-responses-to.md) |
