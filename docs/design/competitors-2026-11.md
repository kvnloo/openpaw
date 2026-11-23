# OpenPaw — Competitor Landing-Page Teardown

Captured **2026-11-23** (Black Friday week, so every competitor hero currently leads with a discount; we judge the page structure under the sale skin). Tooling: Playwright + local headless Chromium (`capture.js`), 1440×900 desktop hero, 1440-wide full page capped at 9000 px, 390×844 mobile hero. Visible page text was saved alongside each capture as `text-<site>.json`; every quote below comes from that text or from the cited URL.

**Capture notes / blockers**
- No site blocked headless Chromium. Every page returned HTTP 200 (after URL fixes).
- `tractive.com/en-us/gps-tracker-for-dogs` and `invoxia.com/us/minitailz` return **404**. I used the live product pages (`tractive.com/en/pd/gps-tracker-dog-variant-1`, `petcare.invoxia.com/en-US`). Invoxia's current dog collar is the **"Biotracker"**. The Minitailz name survives only in blog posts.
- **Whistle no longer exists.** `whistle.com` 301-redirects to `tractive.com`. Tractive bought Whistle from Mars Petcare in July 2025, and Whistle devices stopped working on 31 Aug 2025 ([Tractive press release](https://tractive.com/blog/en/press/tractive-acquires-whistle), [The Verge](https://theverge.com/news/714775/tractive-whistle-pet-tracker-acquisition)). Captured as `whistle-redirects-to-tractive-home-*.png`. **This is the strongest single proof point for "your data and device shouldn't die with a company."**
- Cookie banners: the script auto-dismissed most of them. Remaining overlays: Halo's "Privacy Notice" toast (bottom-right of `halo-desktop-hero.png` and the mobile hero) and PetPace's semi-transparent "$200 off" Black Friday modal over the hero (`petpace-desktop-hero.png`). The text behind both is still readable.
- `invoxia-shop-desktop-full.png` loads lazily. Below about 3,000 px it shows blank placeholders, so for the lower Invoxia sections I relied on `invoxia-full.txt` (full DOM text, 40k chars).
- Full pages were first captured by resizing the viewport, which blew up `100vh` heroes (Oura, Whoop). I re-captured them with `fullPage` at 900 px viewport. The current `*-desktop-full.png` files are the corrected versions.
- Added **FitBark** (still active, has subscription pricing). Skipped Wagz and Garmin: neither has a dog-health collar landing page comparable to this category, and time was better spent elsewhere.

---

## 1. Competitor tables

### 1.1 Tractive — DOG 6 / DOG 6 XL (market leader; absorbed Whistle)
| Field | Finding |
|---|---|
| URLs | Home https://tractive.com/en-us · Product https://tractive.com/en/pd/gps-tracker-dog-variant-1 |
| Hero headline (verbatim) | Home: **"New Smart Trackers Just Dropped"**. Product page H1: **"Smart Dog Tracker"** with the eyebrow "The no. 1 pet tracker on Trustpilot" |
| Subhead | "Advanced health insights in a comfortable tracker they can wear all day. Meet the CAT 6 Mini & DOG 6 XL from Trustpilot's #1 pet tracker brand." |
| Primary CTA | "Dog Tracker" / "Cat Tracker" (home); "Add To Cart" (product) |
| Price | DOG 6 **$79** list (showing **$47.40**, 40% off). "Choose subscription after purchase." (product URL) |
| Subscription | **Required.** 1-yr $12/mo ($144/yr) · 2-yr $8.50/mo ($204) · 5-yr $6/mo ($360). "The subscription price is separate from the tracker." (product URL) Setup requires "Choosing your subscription plan (requires your payment information)" ([help](https://help.tractive.com/hc/en-us/articles/34847898744978-How-to-set-up-your-DOG-6-XL)) |
| HR/HRV | "Heart & Respiratory Rate Monitoring*", resting only: "collected while they're sleeping or resting" (product URL). No HRV claim found. |
| GPS | "Precise GPS Live Tracking & Escape Alerts", virtual fences, worldwide LTE |
| Behavior | "NEW: Scratch Monitoring". Bark and separation-anxiety monitoring on DOG 6 ([help](https://help.tractive.com/hc/en-us/articles/360001285329-Which-tracker-is-right-for-my-pet)). "Weekly Report… AI-powered summary of their well-being" |
| Vet sharing / data | Plan table lists **"GPS Data Export"** and "365-Day Location History" (product URL). No export of health or raw sensor data is advertised. Disclaimer: "Tractive is not a medical device… not intended to diagnose" (home) |
| Trust signals | Trustpilot 4.7 / 62,016 reviews; App Store 4.7 / 39,000; "Trusted by millions"; celebrity ambassadors (Martin Rütter, Ben Fogle…); "AS SEEN IN" press row; 30-day refund |
| Visual style | White plus Tractive blue (~#1A73E8), lime promo accents (~#D9FF66) and a coral sale bar. Poppins-style geometric sans. Full-bleed **lifestyle video** hero (cat, hand), rounded-corner hero card, pill CTAs. Product page uses an Amazon-style PDP pattern: gallery on the left, variant cards on the right. → `tractive-home-desktop-hero.png`, `tractive-desktop-hero.png` |

### 1.2 Fi — Series 3+ / Mini / Ultra
| Field | Finding |
|---|---|
| URL | https://tryfi.com/ (redirects to fitracking.com) |
| Hero headline | **"The most advanced technology to keep your dog safe and healthy."** |
| Subhead | "Unmatched live GPS and AI-powered health insights for every breed, and every need." |
| Primary CTA | "Shop all products" (yellow pill). Secondary: "Take the quiz" in the nav |
| Price | Series 3+ **$129**, Mini $99, Ultra $299 ([Fi billing FAQ](https://support.tryfi.com/hc/en-us/articles/7048727038995-Fi-Membership-Billing)). Home shows "50% off any Fi with code BLACKFRIDAY" |
| Subscription | **Required.** "an active Membership is required." $99 / 6 mo · **$189 / yr** · $339 / 2 yr. A membership "will start automatically" if you don't activate within 7 days of shipping (same FAQ). Year 1 on Series 3+ = **$318** |
| HR/HRV | None claimed on the home page |
| GPS | "Always-on, live GPS keeps your dog on the map"; Ultra is "Starlink-powered" |
| Behavior | AI behavior feed covering activity, rest, eating, scratching, barking, drinking, licking. "Catch extra scratching, licking and other behaviors that could signal distress." "619+ million behaviors recorded for our training models." |
| Vet sharing | App mock has a "Vets" tab and a "Documents" tab. Testimonial: "Fi caught the trend and gave us data to show the vet." Nav has "For Vets" |
| Trust signals | **TIME Best Inventions 2026** ribbon; named member testimonials with tenure ("6-year Fi member"); big-number stats (619M behaviors, 8.64M insights, 100M hours) |
| Visual style | Black nav, **Fi yellow (~#FFE600)** CTAs, green promo bar. Tight, heavy grotesk headline set in negative tracking. Full-bleed **video/photo of a dog wearing the blue device**. Sections alternate between photo, phone-UI mock and stat band. Strong editorial/athletic feel. → `fi-desktop-hero.png`, `fi-desktop-full.png` |

### 1.3 Invoxia — Biotracker (formerly Minitailz)
| Field | Finding |
|---|---|
| URL | https://petcare.invoxia.com/en-US |
| Hero headline | **"GPS collar for dogs • Biotracker"** |
| Subhead | **"Everything your dog can't tell you."** |
| Primary CTA | "Choose my model" (lime pill), with "Starting at $95.20 · Free shipping" beneath |
| Price | "Starting at $95.20" (Black Friday: "-30% with 1 year of subscription") |
| Subscription | **"No mandatory subscription"** for the **Basic** tier, which is free but keeps "**7 days of history**", syncs "Bluetooth only", and has deferred GPS. **Plus** $7.50/mo ($89.90/yr). **Max GPS** $10.83/mo ($129.95/yr) for live GPS and escape alerts (`invoxia-full.txt`, same URL) |
| HR/HRV | "continuously measures heart rate, variability (HRV), and resting respiratory rate." "detects early signs of atrial fibrillation (Afib)." The blog cites "99% accuracy for heart rate" ([blog](https://invoxia.com/blog/petcare/minitailz-the-smartwatch-for-dogs)) and AF sensitivity of 92.1% ([blog](https://invoxia.com/blog/petcare/minitailz-upgrades-afib-detection-canine-heart-health)) |
| GPS | LTE-M live tracking and safe zones, **Max GPS only** |
| Behavior | "neural network recognizes more than 10 different behaviors… walking, running, trotting, eating, sleeping, restlessness". **"Ask your dog"**: the dog answers "in the first person… why they were restless this evening, what the storm made them feel" (Plus/Max) |
| Vet sharing | Strongest in the category: "**You arrive at the vet with evidence, not impressions.**" "With one click, send a complete PDF report to your vet." Also a "Biotrack Vet" clinic platform |
| Trust signals | "CES Award for AI innovation", "Veterinarian-approved", "Rated 4.2/5", money-back guarantee, vet/cardiologist advisory board |
| Visual style | Navy promo bar, white nav, lime (~#D4FF5A) CTA. Neutral grotesk (Inter-like). Lifestyle **video** hero with a frosted-glass map card overlay; centered text; check-mark trust strip under the hero; phone-UI card grid. → `invoxia-shop-desktop-hero.png` |

### 1.4 PetPace — Smart Health Collar (3.0)
| Field | Finding |
|---|---|
| URL | https://petpace.com/ · Product https://petpace.com/product/collar-v3/ |
| Hero headline | **"The PetPace Value Nobody Else Can Claim"**, with the italic serif sub-line "Love them longer" |
| Subhead | Eight bold-lead claim paragraphs instead of a subhead (e.g. "The only company detecting pain in dogs.") |
| Primary CTA | "Shop For Dogs" (black pill) / "Shop For Cats"; "Shop" (purple) in the nav |
| Price | Collar **$399** (product URL). "$200 BF discount (BF200)" |
| Subscription | **Required.** 1 yr billed $300, 2 yr $400, 3 yr $500, then "**$200 per following year**" (product URL). Year 1 list = **$699** |
| HR/HRV | "Respiration, temperature, pulse, and HRV – the most sensitive indicator of stress." "readings taken every few minutes" |
| GPS | "GPS and Safe Zone, too", LTE |
| Behavior | "Sees pain, stress, and subtle changes". Testimonial category "Anxiety and Stress". "Built-in pregnancy and epilepsy programs" |
| Vet sharing | "A licensed vet on call 24/7. Free." "Your pet's data, shared right in the conversation." Professionals portal |
| Trust signals | "Clinically validated… backed by 10 years of clinical research"; "Award-Winning Pet Health Innovation"; press logos; long testimonial wall |
| Visual style | Dark navy nav, purple (~#6B5CE7) accent, Poppins sans mixed with **italic display serif** ("Always There.", "Act Sooner.", "Face to Face."). Cut-out dog photo; dense text-wall hero. Medical-luxury mood. → `petpace-desktop-hero.png`, `petpace-desktop-full.png` |
| Note | The claim set is aggressive ("No competitor has this", "The only collar that measures real vital signs"). That is a credibility gap OpenPaw can contrast with plain, scoped language. |

### 1.5 Halo Collar 5 — GPS fence + trainer
| Field | Finding |
|---|---|
| URL | https://www.halocollar.com/ |
| Hero headline | Sale skin: **"Save 30% on Halo Collar 5"**. Evergreen H2: **"The ultimate smart collar"** |
| Subhead | "Our lowest price ever on the GPS dog fence that goes wherever you do." |
| Primary CTA | "Shop Black Friday" (yellow) plus "Meet Halo Collar" (video) |
| Price | Halo Collar 5 **$599** list, **$419** on sale, "or $29/mo with Affirm" |
| Subscription | **Required.** "A Pack Membership Plan is required to activate and maintain GPS services… Plans start at $9.99/mo." |
| HR/HRV | None |
| GPS | "Precision+ GPS… within two feet", "20 location updates per second", unlimited virtual fences |
| Behavior | Training: "Developed with Cesar Millan… positive association". Correction by "sound, vibration and **static** feedback" |
| Vet sharing | None |
| Trust signals | Cesar Millan, "over 350 breeds", 90-day money-back, 1-yr warranty, testimonials |
| Visual style | White plus **Halo yellow (~#FFD52E)**, near-black hero card. Inter-like sans. **Studio product renders** (a fan of 7 colorways) beside lifestyle photo carousels. "How it works" as four dark cards. → `halo-desktop-hero.png`, `halo-desktop-full.png` |
| Relevance | Different job (containment), but its static correction is the opposite of a reactive-dog, welfare-first positioning. OpenPaw is measurement only: no stimulus. |

### 1.6 FitBark GPS (added)
| Field | Finding |
|---|---|
| URL | https://www.fitbark.com/ · Plans https://fitbark.com/plans |
| Hero headline | **"Meet the Smallest Pet Tracker Ever Built"** |
| Subhead | None in the hero. Below it: "Live GPS Tracking / Location History / Health Monitoring" |
| Primary CTA | "Buy FitBark GPS" |
| Price | **$69.95** list, $34.95 sale (plans URL) |
| Subscription | **"In-app subscription required"**: $60 / 6 mo · $96 / yr · $144 / 2 yr · $180 / 3 yr · $240 / 5 yr (plans URL) |
| HR/HRV | None |
| Behavior | "Activity, sleep & behavioral monitoring", "AI-powered wellness alerts"; "more than 100 vet schools use it" |
| Trust signals | "Trusted by pet parents in 150+ countries", 534 reviews, 2-year warranty, "Chat with a human 24/7", an AirTag comparison |
| Visual style | Teal (~#0A7E8C) logo and CTA, cinematic redwood-forest **video** hero, bold rounded sans. → `fitbark-desktop-hero.png` |

### 1.7 Whistle — defunct
`whistle.com` redirects to Tractive. Devices were shut off on 31 Aug 2025 and existing warranties were not honored ([The Verge](https://theverge.com/news/714775/tractive-whistle-pet-tracker-acquisition)). → `whistle-redirects-to-tractive-home-desktop-hero.png`

### 1.8 Cost-of-ownership snapshot (list prices, cheapest annual plan where one is required)
| Product | Hardware (list) | Required sub, year 1 | Year-1 total | Source |
|---|---|---|---|---|
| Tractive DOG 6 | $79 | $144 (1-yr) | **$223** | product URL |
| Fi Series 3+ | $129 | $189 | **$318** | Fi billing FAQ |
| Invoxia Biotracker | from $95.20 (sale) | $0 Basic (7-day history, BT only) / $129.95 Max GPS | $95–$225 | petcare.invoxia.com |
| PetPace 3.0 | $399 | $300 | **$699** | collar-v3 page |
| Halo Collar 5 | $599 | ≥ $119.88 ($9.99 × 12) | **≥ $719** | halocollar.com |
| FitBark GPS | $69.95 | $96 | **$166** | fitbark.com/plans |
| **OpenPaw** | **~$50 DIY** (T1000-E card; H10 strap optional, sold separately) | **$0** | **~$50** | project brief |

Caveat for honest comparison: OpenPaw has **no cellular GPS live-tracking or escape alerts**, it is DIY, and its firmware has **not yet run on hardware**. The comparison only holds for the behavior-measurement job, not for lost-dog tracking.

---

## 2. Recurring page-structure patterns (competitors)

Section order that recurs across Tractive, Fi, Invoxia, Halo and PetPace:

1. **Promo bar.** Sale or urgency strip, every site. (Evergreen version: a shipping or guarantee line.)
2. **Hero.** Full-bleed lifestyle video of a dog wearing the device (Fi, Tractive, FitBark, Invoxia), or a product-render card (Halo). One headline, one subhead, one or two pill CTAs. Price is usually *not* in the hero, except Invoxia's "Starting at".
3. **Trust strip** directly under the hero: star ratings and review counts (Tractive), check-mark claims (Invoxia: "No mandatory subscription · Early disease detection · Veterinarian-approved"), award badges (Fi TIME ribbon).
4. **3–4 pillar cards**: GPS / Health / Alerts (Tractive "Precise GPS Tracking / Smart Health Monitoring / Early Health Alerts"; Invoxia; Halo).
5. **Product picker**: model cards by dog size (Fi "Find the Fi that fits", Tractive DOG 6 vs XL).
6. **Feature deep-dives**, alternating photo and **phone-UI mock** with fake-but-plausible data ("Ziggy's activity was down 81% Wednesday"). Fi does this best.
7. **AI / data-scale credibility**: big numbers (Fi "619+ million behaviors"), "Clinically validated" (PetPace).
8. **Vet angle**: report or vet-on-call (Invoxia "evidence, not impressions"; PetPace "vet on call 24/7").
9. **Comparison vs microchip/AirTag** (Fi "Chips and AirTags only go so far", FitBark).
10. **Testimonial wall** with named owners and dog names, often split by use case (PetPace: Senior / Pain / Anxiety / Epilepsy).
11. **Pricing / plans table**: subscription tiers, usually *below* the fold or only on the PDP; the hardware price is shown separately from the plan.
12. **FAQ** accordion, where the subscription requirement is often explained.
13. **Newsletter + mega-footer.**

Other observations:
- The subscription requirement sits low on every page ("Choose subscription after purchase", "Select your Pack Membership Plan after purchase"). Only Invoxia puts its no-mandatory-subscription line in the hero strip, and it is the one competitor partly positioned against lock-in.
- Every "behavior" story is health-adjacent (scratching, licking, drinking, pain). **No competitor speaks to reactive dogs, trigger logging, or behaviorist workflows.** PetPace's "Anxiety and Stress" testimonial is the closest.
- Mobile heroes (`_contact-sheet-mobile-heroes.png`): every competitor keeps headline and CTA above the fold at 390×844. Halo loses about 15% of the screen to the privacy toast, and PetPace's text-heavy hero pushes the CTA below the fold.

---

## 3. Where competitors are weak, and what OpenPaw can honestly own

| Vulnerability (evidence) | OpenPaw's honest counter | Don't overclaim |
|---|---|---|
| **Subscription lock-in.** Every GPS competitor requires a plan to function: Tractive, Fi (auto-starts after 7 days), PetPace ($200/yr forever), Halo, FitBark. Year-1 costs run $166–$719 (§1.8). | "~$50 once. No subscription. No account required." | OpenPaw has no LTE GPS, so this is not a like-for-like trade. Say "for behavior measurement". |
| **Device death on acquisition.** Whistle devices bricked 31 Aug 2025; "A sealed, never-opened Whistle device can't even be activated" ([Life360 blog](https://life360.com/blog/whistle-vs-life360-pet)). | Open protocol plus GPL-3.0 firmware, local Web Bluetooth, no vendor cloud in the loop. "If we disappear, your collar still works." | State it as a design property, not a promise of longevity. |
| **Closed / partial data.** Tractive exports GPS data only (plan table). Invoxia offers a PDF report and its free tier keeps **7 days** of history. No competitor page advertises raw sensor or health export in an open format. | "Your raw data, exportable: every 5-second sample, CSV/JSON, owner-controlled." | Verify the export format names against the shipped web app before publishing. |
| **Black-box scores and emotional claims.** Fi "AI-powered health insights"; PetPace "Health Scores", "Sees pain, stress"; Invoxia "Ask your dog… what the storm made them feel"; Tractive "AI-powered summary". | Transparent metrics with published definitions (VeDBA intensity, burst counts, posture, HR/RR from H10). Open math anyone can audit. "We measure movement. You and your behaviorist interpret it." | **Never** say stress, anxiety, pain, emotion or diagnosis. No accuracy percentages until validated. |
| **No reactive-dog / behaviorist workflow.** Vet sharing exists (Invoxia PDF, PetPace vet chat, Fi "Vets" tab) but is health-oriented. Nobody models baseline → trigger → reaction → recovery. | Lead with the reactive-dog timeline: log a trigger, see the burst, measure time back to baseline, share with a behaviorist or vet. | Say "helps you document", not "reduces reactivity". |
| **Aversive hardware in category.** Halo includes "static" correction. | "Measurement only. No shocks, no beeps, no stimulus. Ever." | Factual contrast only; don't attack Halo by name on the page. |
| **Credibility inflation.** PetPace: "No competitor has this", "The only collar that measures real vital signs". | An honest status block ("Firmware compiles and passes host tests; hardware validation in progress") builds trust with the technical early-adopter audience. | Hiding the status would turn this strength into a liability. |
| **Price.** Hardware ranges from $69.95 to $599 list, before plans. | ~$50 of off-the-shelf parts with a public BOM. | Name the parts (Seeed T1000-E) and link to the vendor; the price may move. |

---

## 4. Design patterns worth stealing (inspiration pages)

| Pattern | Where (screenshot) | How OpenPaw uses it |
|---|---|---|
| **Annotated hardware callouts**: thin leader lines with small mono labels ("1.4" monochrome LCD display… / USB Type-C Power & charging Firmware update / GPIO pins 3.3V logic levels") on a clean white render, three views | `insp-flipper-desktop-full.png` (y≈2400–4400) | T1000-E card with callouts: accelerometer, BLE, battery, button, LED, drag-and-drop USB flashing. Add a fourth view of the collar mount. |
| **Toy-like product hero on a scatter of real objects** (keyfobs, RFID cards, wires around the device) | `insp-flipper-desktop-hero.png` | Flat-lay of the T1000-E, collar, Polar H10, phone with web app, leash and treat pouch: "everything in the kit". |
| **One-line capability statement plus "fully open-source"** in the hero body ("It's fully open-source and customizable") | `insp-flipper-desktop-hero.png` | Put "GPL-3.0 · open protocol" in the hero sub-copy, not buried in the footer. |
| **Exploded / opened hardware on color-block cards** (orange Laptop 16 exploded, green Laptop 13 opened with parts) | `insp-framework-desktop-full.png` (y≈3100–4500) | Exploded collar render: card, strap, mount, optional H10. Use one soft color block per section. |
| **Parts grid / "Let's fix Consumer Electronics" mission block**: overhead grid of every component and a short manifesto | `insp-framework-desktop-full.png` (y≈6300–7300) | "Let's fix pet tech." manifesto plus an overhead BOM flat-lay that links to the BOM. |
| **"Preview Edition" honesty**: product named as a preview, timeline of the vision ("Year of the voice → … → Fully-local voice for everyone") | `insp-ha-voice-pe-desktop-full.png` (y≈1050–1650) | "OpenPaw Preview" badge plus a public roadmap timeline: Protocol → Firmware (host-tested ✓) → First hardware run → Behaviorist pilot. |
| **"IN SHORT" bento grid** of 4–5 key facts with arrow links | `insp-ha-voice-pe-desktop-full.png` (y≈1700–2450) | Bento: $50 once / No subscription / Your raw data / Reactive-dog timeline / Open protocol. |
| **Giant price band** ("Preview the future of voice for just $69 / 59€*") | `insp-ha-voice-pe-desktop-full.png` (y≈2500–3000) | "Build your own for about $50", with a footnote on parts pricing. |
| **"Every purchase supports the Open Home"** funding-transparency card | `insp-ha-voice-pe-desktop-full.png` (y≈3000–3300) | "Where your money goes": parts go to Seeed and Polar, $0 to OpenPaw. Honest, and disarming. |
| **Community video wall** ("Straight from the community"): YouTuber reviews in a masonry grid | `insp-ha-voice-pe-desktop-full.png` (y≈3300–4500) | Later: builder photos and behaviorist quotes. Until real ones exist, use a "Be one of the first builders" placeholder, never fake testimonials. |
| **Line-art system diagram on a dark teal field** ("BUILT FOR HOME ASSISTANT") | `insp-ha-voice-pe-desktop-full.png` (y≈4700–5800) | Line diagram: collar → BLE → browser (web app) → CSV → behaviorist. No cloud box in the middle. |
| **Local vs cloud processing diagram** with labeled boxes | `insp-ha-voice-pe-desktop-full.png` (y≈6600–7500) | "Where your data lives": on the collar → your browser → your file. |
| **Mono-type terminal hero + live stat chips** ("100+ Community Supported Devices / 1,800+ Code Contributors"), GitHub button in the nav, "Supported By" vendor logos | `insp-meshtastic-desktop-full.png` | GitHub stars, commits and tests-passing chips; "Get Started" plus "Need Hardware?" plus "Read the Docs" CTA trio. Meshtastic already runs on Seeed hardware, so a Seeed logo row is plausible once true. |
| **Long spec list as typographic texture**: centered tiny type listing 100 features, extreme whitespace, lowercase headlines ("louder, thinner and 100 times better.") | `insp-teenage-engineering-desktop-full.png` | Full spec sheet (sample rate, metrics, BLE characteristics, battery) set in small mono, centered. Signals engineering confidence. |
| **Warm-neutral premium health aesthetic**: cream (#F5F0E8), high-contrast editorial serif headline, single product hero on a soft ribbon; app screens shown as a fanned row of phones | `premium-oura-desktop-hero.png`, `premium-oura-desktop-full.png` | Visual direction B (below). The fanned phone row suits the timeline / baseline / recovery screens. |
| **Membership trio cards** and "Get started for free" band | `premium-whoop-desktop-full.png` (y≈1000–2400) | Invert it: one card, "$0/mo forever", next to the competitors' columns (no names, just category ranges). |
| **Oura "Understand your body. Own your health."** ownership language | `premium-oura-desktop-full.png` | Language to borrow: ownership of *data*, which OpenPaw can back up literally. |

---

## 5. Recommendations for an S-tier OpenPaw landing page

### 5.1 Section list (in order)
1. **Status bar** (not a sale bar): "Preview · Firmware host-tested, first hardware run in progress → Roadmap".
2. **Hero.** Headline, one-sentence sub, CTAs **"Build yours (~$50)"** and **"Open the web app"**, with a GitHub-stars chip. Visual: annotated T1000-E on a collar, or a dog-walk photo with a live timeline overlay.
3. **Trust strip** with true claims only: "GPL-3.0 · Open protocol · No subscription · No account · Raw data export · Measurement only".
4. **The reactive-dog problem.** A three-beat story: you can't remember what happened on the walk; your behaviorist asks for data you don't have; the apps that exist score "wellness", not reactions.
5. **The timeline (hero feature).** Baseline → Trigger → Reaction → Recovery, rendered as a real chart from a sample/synthetic session (labeled "example data"). Callouts: VeDBA intensity, burst (lunge/shake), posture, optional HR/RR from Polar H10.
6. **What it measures, and what it doesn't.** Two columns. Left: "every 5 s: movement intensity, bursts, posture; HR/RR with optional chest strap". Right: "no emotion scores, no diagnosis, no 'stress level', no GPS tracking".
7. **How it works in 3 steps.** ① Buy the Seeed card and strap ② Drag-and-drop the firmware (or `/build-collar` in Claude Code) ③ Open the web app over Bluetooth. Short screen-capture GIF per step.
8. **Annotated hardware** (Flipper-style callouts) plus an **exploded collar** (Framework-style).
9. **Share with your vet or behaviorist.** Export screen; "CSV/JSON you own"; a sample report.
10. **Cost comparison band.** "~$50 once" vs "category: $166–$719 in year one" (cite §1.8 sources on the page or in a linked footnote; avoid naming brands in the hero band).
11. **Open by design.** Open protocol spec, GPL firmware, "if we vanish, it still works" (the Whistle lesson, stated generically), plus "where your money goes".
12. **Honest status and roadmap.** HA-Voice-PE-style timeline with checkmarks and open items. Link to test results and CI.
13. **For behaviorists and researchers.** Protocol docs, data dictionary, "pilot with us" mailto (no forms needed).
14. **FAQ.** "Does it track location?", "Is it a medical device?" (no), "What if my dog chews it?", "Do I need the heart strap?", "Is it tested?"
15. **Footer.** GitHub, docs, license, spec, community.

### 5.2 Hero headline options
1. **"See the reaction. Measure the recovery."**
2. **"The open collar for reactive dogs."**
3. **"Your dog's walks, measured. Your data, yours."**
4. **"$50 once. No subscription. A timeline your behaviorist can actually use."**
5. **"Baseline. Trigger. Reaction. Recovery. Now you have the data."**

Suggested sub (works with any of them): *"OpenPaw is an open-source collar you build in an afternoon. It records movement every 5 seconds, plus heart rate with an optional chest strap, so you can share a real reaction timeline with your vet or behaviorist. No subscription, no account, no black-box scores."*

### 5.3 Visual direction: two options
**A. "Field Instrument" (open-hardware lab):** Flipper × Meshtastic × Teenage Engineering.
- Off-white (#F4F2EE) base, graphite text (#1D1D1B), one signal accent (safety orange #FF5A1F *or* field green #2F8F5B), a second data color for HR.
- Mono for labels, numbers and specs (JetBrains Mono / IBM Plex Mono); neutral grotesk for headlines (Inter Tight / Söhne-like).
- Studio renders on white with leader-line callouts; real charts drawn as thin-stroke instrument plots; a dark-teal line-art system diagram section.
- Feels like a precise, auditable tool. Best for the dev/maker/behaviorist early audience.

**B. "Calm Care" (premium consumer, warm):** Oura × HA Voice PE.
- Cream (#F5F0E8) and sand, ink text, muted sage accent (#8FA98B), soft coral for the "trigger" marker on the timeline.
- Editorial serif for headlines (e.g. GT Sectra / Tiempos-like), humanist sans for body.
- Natural-light photography of a real reactive dog on a calm walk (own photos, not stock); app screens as a fanned phone row; generous whitespace.
- Feels trustworthy and gentle. Best for owners and behaviorists who are not makers.

Recommendation: **A for launch** (the product is DIY and pre-hardware, and the audience is technical), with B's warmth applied to photography and the reactive-dog story section.

### 5.4 Must-avoid list
- ❌ Any emotional or clinical inference: "stress", "anxiety level", "pain", "mood", "calm score", "detects", "diagnoses", "early warning". (Invoxia's "what the storm made them feel" is the anti-pattern.)
- ❌ Accuracy percentages, "clinically validated", "vet-approved" or "behaviorist-approved" until real validation exists.
- ❌ Fake testimonials, invented user counts or GitHub numbers, stock "happy dog" photos posing as users.
- ❌ App-UI mockups with fabricated dog stories unless clearly labeled "example data".
- ❌ Implying GPS, lost-dog tracking or escape alerts (OpenPaw doesn't do them).
- ❌ Hiding the honest status. Also avoid overclaiming it: the firmware is host-tested, not hardware-tested.
- ❌ Naming competitors in attack copy. Use category facts with footnoted sources.
- ❌ Countdown timers, sale bars, dark-pattern urgency, email-gated downloads.
- ❌ Overloaded heroes (PetPace's eight-claim wall) and blocking modals (PetPace BF popup).
- ❌ Claiming Web Bluetooth works everywhere. Note browser support (Chrome/Edge/Android; iOS Safari needs a workaround).

---

## Screenshot index
Competitors: `tractive-home-desktop-hero.png`, `tractive-home-desktop-full.png`, `tractive-home-mobile-hero.png`, `tractive-desktop-hero.png`, `tractive-desktop-full.png`, `tractive-mobile-hero.png`, `fi-desktop-hero.png`, `fi-desktop-full.png`, `fi-mobile-hero.png`, `invoxia-shop-desktop-hero.png`, `invoxia-shop-desktop-full.png`, `invoxia-shop-mobile-hero.png`, `petpace-desktop-hero.png`, `petpace-desktop-full.png`, `petpace-mobile-hero.png`, `halo-desktop-hero.png`, `halo-desktop-full.png`, `halo-mobile-hero.png`, `fitbark-desktop-hero.png`, `fitbark-desktop-full.png`, `fitbark-mobile-hero.png`, `whistle-redirects-to-tractive-home-{desktop-hero,desktop-full,mobile-hero}.png`
Inspiration: `insp-flipper-*`, `insp-framework-*`, `insp-ha-voice-pe-*`, `insp-meshtastic-*`, `insp-teenage-engineering-*`
Premium: `premium-oura-*`, `premium-whoop-*`
Overview: `_contact-sheet-mobile-heroes.png`
Raw text: `text-*.json`, `invoxia-full.txt`. Scripts: `capture.js`, `textdump.js`, `sheet.js`.

---
Screenshots referenced above were captured locally on 2026-11-23 and are not committed (third-party pages). The landing-page target mockup is `landing-target-r0.png` (AI-generated direction "B night instrument", chosen from three; page assets in `site/img/` are AI-generated illustrative images, not product photos).
