"""Render analysis.md deterministically from the checked-in corpus."""
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def field(row, path):
    for key in path.split("."):
        row = row.get(key) if row is not None else None
    return row


def render(rows, sources):
    by_source = defaultdict(list)
    for row in rows:
        by_source[row["source_id"]].append(row)
    survey = [r for r in rows if sources[r["source_id"]]["design"] == "owner_survey"]
    clinical = [r for r in rows if sources[r["source_id"]]["design"] in ("case_series", "case_report")]
    cohort = [r for r in rows if sources[r["source_id"]]["design"] == "prospective_cohort"]
    n = len(rows)
    lines = ["# Published dog behaviour records", "",
             f"**{n} dogs:** {len(survey)} in an owner survey, {len(cohort)} in a prospective adoption cohort and {len(clinical)} in clinical case publications. "
             "This meets the numerical target for published dog-level records, not for clinical cases or prospective intervention outcomes.",
             "", "| Source | Design | Dogs | Reported outcome |",
             "|---|---|---:|---:|"]
    for key, source in sources.items():
        group = by_source[key]
        outcomes = sum(r["outcome"] is not None for r in group)
        lines.append(f"| [{key}](https://doi.org/{source['doi']}) | {source['design']} | {len(group)} | {outcomes} |")
    lines += ["", "### Signalment", "", "| Field | Observed counts (including missing) |", "|---|---|"]
    for path in ("breed_group", "age_band", "sex", "neutered", "weight_band"):
        counts = Counter(field(r, f"signalment.{path}") for r in rows)
        lines.append(f"| {path} | " + "; ".join(f"{k if k is not None else 'missing'}: {v}"
                     for k, v in counts.most_common()) + " |")
    statuses = Counter(field(r, "medical.contributor_status") for r in clinical)
    health = Counter(field(r, "medical.owner_health_problem") for r in survey)
    lines += ["", "## Medical contributors", "",
              f"- Clinical reports ({len(clinical)} dogs): {statuses['identified']} explicitly identified contributors; "
              f"{statuses['suspected']} suspected; {statuses['none_reported']} none reported; {statuses[None]} unknown.",
              f"- Survey: {health[True]}/{health[True] + health[False]} owners reported a general health problem. "
              "No dog-level contributor assessment was available; this is not a rate of medical contributors.",
              "- None reported is not ruled out. The clinical sources are selected reports, including a series that selected "
              "dogs described as healthy; these counts cannot estimate a prevalence.",
              "- As context only, [Lopes Fagundes et al.](https://doi.org/10.3389/fvets.2018.00017) deliberately sampled "
              "10 noise-sensitivity dogs with a pain focus and 10 without an identified pain focus. Results are mostly aggregate, "
              "so those dogs are not counted here and the 10/20 split is not a prevalence estimate.",
              "", "## Intervention mixes and reported outcomes", "",
              "### Firework survey", "",
              "Groups are based on any listed management measure, any targeted training (preventive or after onset), "
              "and reported prescription use. Different questions refer to different time windows. "
              "A ‘no’ means not reported for that survey item, not verified non-use. "
              "Progression is a retrospective owner rating, not measured change from a baseline.", ""]
    lines += mix_table(survey, lambda r: (
        bool(field(r, "interventions.management")),
        (None if field(r, "interventions.behavior_modification") is None
         else bool(field(r, "interventions.behavior_modification"))),
        field(r, "interventions.prescription_reported")), "Management / training / prescription")
    lines += ["", "### Prospective adoption cohort", "",
              "A positive first-wave loud-noise item defined inclusion; the result is the six-month minus first-wave "
              "rating (negative means a lower reported response). Missing six-month assessments remain missing. "
              "First-wave prescription reporting is an exposure snapshot, not a treatment assignment; "
              "management and training mixes cannot be established from this extraction. Selecting positive "
              "baseline scores also leaves room for regression to the mean.", ""]
    lines += mix_table(cohort, lambda r: (field(r, "interventions.prescription_reported"),),
                       "First-wave prescription reported")
    lines += ["", "### Clinical publications", "",
              "The series excluded psychotropic medication; interventions reflect the published plan, not verified adherence. "
              "These outcomes are not pooled with survey or cohort outcomes.", ""]
    lines += mix_table(clinical, lambda r: (
        bool(field(r, "interventions.management")),
        bool(field(r, "interventions.behavior_modification")),
        bool(field(r, "interventions.medication_classes"))), "Management / behaviour modification / medication class")
    lines += ["", "Volunteer selection, recall and reporting biases, confounding by baseline severity, "
              "and non-concurrent intervention/outcome windows limit interpretation of the survey. "
              "The tiny clinical sample and publication bias favour notable or positive outcomes. "
              "Outcomes and follow-up are heterogeneous; no causal or comparative treatment claims are supported.",
              "", "## Missing data", "",
              "Missing means the extraction has no usable value. Explicit negatives and empty arrays are not missing. "
              "This is a corpus audit, not a systematic estimate for all published literature. "
              "The clinical column shows how the large survey influences the pooled rank.", "",
              "| Field | All missing | Survey missing | Cohort missing | Clinical missing |",
              "|---|---:|---:|---:|---:|"]
    actions = {
        "threshold": "Record trigger distance or intensity, units, and whether estimated or measured; allow not applicable.",
        "frequency_baseline": "Pair episode counts with time watched or opportunities for exposure, including zero-event windows.",
        "precursor_signals": "Log timestamped visible actions and their order, separately from interpretations.",
        "adverse_events": "Track possible adverse events and whether anyone checked; do not infer causation.",
        "follow_up_months": "Schedule check-ins with elapsed time and reuse the baseline measure.",
        "medical.contributor_status": "Separate owner history from clinician findings and explicitly mark uncertainty.",
        "interventions.medication_classes": "Optionally log clinician-reported class and change dates; never suggest doses.",
        "interventions.owner_education": "Record what was explained, when, and by whom, separately from adherence.",
        "context": "Record setting, activity, and exposure circumstances separately from trigger type.",
        "recovery_time": "Time from trigger end to a defined observed baseline; allow approximate ranges and not-yet-recovered.",
        "outcome": "Store the measure, reporter, observation window, and result rather than a global score.",
    }
    paths = [*actions, "signalment.breed_group", "signalment.age_band", "signalment.sex",
             "signalment.neutered", "signalment.weight_band", "presenting_problems", "triggers",
             "medical.findings", "medical.owner_health_problem", "interventions.management",
             "interventions.behavior_modification", "interventions.prescription_reported"]

    def missing(path, group):
        return sum(field(r, path) is None for r in group)

    paths.sort(key=lambda path: (-missing(path, rows), path))
    for path in paths:
        cells = [f"{missing(path, group)}/{len(group)} ({missing(path, group) / len(group):.1%})"
                 for group in (rows, survey, cohort, clinical)]
        lines.append(f"| `{path}` | " + " | ".join(cells) + " |")
    lines += ["", "## Implications for OpenPaw", "",
              "Ranked by missingness in this corpus (ties alphabetical). "
              "Keep owner observations and expert annotations distinct. These are measurement features, not treatment advice. "
              "Training references follow the [AVSAB 2021 humane-training position]"
              "(https://avsab.org/wp-content/uploads/2021/08/AVSAB-Humane-Dog-Training-Position-Statement-2021.pdf).", ""]
    for rank, path in enumerate((p for p in paths if p in actions), 1):
        lines.append(f"{rank}. **{path}** ({missing(path, rows)}/{n} missing): {actions[path]}")
    return "\n".join(lines) + "\n"


def mix_table(rows, key, label):
    levels = ("improved", "unchanged", "worsened", "mixed", "missing")
    groups = defaultdict(Counter)
    for row in rows:
        name = " / ".join({True: "yes", False: "no", None: "unknown"}[item] for item in key(row))
        groups[name][field(row, "outcome.direction") or "missing"] += 1
    return [f"| {label} | Dogs | " + " | ".join(levels) + " |",
            "|---|---:|---:|---:|---:|---:|---:|",
            *(f"| {name} | {sum(counts.values())} | " + " | ".join(str(counts[level]) for level in levels) + " |"
              for name, counts in sorted(groups.items()))]


if __name__ == "__main__":
    rows = [json.loads(line) for line in (ROOT / "cases.jsonl").read_text().splitlines()]
    with (ROOT / "sources.csv").open(newline="") as stream:
        sources = {r["source_id"]: r for r in csv.DictReader(stream)}
    print(render(rows, sources), end="")
