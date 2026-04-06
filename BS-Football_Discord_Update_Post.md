# 🏈 BS Football — Massive Update (April 3, 2026)

Hey everyone, huge batch of changes went live today. This is a big one — breakdown below.

---

## ⚡ NEW: God Mode

Full commissioner control over your league. Toggle it on in Settings.

- **Player Editor** — Click any player → "Edit Player" to change name, position, age, OVR, potential, individual ratings, salary, contract length, or move them to a different team
- **Create Player** — Build a custom player from scratch on the Roster page. Set their position, age, OVR, everything
- **Force Trade** — New yellow button on the trade builder that bypasses AI evaluation, salary cap, and trade deadline restrictions. Get any deal done, no questions asked
- ⚠️ God Mode leagues are permanently flagged — you'll always know which saves used it

---

## 🔄 Offseason Reorder

**Re-signing → Free Agency → Draft**

The offseason now follows the real NFL order. Address roster needs in free agency *before* deciding what to draft. All buttons and navigation updated to reflect the new flow.

---

## 🤝 Trade AI Overhaul

The trade system got a complete rework:

- **Draft pick values rebuilt from scratch** — Pick #1 is now worth 3,000 pts, #10 is 2,248, #32 is 1,119. No more trading pick #30 straight up for pick #2
- **Player values rescaled** — A 90 OVR franchise QB is worth more than the #1 overall pick
- **AI acceptance tightened** — Threshold moved from 90% to 95%. Harder to fleece the CPU
- **Mock draft fix** — Trading your 1st round pick during re-signing now actually transfers it

---

## 🏆 MVP & Award Rebalance

- QBs now win MVP **~70-80% of the time**, matching real NFL patterns
- Team wins are a major factor — you basically can't win MVP on a losing team anymore
- **DPOY formula overhauled:** Sacks and INTs matter more, raw tackle numbers matter less. Pass deflections, TFLs, and forced fumbles now factor in

---

## 🎮 Live Game Simulation Fixes

A ton of under-the-hood sim fixes:

- **OL ratings now actually matter** for sack rate (was using WR1's blocking rating as a proxy... yeah)
- Completion % properly scales with QB throwing + receiver catching − CB coverage
- Pass yards per completion are realistic — no more completed passes *losing* yardage
- INT rate scales with QB vs CB matchup (was a flat 2.5% for everyone)
- Fumble rate is skill-based via carrying rating (was a flat 3%)
- **Red zone logic added:** 45% rush TD / 55% pass TD inside the 5
- WR3, TE, and RB now get targets (previously only WR1/WR2/TE)
- Expected result: avg game ~43 pts instead of ~23, completion % ~64% instead of 55%

---

## 🏟️ Live Game Field Animation

The field view got a visual overhaul:

- Fixed field coordinates being **completely backwards** (ball, LOS, first-down line were mirrored)
- Ball is bigger with team-color glow
- First-down line is now dashed yellow (distinct from solid blue LOS)
- All text overlays (TOUCHDOWN!, INCOMPLETE, TURNOVER, PENALTY) have dark outlines so you can actually read them
- Down & distance pill shown at the line of scrimmage between plays
- Field position shows team abbreviations (e.g. "DAL 35") matching the score bug
- Smooth ball glide between plays instead of teleporting
- Real-time dotted trail during pass animations
- Higher arcs for kickoffs/punts vs passes
- Drive progress zone shows yards gained on current drive
- End zone pulses with team color on TDs and FGs
- Sharp rendering on Retina/high-DPI displays
- Big plays get minimum screen time even at fast speeds (TD: 1.2s, turnover: 1s)

---

## 💰 Salary Cap Scaling

Player salary demands now scale with the cap. By 2031 when the cap hits ~$420M, a starting QB asks for $46M instead of $33M. Salaries grow as the cap grows — just like real NFL.

---

## 🤖 AI Commentary

- Recap show now only generates for your team's game (90% cheaper)
- Server-side caching prevents redundant API calls
- Defaults to OFF — toggle it on in Settings to try it out

---

## 🔧 Quality of Life

- **Settings auto-save** — All toggles and sliders save automatically, no more clicking "Save Changes"
- Re-signing page button now correctly says "Advance to Free Agency" instead of "Advance to Draft"
- Trade accepted banner now shows when accepting AI proposals (previously showed nothing)
- NFL mock draft first-round order respects traded picks

---

Let me know what you think and what you want to see next. Drop feedback in the thread 👇
