"""Extract only selected dog-level fields; never copy free-text workbook columns."""
import csv
import hashlib
import json
import sys
from pathlib import Path

import xlrd

HERE = Path(__file__).resolve().parent
SHA256 = "a6a71699b0ca2fdd280dbd45ba5b2e59c13c93c840b10871b5bf28348ce766b7"


def band(value, cuts, labels):
    if not isinstance(value, (int, float)) or value < 0:
        return None
    return next((label for cut, label in zip(cuts, labels) if value < cut), labels[-1])


def dog(source, key, location, breed, age, sex, neutered, kg=None):
    return dict(
        case_id=f"{source}-{key}", source_id=source, source_location=location,
        signalment=dict(breed_group=breed, age_band=band(age, (1, 2, 7),
            ("under_1y", "1_to_under_2y", "2_to_under_7y", "7y_and_over")),
            sex=sex, neutered=neutered, weight_band=band(kg, (10, 25, 40),
            ("under_10kg", "10_to_under_25kg", "25_to_under_40kg", "40kg_and_over"))),
        presenting_problems=None, triggers=None, context=None, threshold=None,
        precursor_signals=None, recovery_time=None, frequency_baseline=None,
        medical=dict(findings=None, contributor_status=None, owner_health_problem=None),
        interventions=dict(management=None, behavior_modification=None,
            medication_classes=None, prescription_reported=None, owner_education=None),
        follow_up_months=None, outcome=None, adverse_events=None,
    )


def binary(value):
    return {0: False, 1: True, "0": False, "1": True, "": None}[value]


def survey(workbook):
    if hashlib.sha256(workbook.read_bytes()).hexdigest() != SHA256:
        raise ValueError("Expected version 1 of the cited Figshare workbook")
    sheet = xlrd.open_workbook(workbook).sheet_by_name("Data")
    headers = sheet.row_values(1)
    for i in range(2, sheet.nrows):
        d = dict(zip(headers, sheet.row_values(i)))
        if d["WelfareImpaired_binary"] != 1:
            continue
        row = dog("riemer2019", f"r{i+1}", f"Figshare v1, Data!A{i+1}:BT{i+1}",
                  d["Breed_Group_min10"] or None, d["Age (years)"], d["Sex"],
                  binary(d["Neutered"]))
        row.update(presenting_problems=["owner-reported firework fear"],
                   triggers=["fireworks"], recovery_time=d["Recovery_time"] or None)
        row["medical"]["owner_health_problem"] = binary(d["Health_problems"])
        management = [
            label for name, label in [
                ("HidingPlace", "hiding place"), ("WindowsClosed", "closing curtains or shutters"),
                ("Music", "sound masking"), ("Thundershirt", "pressure wrap"),
                ("Chews", "offered chews"), ("Play", "offered play"), ("Food", "offered food"),
                ("Neutraceuticals", "nutraceutical"), ("Pheromones", "pheromone product"),
                ("Plant_products", "plant product"), ("Homeopathy", "homeopathic product"),
                ("Bach_Flowers", "flower essence product"), ("Oils", "essential oil"),
            ] if binary(d[name])
        ]
        training = binary(d["TrainingTried"])
        changes = ["noise-fear training (type unspecified for this item)"] if training else (
            [] if training is False else None)
        row["interventions"].update(management=management,
            behavior_modification=changes, prescription_reported=binary(d["Drugs"]))
        progression = d["Development_Fear"]
        if progression in range(1, 6):
            row["outcome"] = dict(measure="retrospective owner-rated firework fear progression",
                result=int(progression), direction=("improved" if progression < 3 else
                "worsened" if progression > 3 else "unchanged"))
        yield row


