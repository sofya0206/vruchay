#!/usr/bin/env python3
"""Render copy-run/copy.json into a dark-mode copy deck.

Stdlib only. The writing happens upstream; this only lays it out in the
shape of the real asset, plus the ladder, the alternates and the gate.
"""

import argparse
import datetime as _dt
import html
import json
import pathlib
import sys
import webbrowser

RUN_DIR = pathlib.Path("./copy-run")

FORMAT_LABEL = {
    "fb_ad": "Long-form Facebook ad",
    "email": "Email",
    "landing_page": "Landing page",
}

ENEMY_LABEL = {
    "approach": "A different approach",
    "belief": "A competing belief",
    "competitor": "A competitor",
}


def esc(value):
    return html.escape(str(value if value is not None else ""))


def para_block(items):
    """Render a list of paragraphs (or a single string) as <p> tags."""
    if isinstance(items, str):
        items = [items]
    return "".join(f"<p>{esc(p)}</p>" for p in (items or []))


# --------------------------------------------------------------------------
# asset mocks
# --------------------------------------------------------------------------

def render_fb_ad(c, brand):
    body = para_block(c.get("body"))
    return f"""
    <div class="mock mock-fb">
      <div class="fb-head">
        <div class="fb-avatar">{esc(brand[:1].upper())}</div>
        <div>
          <div class="fb-brand">{esc(brand)}</div>
          <div class="fb-meta">Sponsored · <span class="globe">&#127760;</span></div>
        </div>
      </div>
      <div class="fb-hook">{esc(c.get('hook'))}</div>
      <div class="fb-body">{body}</div>
      <div class="fb-card">
        <div class="fb-img">creative</div>
        <div class="fb-card-txt">
          <div class="fb-card-head">{esc(c.get('link_headline'))}</div>
          <div class="fb-card-desc">{esc(c.get('link_description'))}</div>
        </div>
        <div class="fb-btn">{esc(c.get('cta'))}</div>
      </div>
    </div>"""


def render_email(c, brand):
    body = para_block(c.get("body"))
    ps = c.get("ps")
    ps_html = f'<p class="ps">P.S. {esc(ps)}</p>' if ps else ""
    return f"""
    <div class="mock mock-email">
      <div class="inbox">
        <div class="inbox-row">
          <div class="inbox-from">{esc(brand)}</div>
          <div class="inbox-subject">{esc(c.get('subject'))}
            <span class="inbox-preview">&mdash; {esc(c.get('preview'))}</span>
          </div>
        </div>
      </div>
      <div class="email-body">
        {body}
        <div class="email-cta">{esc(c.get('cta'))}</div>
        {ps_html}
      </div>
    </div>"""


def render_landing_page(c, brand):
    sections = "".join(
        f'<div class="lp-section"><h3>{esc(s.get("h2"))}</h3>{para_block(s.get("body"))}</div>'
        for s in c.get("sections", [])
    )
    proof = "".join(f'<div class="proof">{esc(p)}</div>' for p in c.get("proof", []))
    proof_html = f'<div class="lp-proof">{proof}</div>' if proof else ""
    return f"""
    <div class="mock mock-lp">
      <div class="lp-nav">{esc(brand)}</div>
      <div class="lp-hero">
        <h2>{esc(c.get('headline'))}</h2>
        <p class="lp-sub">{esc(c.get('subhead'))}</p>
        <div class="lp-btn">{esc(c.get('cta'))}</div>
      </div>
      {proof_html}
      {sections}
    </div>"""


RENDERERS = {
    "fb_ad": render_fb_ad,
    "email": render_email,
    "landing_page": render_landing_page,
}


# --------------------------------------------------------------------------
# supporting panels
# --------------------------------------------------------------------------

