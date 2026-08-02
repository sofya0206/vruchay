# Conversion Copywriter

A Claude Code skill that **writes** conversion copy — long-form Facebook ads, emails, and landing pages.

It's a copywriter, not a copy editor. You give it context, it writes the copy.

## The method is Harry Dry's

This skill is built on the framework [Harry Dry](https://marketingexamples.com) laid out in his interview with David Perel on *How I Write*. The three rules, the abstract→concrete ladder, "don't talk, only point," the A→B framing, and the fact-first principle are all his. What's built here is the machine that runs them.

Go read [marketingexamples.com](https://marketingexamples.com). It's the best free copywriting resource on the internet.

## Why most AI copy is bad

Harry splits copywriting into three pieces, in order:

1. Who am I talking to?
2. Do I have something to say?
3. Say it well.

Every AI copy tool sprints straight to piece three. That's why the output is fluent and empty — it says nothing beautifully.

**This one won't write until it has facts.** That's the whole design.

## The three rules

Every load-bearing line has to clear all three before it ships:

| Rule | The test |
|---|---|
| **Can I visualize it?** | Close your eyes. *Charging pitbull* sticks. *Better way* evaporates. |
| **Can I falsify it?** | "He's funny" is talk. "He reads on the tube" is a fact. Don't talk — point. |
| **Can nobody else say this?** | Put a competitor's name on the line. If it still reads true, the line is dead. |

Three nos and you've written rubbish. Three yeses and you're onto something.

The line that passes all three: *"New Balance. Worn by supermodels in London and dads in Ohio."*

## What it does

1. **Intake** — format, what it is, where the reader's head is now (Point A), where you need them to land (Point B), the offer, and reviews.
2. **Harvests facts** — reviews first, because customers speak concretely and websites don't. A brand's own site is the most adjective-dense asset it owns; the skill mines it for hard specifics only and never borrows its phrasing.
3. **Interrogates the abstractions** — runs the zoom-in test on anything vague. *regain fitness → off the couch → run 5K → Couch to 5K.* Asks you three or four pointed questions, only where the copy would be weak without them.
4. **Finds the conflict** — copy is arguing, and an argument needs an opponent. A different approach, a competing belief, or a competitor.
5. **Writes hot and ugly** — 4–6 versions of every load-bearing line, bad ones included on purpose, because the dirty water has to run out of the tap first.
6. **Gates every line** on the three rules. Below a 2 goes back for a rewrite.
7. **Renders a copy deck** — the copy laid out in the shape of the real asset, plus the ladder, the alternates, the facts, and the scored gate.

## Install

Drop the folder into `~/.claude/skills/conversion-copywriter/`, then in Claude Code:

```
write conversion copy
```

Or: "write my landing page", "write a long-form Facebook ad", "write this email".

## Requirements

None. No API keys, no connectors. The renderer is Python 3 standard library only.

## Output

Everything lands in `./copy-run/`:

- `brief.json` — the intake
- `copy.json` — the copy, the facts, the ladders, the gate scores
- `copy-deck.html` — the deck

See `sample-run/` for a full worked example (a long-form Facebook ad for a fictional greens brand).

## The one rule that matters

**It never invents a specific.** Made-up numbers, studies, or reviews are the single unrecoverable failure for a tool like this — a fabricated fact is falsifiable, and it's false. If the fact isn't there, it writes around it or asks you for it.

Every claim it writes traces to a fact you provided or a review you supplied. Check them before you spend money behind them. This writes the copy; it doesn't verify your claims or clear them for compliance.

---

Built by [Mike Futia](https://x.com/mikefutia) · [SCALE AI](https://skool.com/scale-ai/about)

Method credit: [Harry Dry, Marketing Examples](https://marketingexamples.com)