def clinical():
    data = [
        ("A", "retriever", 14, "male", False, 14, None, "Restlessness, jumping and following owners subsided."),
        ("B", "retriever", 14, "male", False, 3, None, "Repetitive play and barking at owners stopped; more resting at home."),
        ("C", "herding", 7, "female", False, 14, None, "Following subsided; occasional nudging persisted."),
        ("D", "herding", 64, "male", True, 24, None, "No further snaps or bites during the program."),
        ("E", "spitz", 10, "male", False, 27, ["freezing"], "Less inhibition at home; could rest near the previously avoided family member."),
    ]
    for key, breed, age, sex, neutered, months, precursors, result in data:
        row = dog("monteny2020", key, f"Tables 1–2, dog {key}; §§3.1–3.3",
                  breed, age / 12, sex, neutered)
        row.update(presenting_problems=["impaired social functioning around owners"] +
                   (["snapping and biting"] if key == "D" else []),
                   triggers=["everyday actions by household members"], context="household interactions",
                   precursor_signals=precursors, follow_up_months=months,
                   outcome=dict(measure="qualitative final-session account", result=result, direction="improved"))
        row["medical"].update(contributor_status="none_reported", findings=[])
        row["interventions"].update(management=["household interaction and routine changes"],
            behavior_modification=["predictability exercises", "safety cue conditioning", "graded desensitization"],
            medication_classes=[], owner_education=["body language coaching"])
        yield row
    row = dog("aggression2026", "1", "§2, Case Presentation and Follow-Up and Outcome",
              "herding", .75, "female", True, 15)
    row.update(presenting_problems=["escalating aggression and biting toward familiar and unfamiliar people"],
               triggers=["close handling around the head", "food", "visitors"],
               context="household interactions and walks", follow_up_months=12,
               outcome=dict(measure="annual clinical follow-up narrative",
                            result="Sustained improvement; no aggressive incidents reported at annual review.",
                            direction="improved"),
               adverse_events=[])
    row["medical"].update(findings=["GI"], contributor_status="suspected")
    row["interventions"].update(management=["environmental and safety management"],
        behavior_modification=["reward-based alternatives", "relaxation training", "cooperative care"],
        medication_classes=["SSRI", "gabapentinoid"], prescription_reported=True,
        owner_education=["safety and behavior guidance"])
    yield row


def cohort(path):
    if hashlib.sha256(path.read_bytes()).hexdigest() != "7b408b49db6262e13e224aec99170fd959a88d78f8a57b5a00773a920b6e93ab":
        raise ValueError("Expected the cited PLOS S4 CSV")
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.reader(stream)
        headers = next(reader)
        score_cols = [i for i, h in enumerate(headers) if h.startswith("In response to sudden or loud noises")]
        rx_cols = [i for i, h in enumerate(headers) if h.startswith("Is your dog taking any prescribed anti-anxiety")]
        assert len(score_cols) == len(rx_cols) == 4
        waves = ("10 days after adoption", "30 days after adoption",
                 "3 months after adoption", "6 months after adoption")
        records = {}
        for row_number, raw in enumerate(reader, 2):
            if raw[1] not in waves:
                continue
            wave = waves.index(raw[1])
            key = (raw[0], wave)  # Used only for the join; never exported.
            assert key not in records
            value = raw[score_cols[wave]]
            score = int(value[0]) if value else None
            rx = {"Yes": True, "No": False, "": None}[raw[rx_cols[wave]]]
            records[key] = (row_number, score, rx)
    for (key, wave), (first, baseline, rx) in records.items():
        if wave != 0 or baseline in (0, None):
            continue
        last, endpoint, _ = records.get((key, 3), (None, None, None))
        loc = f"PLOS S4 CSV record {first} (first wave)"
        if last is not None:
            loc += f"; record {last} (six months)"
        row = dog("bohland2023", f"r{first}", loc, None, None, None, True)
        row.update(presenting_problems=["owner-reported response to sudden or loud noises"],
                   triggers=["sudden or loud noise"], context="after shelter adoption")
        row["interventions"]["prescription_reported"] = rx
        if endpoint is not None:
            row.update(follow_up_months=173 / 30.4375, outcome=dict(
                measure="C-BARQ loud-noise item: six-month minus first-wave score",
                result=endpoint - baseline, direction=("improved" if endpoint < baseline else
                    "worsened" if endpoint > baseline else "unchanged")))
        yield row


if __name__ == "__main__":
    rows = [*survey(Path(sys.argv[1])), *clinical(), *cohort(Path(sys.argv[2]))]
    if len(rows) != 722:
        raise ValueError(f"Expected 639 survey, six clinical, and 77 cohort dogs; got {len(rows)}")
    (HERE / "cases.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
    print(f"Wrote {len(rows)} dog records")