def render_ladders(ladders):
    if not ladders:
        return ""
    blocks = []
    for lad in ladders:
        rungs = lad.get("rungs", [])
        if not rungs:
            continue
        last = len(rungs) - 1
        steps = "".join(
            '<div class="rung{cls}"><span class="rung-dot"></span>{txt}</div>'.format(
                cls=" rung-final" if i == last else "",
                txt=esc(r),
            )
            for i, r in enumerate(rungs)
        )
        blocks.append(
            f'<div class="ladder"><div class="ladder-id">{esc(lad.get("line_id"))}</div>'
            f'<div class="ladder-head"><span>abstract</span><span>concrete</span></div>'
            f'{steps}</div>'
        )
    if not blocks:
        return ""
    return (
        '<section><h2>The ladder</h2>'
        '<p class="lede">Every line starts abstract. This is the climb down to something you can see.</p>'
        f'<div class="ladders">{"".join(blocks)}</div></section>'
    )


def render_alternates(alternates):
    if not alternates:
        return ""
    blocks = []
    for alt in alternates:
        opts = alt.get("options", [])
        if not opts:
            continue
        items = "".join(
            '<li class="{cls}">{txt}{tag}</li>'.format(
                cls="shipped" if i == 0 else "",
                txt=esc(o),
                tag='<span class="tag">shipped</span>' if i == 0 else "",
            )
            for i, o in enumerate(opts)
        )
        blocks.append(
            f'<div class="alt"><div class="alt-id">{esc(alt.get("line_id"))}</div><ul>{items}</ul></div>'
        )
    if not blocks:
        return ""
    return (
        '<section><h2>Alternates</h2>'
        '<p class="lede">You get better feedback on three versions than on one. Swap any of these in.</p>'
        f'<div class="alts">{"".join(blocks)}</div></section>'
    )


def _mark(ok):
    return ('<span class="yes">yes</span>' if ok else '<span class="no">no</span>')


def render_gate(gate):
    if not gate:
        return ""
    rows = []
    for g in gate:
        score = g.get("score", 0)
        cls = "s3" if score >= 3 else ("s2" if score == 2 else "s1")
        signed = g.get("signed_by")
        signed_html = (
            f'<div class="signed"><span class="signed-label">competitor test</span>{esc(signed)}</div>'
            if signed else ""
        )
        note = g.get("note")
        note_html = f'<div class="gate-note">{esc(note)}</div>' if note else ""
        rows.append(f"""
        <div class="gate-row {cls}">
          <div class="gate-line">
            <div class="gate-id">{esc(g.get('line_id'))}</div>
            <div class="gate-txt">{esc(g.get('line'))}</div>
            {signed_html}
            {note_html}
          </div>
          <div class="gate-scores">
            <div class="chk"><span>see it</span>{_mark(g.get('visualize'))}</div>
            <div class="chk"><span>prove it</span>{_mark(g.get('falsifiable'))}</div>
            <div class="chk"><span>only us</span>{_mark(g.get('only_us'))}</div>
            <div class="score">{esc(score)}<span>/3</span></div>
          </div>
        </div>""")
    return (
        '<section><h2>The gate</h2>'
        '<p class="lede">Harry Dry\'s three rules. Three nos and it\'s rubbish. '
        'Three yeses and you\'re onto something.</p>'
        f'<div class="gate">{"".join(rows)}</div></section>'
    )


def render_facts(facts):
    if not facts:
        return ""
    rows = "".join(
        f'<div class="fact"><div class="fact-src {esc(f.get("source"))}">{esc(f.get("source"))}</div>'
        f'<div class="fact-txt">{esc(f.get("fact"))}</div>'
        f'<div class="fact-used">{esc(f.get("used_in") or "")}</div></div>'
        for f in facts
    )
    return (
        '<section><h2>The facts underneath</h2>'
        '<p class="lede">Every specific in the copy traces back to one of these. '
        'No fact, no line.</p>'
        f'<div class="facts">{rows}</div></section>'
    )


def render_cut(cut):
    if not cut:
        return ""
    items = "".join(f"<li>{esc(c)}</li>" for c in cut)
    return f'<section><h2>Cut</h2><ul class="cut">{items}</ul></section>'


