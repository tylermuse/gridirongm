# BS Hoops hero video

Same pipeline as the football one in `scripts/hero-video/`, with BS Hoops content and styling (orange, Barlow Condensed).
Render from this folder with `python3 ../render.py wide` / `python3 ../render.py square`.

- `motion.html`: the scenes (front office → Court Cam 3D → Trade Finder → draft board Scout dropdown → end card)
- `assets_h.py fresh` / `assets_h.py draft`: re-capture the UI cut-outs from bs-basketball.com. `draft` needs a
  Playwright storage state (`state3.json`, saved with `indexed_db=True`) of a league that has reached the draft:
  pick a team, Sim Rest of Season → Start Playoffs → Enter Offseason → Start the Lottery Reveal → Skip.
- `v3d/rec.py <name> <playtype> <force> <cam> [secs]`: records a Court Cam possession with a virtual clock, e.g.
  `python3 rec.py pnr_three spot make broadcast 14` and `python3 rec.py fastbreak_dunk trans dunk chase 14`.
  Frames land in `v3d/frames/<name>/` (gitignored); `shots.js` picks the segments.

Encode: the same ffmpeg lines as `scripts/hero-video/README.md`, writing to `apps/bs-basketball/public/videos/`.
