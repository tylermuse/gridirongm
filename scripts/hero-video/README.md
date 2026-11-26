# Homepage hero video

`public/videos/hero-desktop.mp4` (1600x900) and `hero-mobile.mp4` (900x900) are a looping motion piece:
real UI cut-outs from the game animated over a light background, plus live 3D sim footage.
Rendered frame by frame, so it always plays at a smooth 30 fps. Shown by `src/components/home/HeroVideo.tsx`.

## Pieces
- `motion.html` — the animation (scenes, copy, layout, timing). Preview: open `motion.html?mode=wide` or `?mode=square`.
- `render.py wide|square` — renders `motion-<mode>-master.mp4` (1920x1080 / 1080x1080). `--stills 2.2,5.0` for preview frames.
- `assets/` — 3x PNG cut-outs + `sizes.js` (each PNG's size / 3; regenerate after recapturing).
  - `assets.py Detroit` — Call-the-play, negotiation, etc. from the live game (`cap.py` = shared helpers)
  - `assets_game.py Detroit` / `assets_game.py Buffalo` — game cut-outs / trade-finder cards
  - `assets_mock.py` — 2027 big-board rows + the open scouting report from /mock-draft
- `v3d/` — 3D footage from `/chase-cam` with a virtual clock (see `v3d/README.md`). Frames are not committed:
  run `python3 rec3d.py bomb_chase bomb low` and `python3 rec3d.py breakaway_bcast breakaway broadcast` in `v3d/`;
  `shots.js` lists which frames are used.

## Encode for the web
    ffmpeg -i motion-wide-master.mp4 -an -vf scale=1600:900 -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart public/videos/hero-desktop.mp4
    ffmpeg -i motion-square-master.mp4 -an -vf scale=900:900 -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart public/videos/hero-mobile.mp4
    ffmpeg -ss 2.2 -i motion-wide-master.mp4 -frames:v 1 -q:v 3 public/videos/hero-desktop-poster.jpg

Needs python3 + playwright + pillow, ffmpeg, Chrome (set CHROME_PATH), and the Inter Display font.
