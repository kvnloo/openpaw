"""Build a standalone synthetic-only OpenPaw expert review page; no network/dependencies."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixtures" / "fictional-week.jsonl"
KIND = {
    "measurement": "Measurement", "observation": "Observation", "context": "Context",
    "trigger": "Trigger", "intervention": "Action", "expert_annotation": "Example question",
}
EPISODE_NAMES = {
    "ep-bike": "Bicycle encounter", "ep-dog-a": "First dog encounter",
    "ep-dog-b": "Second dog encounter",
}


def read_fixture():
    import json
    records = [json.loads(s) for s in FIXTURE.read_text(encoding="utf-8").splitlines() if s]
    ids = [e["event_id"] for e in records]
    if len(ids) != len(set(ids)) or len(records) != 45:
        raise ValueError("Expected 45 unique fictional events")
    if any(e.get("dog_id") != "fictional-dog-001" or
           e.get("provenance") != {"origin": "simulated", "source_id": "openpaw-fictional-week-v0"}
           for e in records):
        raise ValueError("Refusing to render unverified or real health records")
    if any(e["event_type"] not in KIND or e["timestamp"][-1] != "Z" for e in records):
        raise ValueError("Unsupported event or ambiguous timezone")
    return records


def human_label(event):
    payload = event["payload"]
    key = {"measurement": "metric", "observation": "behavior", "context": "label",
           "trigger": "category", "intervention": "action", "expert_annotation": "role"}[event["event_type"]]
    return str(payload.get(key, "Unknown")).replace("_", " ").title()


def event_card(e):
    p = e["payload"]
    name = escape(human_label(e))
    value = f'<b class="measure">{escape(str(p["value"]))} {escape(str(p.get("unit", "")))}</b>' if "value" in p else ""
    note = f'<p class="event-note">{escape(str(p["note"]))}</p>' if p.get("note") else ""
    timestamp = datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")).strftime("%H:%M")
    ident = escape(e["event_id"])
    kind = escape(e["event_type"])
    role = escape(str(p.get("role", "")))
    episode = f'<span class="episode-tag">{escape(EPISODE_NAMES.get(e.get("episode_id"), ""))}</span>' if e.get("episode_id") else ""
    return f'''<details class="event kind-{kind}" id="ev-{ident}" data-kind="{kind}" data-expert-role="{role}">
      <summary><time datetime="{escape(e['timestamp'])}">{timestamp}</time><span class="dot"></span>
        <span class="event-name"><b>{name}</b><span class="event-type">{escape(KIND[e['event_type']])}</span></span>
        {value}<span class="expand">+</span></summary>
      <div class="event-info">{note}<p class="meta">Source: <code>simulated · openpaw-fictional-week-v0</code></p>
        <p class="meta">Event: <code>{ident}</code>{episode}</p>
        <p class="meta">Recorded: <code>{escape(e['timestamp'])}</code></p></div>
    </details>'''


def episode_card(key, records):
    group = [e for e in records if e.get("episode_id") == key]
    trigger = next(e for e in group if e["event_type"] == "trigger")
    samples = [e for e in group if e["event_type"] == "measurement" and e["payload"].get("metric") == "heart_rate"]
    last = samples[-1]
    dt = datetime.fromisoformat(last["timestamp"].replace("Z", "+00:00")) - datetime.fromisoformat(trigger["timestamp"].replace("Z", "+00:00"))
    minutes = int(dt.total_seconds() // 60)
    el = escape
    return f'''<a class="episode-card" href="#ev-{el(trigger['event_id'])}">
      <span class="eyebrow">{el(trigger['timestamp'][:10])} · {el(trigger['timestamp'][11:16])} UTC</span>
      <strong>{el(EPISODE_NAMES[key])}</strong>
      <span class="episode-details">{len(group)} events · {len(samples)} HR samples</span>
      <span class="episode-details">Last HR sample: {el(str(last['payload']['value']))} beats/min, {minutes}m after trigger</span>
      <span class="unknown">Arousal state: not computed</span>
      <span class="open-detail">Trace source events ↗</span>
    </a>'''


CSS = r"""
:root{color-scheme:dark;--bg:#0a1115;--panel:#111c21;--panel2:#16252a;--line:#2b393d;--fg:#e6eee8;--muted:#9eb0a9;--accent:#b4e3a8;--warm:#facb83;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--fg);line-height:1.45}
button,select,textarea{font:inherit}a{color:inherit;text-decoration:none}button{cursor:pointer}
.shell{max-width:1380px;margin:auto;padding:0 32px 70px}.topnotice{background:#15231d;border-bottom:1px solid #37553d;color:#ccefc7;text-align:center;padding:9px 16px;font-size:12px;letter-spacing:.045em}
header.sitehead{display:flex;justify-content:space-between;align-items:center;padding:24px 0;border-bottom:1px solid var(--line);gap:24px}.brand{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700;letter-spacing:-.03em}.brandmark{display:grid;place-items:center;width:33px;height:33px;border-radius:11px;background:var(--accent);color:#1b3425;font-weight:900}
.nav{display:flex;gap:22px;color:var(--muted);font-size:13px}.nav a:hover,.nav a:focus-visible{color:var(--accent)}
.hero{padding:62px 0 42px;display:flex;align-items:end;justify-content:space-between;gap:34px}.kicker,.eyebrow{font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);font-weight:650}h1{font-size:clamp(32px,4vw,59px);letter-spacing:-.055em;font-weight:650;line-height:1.05;max-width:750px;margin:15px 0 19px}.hero p{max-width:650px;margin:0;color:var(--muted);font-size:15px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;min-width:295px}.stat{border-left:1px solid var(--line);padding-left:14px}.stat b{font-size:30px;line-height:1.1;font-weight:570;letter-spacing:-.05em;display:block}.stat span{color:var(--muted);font-size:12px}
.sectionhead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:15px 0 18px}h2{font-size:21px;font-weight:625;letter-spacing:-.028em;margin:0}.hint{font-size:12px;color:var(--muted)}
.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:9px}.daytile{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:15px;min-width:0;transition:border-color .12s}.daytile:hover,.daytile:focus-visible{border-color:var(--accent)}.daytile strong{display:block;font-size:22px;font-weight:620;letter-spacing:-.04em;margin:13px 0 6px}.daytile p{color:var(--muted);font-size:12px;line-height:1.7;margin:0}.daytile .date{color:#dbece3;font-size:13px;font-weight:600}.episode-count{display:inline-block;color:#f1daac;font-size:11px;margin-top:12px}
.workspace{display:grid;grid-template-columns:minmax(240px,330px) minmax(0,1fr);gap:32px;margin:50px 0}.side{display:flex;flex-direction:column;gap:26px}.sidebar-panel{border:1px solid var(--line);background:var(--panel);border-radius:14px;padding:22px}.sidebar-panel h2{font-size:18px}.side-note{font-size:12px;color:var(--muted);margin:7px 0 16px}.episode-card{display:flex;flex-direction:column;gap:6px;padding:15px 0;border-bottom:1px solid var(--line)}.episode-card:last-child{border:0;padding-bottom:0}.episode-card:first-of-type{padding-top:0}.episode-card strong{font-size:15px;letter-spacing:-.015em}.episode-card:hover strong{color:var(--accent)}.episode-details{font-size:12px;color:var(--muted)}.unknown{font-size:12px;color:#d9d4bb}.open-detail{font-size:12px;color:var(--accent);margin-top:2px}
.question{padding:12px 0;border-bottom:1px solid var(--line);font-size:13px}.question:last-child{border:0}.question b{font-size:11px;display:block;color:var(--accent);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px}.question p{margin:0;color:#c1cfc6}
.timeline-panel{min-width:0}.filters{display:flex;gap:5px;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.filters button{border:0;border-radius:7px;background:none;color:var(--muted);padding:7px 11px;font-size:12px}.filters button[aria-pressed=true]{background:var(--panel2);color:var(--accent);font-weight:700}
.daygroup{scroll-margin-top:22px;margin:0 0 28px}.daylabel{display:flex;align-items:center;gap:10px;padding:15px 0;border-bottom:1px solid var(--line)}.daylabel strong{font-size:16px}.daylabel span{font-size:12px;color:var(--muted)}.event{scroll-margin-top:18px;border-bottom:1px solid #223036}.event[hidden]{display:none}.event summary{display:flex;align-items:center;gap:13px;padding:15px 10px 15px 0;cursor:pointer;list-style:none;min-height:65px}.event summary::-webkit-details-marker{display:none}.event summary:hover{background:#122026}.event time{font-variant-numeric:tabular-nums;color:var(--muted);font-size:12px;min-width:42px}.dot{width:8px;height:8px;flex:none;border-radius:50%;background:#687b75}.kind-trigger .dot{background:#efb481}.kind-intervention .dot{background:#a3dcab}.kind-observation .dot{background:#dbd2a9}.kind-expert_annotation .dot{background:#a6bafa}.event-name{min-width:0;flex:1}.event-name b{display:block;text-transform:none;font-size:14px;font-weight:570}.event-type{font-size:11px;color:var(--muted)}.measure{font-size:13px;white-space:nowrap;font-weight:600}.expand{color:var(--muted);font-size:18px}.event[open] .expand{transform:rotate(45deg)}.event-info{padding:0 16px 18px 67px;color:var(--muted);font-size:12px}.event-info .event-note{color:#d7e1dc;font-size:13px;margin:0 0 12px}.event-info p{margin:6px 0}.meta code{font-size:11px;color:#bfd1c4;overflow-wrap:anywhere}.episode-tag{display:inline-block;margin-left:10px;color:#f6d3a0}
.empty-day{font-size:12px;color:var(--muted);padding:10px 0}.review-section{border:1px solid var(--line);background:var(--panel);border-radius:16px;padding:26px;margin-top:30px}.review-grid{display:grid;grid-template-columns:1fr 1.5fr;gap:30px}.review-intro p{color:var(--muted);font-size:13px;max-width:370px}.form-control{display:block;font-size:12px;color:var(--muted);margin:0 0 6px}.review-section select,.review-section textarea{display:block;width:100%;background:var(--bg);color:var(--fg);border:1px solid #425354;border-radius:8px;padding:10px}.review-section textarea{min-height:94px;resize:vertical}.review-section select{margin-bottom:13px}.actionrow{display:flex;align-items:center;gap:14px;margin-top:12px}.primary{background:var(--accent);color:#14221b;border:0;border-radius:8px;padding:10px 14px;font-weight:720;font-size:12px}.primary:hover,.primary:focus-visible{background:#e0f5d8}.button-quiet{border:1px solid var(--line);border-radius:8px;padding:10px 14px;background:var(--panel);color:var(--fg);font-size:12px}.form-status{font-size:12px;color:var(--muted)}footer{margin-top:45px;border-top:1px solid var(--line);padding:22px 0;color:var(--muted);font-size:12px}footer a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(max-width:970px){.hero{display:block}.stats{margin-top:25px;max-width:380px}.week{grid-template-columns:repeat(4,minmax(0,1fr))}.workspace{grid-template-columns:1fr}.side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.shell{padding:0 17px 40px}.topnotice{font-size:10px}.nav{gap:9px;font-size:12px}.hero{padding:36px 0}.week{grid-template-columns:repeat(2,minmax(0,1fr))}.side{display:flex}.sectionhead{align-items:flex-start;flex-direction:column}.filters{width:100%}.filters button{flex:1}.review-grid{grid-template-columns:1fr}.event summary{gap:8px}.event-info{padding-left:57px}.event-name b{font-size:13px}.measure{font-size:12px}.hero p{font-size:14px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.daytile{transition:none}}
"""
JS = r"""
const roleButtons = document.querySelectorAll('[data-view]');
const events = Array.from(document.querySelectorAll('.event'));
const visible = {
  all: () => true,
  vet: e => ['measurement','context','intervention'].includes(e.dataset.kind) || (e.dataset.kind === 'expert_annotation' && e.dataset.expertRole === 'veterinarian'),
  behavior: e => ['trigger','observation','context','intervention'].includes(e.dataset.kind) || (e.dataset.kind === 'expert_annotation' && e.dataset.expertRole === 'behavior_professional')
};
for (const btn of roleButtons) btn.addEventListener('click', () => {
  const v = btn.dataset.view;
  roleButtons.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  let count=0;
  events.forEach(e => { e.hidden = !visible[v](e); if (!e.hidden) count++; });
  document.querySelectorAll('.daygroup').forEach(day => {
    const noneVisible = !day.querySelector('.event:not([hidden])');
    day.querySelector('.empty-day').hidden = !noneVisible;
  });
  document.getElementById('visible-count').textContent = count + ' of ' + events.length + ' events shown';
});
document.querySelectorAll('.episode-card').forEach(link => link.addEventListener('click', event => {
  const evidence = document.getElementById(link.getAttribute('href').slice(1));
  if (!evidence) return;
  event.preventDefault();
  const all = document.querySelector('button[data-view="all"]');
  if (all.getAttribute('aria-pressed') !== 'true') all.click();
  evidence.open = true;
  history.replaceState(null, '', '#' + evidence.id);
  evidence.scrollIntoView({block: 'start'});
  evidence.querySelector('summary').focus({preventScroll: true});
}));
function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
document.getElementById('export-raw').addEventListener('click', () => {
  downloadText('openpaw-fictional-week.jsonl', document.getElementById('source-data').value, 'application/x-ndjson');
});
document.getElementById('export-note').addEventListener('click', () => {
  const note = document.getElementById('expert-note').value.trim();
  const status = document.getElementById('note-status');
  if (!note) { status.textContent='Enter a note before export.'; return; }
  const obj = {source:'openpaw-fictional-week-v0', review_type:'unverified_user_note', episode_id:document.getElementById('note-episode').value, text:note};
  downloadText('openpaw-local-review.json', JSON.stringify(obj,null,2)+'\n','application/json');
  status.textContent='Downloaded locally. Nothing uploaded.';
});
"""


def render(records, source):
    days = defaultdict(list)
    for e in records:
        days[e["timestamp"][:10]].append(e)
    week = []
    stream = []
    for day, events in days.items():
        first_hr = next((e for e in events if e["payload"].get("metric") == "heart_rate"), None)
        sleep = next((e for e in events if e["payload"].get("metric") == "sleep_minutes"), None)
        trigger_count = sum(e["event_type"] == "trigger" for e in events)
        weekday = datetime.fromisoformat(day).strftime("%a")
        ep_label = f'{trigger_count} reported trigger{"s" if trigger_count != 1 else ""}' if trigger_count else "No recorded triggers"
        week.append(f'''<a class="daytile" href="#day-{day}"><span class="date">{weekday} · {day[-2:]}</span>
            <strong>{len(events)} <span class="hint">events</span></strong>
            <p>Sleep estimate: {sleep['payload']['value'] if sleep else '—'} min</p>
            <p>First HR: {first_hr['payload']['value'] if first_hr else '—'} beats/min</p>
            <span class="episode-count">{escape(ep_label)}</span></a>''')
        stream.append(f'<section class="daygroup" id="day-{day}"><div class="daylabel"><strong>{weekday}, {escape(day)}</strong><span>· {len(events)} source events · UTC</span></div>')
        stream.extend(event_card(e) for e in events)
        stream.append(f'<p class="empty-day" hidden>No events shown in this review filter; {len(events)} source events remain available under All.</p>')
        stream.append('</section>')
    episode_html = "".join(episode_card(k, records) for k in EPISODE_NAMES)
    expert_rows = [e for e in records if e["event_type"] == "expert_annotation"]
    q_html = "".join(f'<div class="question"><b>{escape(human_label(e))} · fictional</b><p>{escape(e["payload"].get("note", ""))}</p></div>' for e in expert_rows)
    options = '<option value="week">Full week</option>' + "".join(f'<option value="{escape(k)}">{escape(n)}</option>' for k,n in EPISODE_NAMES.items())
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src data:; form-action 'none'; base-uri 'none'">
<meta name="description" content="OpenPaw synthetic week for veterinary and behavior expert discovery; no medical claims."><title>OpenPaw · Fictional Week</title><style>{CSS}</style></head>
<body><div class="topnotice">SYNTHETIC RECORDS ONLY · NO DIAGNOSIS · NO CLINICAL VALIDATION</div>
<div class="shell"><header class="sitehead"><div class="brand"><span class="brandmark">P</span> OpenPaw <span class="hint">/ Field notes</span></div><nav class="nav" aria-label="Page navigation"><a href="#week">Week</a><a href="#episodes">Episodes</a><a href="#review">Review</a></nav></header>
<section class="hero"><div><div class="kicker">Expert discovery · fictional dog 001 · Oct 5–11, 2026 (UTC)</div><h1>One week, in context.</h1><p>Follow observations from trigger to later samples. Every figure links back to a fictional source event. No arousal inference, veterinary conclusion, or recovery threshold is computed.</p></div>
<div class="stats"><div class="stat"><b>{len(records)}</b><span>Source events</span></div><div class="stat"><b>{len(EPISODE_NAMES)}</b><span>Trigger episodes</span></div><div class="stat"><b>{len(days)}</b><span>Calendar days</span></div></div></section>
<section id="week" aria-labelledby="week-title"><div class="sectionhead"><h2 id="week-title">Week at a glance</h2><span class="hint">First HR = first available sample, not necessarily resting · UTC</span></div><div class="week">{''.join(week)}</div></section>
<div class="workspace"><aside class="side"><section class="sidebar-panel" id="episodes"><h2>Episode paths</h2><p class="side-note">Elapsed time is not recovery time. Trace samples instead of interpreting a score.</p>{episode_html}</section>
<section class="sidebar-panel"><h2>Questions, not conclusions</h2><p class="side-note">Fictional examples—not actual expert feedback.</p>{q_html}</section></aside>
<main class="timeline-panel" id="timeline" aria-labelledby="timeline-title"><div class="sectionhead"><div><h2 id="timeline-title">Event stream</h2><span id="visible-count" class="hint">{len(records)} of {len(records)} events shown</span></div><div class="filters" role="group" aria-label="Filter events by review role"><button type="button" data-view="all" aria-pressed="true">All</button><button type="button" data-view="vet" aria-pressed="false">Veterinary</button><button type="button" data-view="behavior" aria-pressed="false">Behavior</button></div></div>
{''.join(stream)}</main></div>
<section class="review-section" id="review"><div class="review-grid"><div class="review-intro"><div class="kicker">Local review worksheet</div><h2>What would this change?</h2><p>Describe a question or follow-up—not a diagnosis. This page does not save automatically or send data anywhere. A note is exported only when you click Download.</p><button id="export-raw" type="button" class="button-quiet">Download original JSONL ↗</button></div><div><label class="form-control" for="note-episode">Context</label><select id="note-episode">{options}</select>
<label class="form-control" for="expert-note">Expert question / observation</label><textarea id="expert-note" placeholder="What evidence would you need to change a decision?"></textarea><div class="actionrow"><button id="export-note" type="button" class="primary">Download note locally</button><span class="form-status" id="note-status" aria-live="polite"></span></div></div></div></section>
<footer>OpenPaw pretotype · fictional, inspectable evidence, not a medical device. <a href="https://github.com/kvnloo/openpaw" rel="noreferrer">Protocol &amp; source ↗</a></footer></div>
<textarea id="source-data" hidden readonly>{escape(source,quote=False)}</textarea><script>{JS}</script></body></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "demo" / "timeline.html")
    args = parser.parse_args()
    records = read_fixture()
    source = FIXTURE.read_text(encoding="utf-8")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render(records, source), encoding="utf-8")
    print(f"Wrote {args.output} ({len(records)} fictional events; no network dependencies)")


if __name__ == "__main__":
    main()