def render_caveats(caveats):
    if not caveats:
        return ""
    items = "".join(f"<li>{esc(c)}</li>" for c in caveats)
    return f'<section class="caveats"><h2>Read this before you spend money</h2><ul>{items}</ul></section>'


# --------------------------------------------------------------------------

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0b0d;color:#e8e9ed;font:15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;
 padding:56px 24px 96px}
.wrap{max-width:1080px;margin:0 auto}
header{border-bottom:1px solid #1e2128;padding-bottom:28px;margin-bottom:44px}
.eyebrow{color:#6f7580;font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:12px}
h1{font-size:30px;font-weight:650;letter-spacing:-.02em}
.sub{color:#8b919c;margin-top:8px;font-size:14px}
h2{font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#7d838e;margin-bottom:10px;font-weight:600}
section{margin-bottom:48px}
.lede{color:#8b919c;font-size:13.5px;margin-bottom:20px;max-width:62ch}
.poles{display:grid;grid-template-columns:1fr auto 1fr;gap:18px;align-items:center;
 background:#101217;border:1px solid #1e2128;border-radius:12px;padding:22px}
.pole-label{color:#6f7580;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:7px}
.wire{color:#3a4048;font-size:20px}
.enemy{margin-top:16px;background:#101217;border:1px solid #1e2128;border-left:3px solid #d9534f;
 border-radius:0 12px 12px 0;padding:16px 20px}
.enemy-type{color:#d9534f;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}
/* asset mocks */
.mock{background:#101217;border:1px solid #1e2128;border-radius:14px;overflow:hidden;max-width:600px}
.mock-fb .fb-head{display:flex;gap:11px;align-items:center;padding:15px 16px 11px}
.fb-avatar{width:40px;height:40px;border-radius:50%;background:#2b303a;display:flex;align-items:center;
 justify-content:center;font-weight:650;color:#c7ccd4}
.fb-brand{font-weight:620;font-size:14px}
.fb-meta{color:#7d838e;font-size:12px}
.fb-hook{padding:2px 16px 10px;font-size:15px;white-space:pre-wrap;font-weight:520}
.fb-body{padding:0 16px 15px;color:#c2c7d0;font-size:14.5px}
.fb-body p{margin-bottom:13px}
.fb-card{border-top:1px solid #1e2128;background:#15181e;position:relative}
.fb-img{height:150px;background:repeating-linear-gradient(45deg,#191d24,#191d24 11px,#1d222a 11px,#1d222a 22px);
 display:flex;align-items:center;justify-content:center;color:#4a515c;font-size:11px;letter-spacing:.16em;
 text-transform:uppercase}
.fb-card-txt{padding:12px 16px}
.fb-card-head{font-weight:640;font-size:14.5px}
.fb-card-desc{color:#7d838e;font-size:12.5px;margin-top:3px}
.fb-btn{position:absolute;right:14px;bottom:14px;background:#2b303a;color:#e8e9ed;padding:8px 15px;
 border-radius:7px;font-size:13px;font-weight:600}
.mock-email .inbox{border-bottom:1px solid #1e2128;padding:14px 18px;background:#15181e}
.inbox-from{font-weight:640;font-size:13px;margin-bottom:3px}
.inbox-subject{font-size:14px;font-weight:560}
.inbox-preview{color:#7d838e;font-weight:400}
.email-body{padding:22px 20px}
.email-body p{margin-bottom:14px;color:#c2c7d0}
.email-cta{display:inline-block;background:#e8e9ed;color:#0a0b0d;padding:11px 22px;border-radius:7px;
 font-weight:640;font-size:14px;margin:6px 0 16px}
.ps{color:#8b919c;font-size:13.5px;font-style:italic}
.mock-lp{max-width:760px}
.lp-nav{padding:14px 24px;border-bottom:1px solid #1e2128;font-weight:640;font-size:13.5px;background:#15181e}
.lp-hero{padding:44px 30px 38px;text-align:center}
.lp-hero h2{font-size:30px;line-height:1.2;letter-spacing:-.02em;color:#f2f3f6;text-transform:none;
 margin-bottom:12px;font-weight:660}
.lp-sub{color:#a8aeb8;font-size:16px;max-width:46ch;margin:0 auto 22px}
.lp-btn{display:inline-block;background:#e8e9ed;color:#0a0b0d;padding:12px 28px;border-radius:8px;font-weight:650}
.lp-proof{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;padding:0 24px 30px}
.proof{background:#191d24;border:1px solid #232830;border-radius:20px;padding:7px 15px;font-size:12.5px;color:#a8aeb8}
.lp-section{padding:24px 30px;border-top:1px solid #1a1d23}
.lp-section h3{font-size:18px;margin-bottom:9px;font-weight:640}
.lp-section p{color:#a8aeb8;margin-bottom:11px}
/* ladder */
.ladders,.alts{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(310px,1fr))}
.ladder,.alt{background:#101217;border:1px solid #1e2128;border-radius:12px;padding:18px}
.ladder-id,.alt-id{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;color:#6f7580;margin-bottom:12px}
.ladder-head{display:flex;justify-content:space-between;font-size:10px;letter-spacing:.13em;
 text-transform:uppercase;color:#4a515c;margin-bottom:10px}
.rung{position:relative;padding:6px 0 6px 20px;color:#8b919c;font-size:13.5px}
.rung-dot{position:absolute;left:3px;top:13px;width:6px;height:6px;border-radius:50%;background:#2f353e}
.rung-final{color:#f2f3f6;font-weight:620;font-size:15px}
.rung-final .rung-dot{background:#5b9f6e;box-shadow:0 0 0 3px rgba(91,159,110,.16)}
.alt ul{list-style:none}
.alt li{padding:9px 0;border-bottom:1px solid #191d23;color:#a8aeb8;font-size:13.5px}
.alt li:last-child{border-bottom:none}
.alt li.shipped{color:#f2f3f6;font-weight:600}
.tag{background:#1c2b21;color:#5b9f6e;font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;
 padding:2px 7px;border-radius:4px;margin-left:9px;vertical-align:middle}
/* gate */
.gate-row{display:flex;gap:22px;justify-content:space-between;align-items:flex-start;background:#101217;
 border:1px solid #1e2128;border-left:3px solid #2f353e;border-radius:0 12px 12px 0;padding:16px 20px;margin-bottom:11px}
.gate-row.s3{border-left-color:#5b9f6e}
.gate-row.s2{border-left-color:#c8963e}
.gate-row.s1{border-left-color:#d9534f}
.gate-id{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:10.5px;color:#6f7580;margin-bottom:5px}
.gate-txt{font-size:15px;font-weight:560;color:#f2f3f6}
.signed{margin-top:9px;font-size:12.5px;color:#8b919c;font-style:italic}
.signed-label{display:block;font-style:normal;font-size:9.5px;letter-spacing:.13em;
 text-transform:uppercase;color:#5a616b;margin-bottom:2px}
.gate-note{margin-top:7px;font-size:12.5px;color:#7d838e}
.gate-scores{display:flex;gap:14px;align-items:center;flex-shrink:0}
.chk{text-align:center;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#5a616b}
.chk span{display:block;margin-bottom:5px}
.yes{color:#5b9f6e;font-weight:700}
.no{color:#d9534f;font-weight:700}
.score{font-size:21px;font-weight:680;color:#e8e9ed;margin-left:6px}
.score span{font-size:11px;color:#5a616b;font-weight:500}
/* facts */
.facts{display:grid;gap:8px}
.fact{display:grid;grid-template-columns:78px 1fr 130px;gap:14px;align-items:center;background:#101217;
 border:1px solid #1e2128;border-radius:9px;padding:12px 16px;font-size:13.5px}
.fact-src{font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;text-align:center;padding:3px 0;
 border-radius:4px;background:#1c222b;color:#8b919c}
.fact-src.review{background:#16261c;color:#5b9f6e}
.fact-src.founder{background:#1e2233;color:#7d8ccc}
.fact-txt{color:#c2c7d0}
.fact-used{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:10.5px;color:#5a616b;text-align:right}
.cut{list-style:none;color:#7d838e;font-size:13.5px}
.cut li{padding:8px 0 8px 18px;border-bottom:1px solid #16191f;position:relative;text-decoration:line-through;
 text-decoration-color:#3a4048}
.cut li:before{content:'\\00d7';position:absolute;left:0;color:#d9534f;text-decoration:none}
.caveats{background:#101217;border:1px solid #1e2128;border-radius:12px;padding:22px 26px}
.caveats ul{list-style:none;color:#8b919c;font-size:13.5px}
.caveats li{padding:5px 0 5px 16px;position:relative}
.caveats li:before{content:'\\2014';position:absolute;left:0;color:#4a515c}
footer{border-top:1px solid #1e2128;padding-top:22px;color:#5a616b;font-size:12px;text-align:center}
footer a{color:#7d838e}
@media(max-width:720px){.poles{grid-template-columns:1fr}.wire{display:none}
 .gate-row{flex-direction:column}.fact{grid-template-columns:1fr}.fact-used{text-align:left}}
"""


def build(d):
    fmt = d.get("format", "fb_ad")
    brand = d.get("brand", "Brand")
    copy_block = (d.get("copy") or {}).get(fmt) or {}
    mock = RENDERERS.get(fmt, render_fb_ad)(copy_block, brand)
    enemy = d.get("enemy") or {}

    enemy_html = ""
    if enemy.get("statement"):
        enemy_html = (
            f'<div class="enemy"><div class="enemy-type">'
            f'{esc(ENEMY_LABEL.get(enemy.get("type"), "The enemy"))}</div>'
            f'{esc(enemy["statement"])}</div>'
        )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(brand)} — copy deck</title><style>{CSS}</style></head><body><div class="wrap">
<header>
  <div class="eyebrow">Conversion Copywriter · {esc(FORMAT_LABEL.get(fmt, fmt))}</div>
  <h1>{esc(brand)}</h1>
  <div class="sub">Written {esc(d.get('generated_on', ''))}</div>
</header>

<section>
  <h2>The race</h2>
  <p class="lede">You can't start in the middle. Two telephone poles &mdash; the copy is the wire.</p>
  <div class="poles">
    <div><div class="pole-label">Point A &mdash; where they are</div>{esc(d.get('point_a'))}</div>
    <div class="wire">&rarr;</div>
    <div><div class="pole-label">Point B &mdash; where they land</div>{esc(d.get('point_b'))}</div>
  </div>
  {enemy_html}
</section>

<section>
  <h2>The copy</h2>
  <p class="lede">Laid out the way the reader will actually see it &mdash; not as a document.</p>
  {mock}
</section>

{render_gate(d.get('gate'))}
{render_ladders(d.get('ladders'))}
{render_alternates(d.get('alternates'))}
{render_facts(d.get('facts'))}
{render_cut(d.get('cut'))}
{render_caveats(d.get('caveats'))}

<footer>
  Method: Harry Dry's three rules &mdash;
  <a href="https://marketingexamples.com">marketingexamples.com</a>
</footer>
</div></body></html>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=str(RUN_DIR / "copy.json"))
    ap.add_argument("--output", default=str(RUN_DIR / "copy-deck.html"))
    ap.add_argument("--no-open", action="store_true")
    a = ap.parse_args()

    src = pathlib.Path(a.input)
    if not src.exists():
        sys.exit(f"No copy.json at {src} — write it before rendering.")

    try:
        data = json.loads(src.read_text())
    except json.JSONDecodeError as e:
        sys.exit(f"copy.json is not valid JSON: {e}")

    data.setdefault("generated_on", _dt.date.today().isoformat())

    out = pathlib.Path(a.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(data))
    print(f"Wrote {out}")

    if not a.no_open:
        webbrowser.open(out.resolve().as_uri())


if __name__ == "__main__":
    main()
