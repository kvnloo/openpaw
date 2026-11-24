# Search query matrix

Initial search: 2026-11-24. Fetch the first result page from each API separately
for every expression below; default order, no year or language cutoff. The
bounded first-page rules prioritize speed over recall.

- [Europe PMC search API](https://www.ebi.ac.uk/europepmc/webservices/rest/search):
  `query=(TITLE_ABS:dog OR TITLE_ABS:dogs OR TITLE_ABS:canine) AND TITLE_ABS:(EXPRESSION) AND HAS_ABSTRACT:Y`,
  `resultType=core`, `format=json`, `pageSize=40`.
- [OpenAlex works API](https://api.openalex.org/works):
  `search=dog (EXPRESSION)`, `per_page=20`, and the operator's contact
  in the `mailto` parameter. Boolean-looking text is passed as search text;
  the APIs should not be assumed to interpret the strings identically.
  For returned abstracts, reconstruct the word order from the index positions.

| Cluster | Expression |
| --- | --- |
| reactivity | `reactivity OR "leash reactive" OR "leash reactivity" OR "trigger stacking" OR "reaction threshold" OR "lead tension"` |
| fear-aggression | `"fearfulness" OR "dog aggression" OR "canine aggression" OR "fear and anxiety"` |
| modification | `"counterconditioning" OR "counter-conditioning" OR "desensitization" OR "desensitisation" OR "behavior adjustment training" OR "look at that"` |
| welfare | `"aversive training" OR "reward based" OR "electronic collar" OR "training methods"` |
| signals | `"ethogram" OR "body language" OR "stress signals" OR "displacement behaviour" OR "appeasement signals"` |
| pain | `("pain" AND ("behavior" OR "behaviour" OR "activity monitoring" OR "quality of life"))` |
| sleep | `"sleep" OR "polysomnography"` |
| enrichment | `"environmental enrichment" OR "exercise" OR "activity budget"` |
| separation | `"separation anxiety" OR "separation-related problems" OR "separation-related behaviour"` |
| noise | `"noise sensitivity" OR "noise fear" OR "noise aversion" OR "firework fear"` |
| medication | `("fluoxetine" OR "clomipramine" OR "dexmedetomidine" OR "imepitoin") AND ("fear" OR "anxiety" OR "behaviour" OR "behavior")` |
| wearables | `"accelerometry" OR "activity monitor" OR "wearable sensor" OR "accelerometer"` |
| heart | `"heart rate variability" OR ("heart rate" AND ("behavior" OR "activity" OR "wearable"))` |
| scales | `"C-BARQ" OR "canine behavioral assessment" OR "canine behavioural assessment" OR "Lincoln" AND "temperament" OR "LOTE"` |
| aging | `"Dog Aging Project"` |

Targeted source follow-up addressed leash equipment and on-lead behavioral
interventions, laboratory recovery measurements, publication versions, and the
AVSAB position. Source URLs for selections are in the cards. Screens for
named techniques and instruments may have missed studies with different naming;
an evidence gap in this map is not proof of no evidence.
