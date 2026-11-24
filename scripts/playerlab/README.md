# playerlab — the 3D sim's "mh2" player

Builds `public/chase-cam/player-mh2.js`, the player model the live 3D sim uses (`model=mh2`).

What goes in:
- **Body, skin, eyes, brows, lashes, rig weights** — MakeHuman / MPFB (CC0). Not committed; download into `$PLAYERLAB_DIR/src/`
  (default `../gridirongm-playerlab/src/`): `git clone --depth 1` of `makehumancommunity/makehuman` and `makehumancommunity/mpfb2`, plus
  `makehuman_system_assets_cc0.zip` from files.makehumancommunity.org saved as `src/assets/sys.zip` and the needed folders unzipped into `src/x/`
  (`eyes/`, `eyebrows/eyebrow001/`, `eyelashes/eyelashes02/`, `skins/young_caucasian_male/`, `skins/young_african_male/`).
- **Skeleton, helmet, cleats, animation clips** — from `public/chase-cam/player-fp27.js` ("American Football Player" by Stuffed Dog Digital, CC BY 4.0; keep the credit).
- **Extra locomotion clips** (jog, run, backpedal, shuffles, slides, celebrations) — the court-cam set in `apps/bs-basketball/public/court-cam/clips.*`, already on this skeleton.
- **Pads, jersey drape, pants, socks, sleeves and their painted textures** — generated here (`gear.py`, `player.py`).

Run: `python3 player.py` (numpy needed), then package the GLB + `player-mh2.json` into `player-mh2.js` (base64 GLB + the dark skin texture in
`PLAYER_TEX`; see the header of the current file). Body types are morph targets [0] line, [1] power; [2] is the face morph for deeper skin tones.
Remember to bump `SIM_BUILD` in `LiveSim3D.tsx` and `public/chase-cam/index.html` after replacing the file.

After packaging, run `python3 add_clips.py`: it adds the extra captured throws (`football_throw_b`..`e`) to `player-mh2.js`, which `player.py` does not carry.
It reads the retargeted captures from `$PLAYERLAB_DIR/mocaplab/raw/` (licensed, not committed) and can be run again safely. The sim picks a throw per
quarterback in `throwClip()` and falls back to `football_throw` on a player file without them.
