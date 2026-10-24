# Spotlight show phrase bank — production pipeline

`phrases.json` is the source script for the on-camera phrase clips (`{rank}` = runtime slot).
Working files go to the gitignored `<repo>/show-assets/`.

1. `ELEVENLABS_API_KEY=… python3 produce_tts.py` — voices every phrase (same voices/model as
   `/api/spotlight-show`) with character timestamps, plus ordinals 1st–32nd per host. Idempotent.
2. `python3 build_takes.py` — packs phrases into long takes with fixed 0.9s gaps
   (`show-assets/takes/<take>.wav` + `takes.json`) and trims the ordinals.
3. In ElevenLabs → Image & Video → Lip sync → **Creatify Aurora**, render each take with the
   host portrait (Marcus / Tony) and the take's .wav; save as `show-assets/takes/<take>.mp4`.
4. `python3 slice_phrases.py <repo>` — cuts clips at the known offsets into
   `public/show/phrases/`, copies ordinals to `public/show/ordinals/`, writes
   `src/lib/spotlight/phraseManifest.json` (with slot windows).

5. `python3 measure_levels.py <worktree>` — measures every clip's speech loudness into
   `src/lib/spotlight/clipLevels.json`; the player levels every clip and generated line to
   one target (`TARGET_DB` in `src/lib/spotlight/loudness.ts`). Rerun after any new or
   re-cut clips (the loudness test fails if a clip has no level).

Adding a phrase = add it to `phrases.json`, then rerun 1–4 (only new phrases are voiced; you
can render just a small take for the new ones).

## Adding phrases later

Give new entries in `phrases.json` a `"take": "<host>_c"` (or `_d`, …) field.
`build_takes.py` packs each tagged group into its own take and leaves the
original a/b takes untouched, so only the new take needs an Aurora render.
`slice_phrases.py` skips clips that already exist (pass `--force` to recut).

## Rendering (current setup)

- Lip sync: **HeyGen Avatar 4** (1080p, talking style *Expressive*) on each
  host's portrait in ElevenLabs Image & Video. Takes a–c were Creatify
  Aurora (720p); everything new uses HeyGen.
- `slice_phrases.py` runs `freeze_bg.py` on every take first: the
  generators animate the football player on the studio TVs, so those two
  screen regions are replaced with the take's first frame (feathered mask
  that stays clear of the host). Clips are cut at 1280px, CRF 23.
- `ONLY=take1,take2 python3 slice_phrases.py <worktree> --force` re-cuts
  just those takes.

## Topical lines (`kind: "topical"`)

Subject lines (draft, trades, free agency, coaching, injuries, playoffs,
contracts, rebuild, QB, units, streaks) plus short conversational reactions,
tagged with `tags` (see `TOPIC_TAGS` in `src/lib/spotlight/phrases.ts`).
The episode writer (`showWriter.ts`) may place any of them by id; without the
writer, the composer drops in one per topic when a line's subject matches.
`tone`/`stat` keep a line true for the team (no "they're rolling" for a 2-9
team); `writerOnly` marks lines that make a specific claim only the writer can
vouch for. They're voiced with `eleven_v3` (`"model"` per phrase).

Scripts are run from a copy inside `<repo>/show-assets/` (they use their own
folder as the working root). `build_takes.py` no longer re-trims ordinals
unless passed `--ordinals` — the in-context ordinals from
`show-assets/produce_ordinals_ctx.py` are the ones that ship.

Wide conversation loops (`public/show/wide/`): Veo 3.1 Lite, 8s, start frame =
end frame = the wide two-shot, audio off; TV screens frozen with
`show-assets/wide/freeze_wide.py`.

## Two-shots (show themes, banter) — `wide/`

Both hosts in one shot, each lip-synced only on his own lines. HeyGen animates
one face per render, so each host is rendered on his own crop of the studio
two-shot and both are composited back over the still:

1. Add the back-and-forth to `wide/scripts.json` (`[["marcus","…"],["tony","…"]]`).
2. Voice it: `python3 dlg.py <key>.json <key>.mp3` (ElevenLabs v3 dialogue). It
   writes `<key>.mp3` with a 0.6 s lead-in (HeyGen's lips start late when speech
   begins at 0 s; use `speech.start: 0.35` in wideClips.json) and
   `<key>.mp3.spans.json`, each line's time span. ElevenLabs' own per-line
   timestamps tile the audio and often land mid-word, so `snap_spans.py` moves
   each cut to the pause between the lines (the player does the same for
   generated lines, `snapLineCuts` in loudness.ts).
3. `python3 split_tracks.py <key>` → `<key>.marcus.mp3` / `<key>.tony.mp3`
   (the other host's turns silenced).
4. Decide the shots: in `shots.json`, one letter per line — `p` the hosts face
   each other, `c` they face the camera (rules and welcomes to camera, jabs
   and reactions to each other; banter stays face to face). Then
   `python3 plan_shots.py` writes `plan.json` (the segments of each clip) and,
   for every camera segment, an audio slice per host in `seg/` (0.6 s lead-in).
5. Render in HeyGen Avatar 4 (Expressive, 1080p):
   - the whole clip per host on the facing-each-other crops
     `crop_marcus.png` / `crop_tony.png` → `<key>.marcus.mp4` / `<key>.tony.mp4`;
   - every camera segment per host on the facing-camera crops
     `crop_marcus_cam.png` / `crop_tony_cam.png` (cut from `medium_cam.png`,
     the same still with both hosts turned to the lens) →
     `<key>__<n>.marcus.cam.mp4` / `<key>__<n>.tony.cam.mp4`.
   All crops and stills live in show-assets/wide2.
   Face-to-face segments are rendered on the grinning still `medium_smile.png`
   (crops `crop_marcus_smile.png` / `crop_tony_smile.png`) — those lines are
   the jabs — and camera segments on `medium_cam.png`.
6. `python3 compose_shots.py <key>` → `<key>.mp4` and `<key>.timing.json`:
   at every shot change a 1 s clip of the hosts actually turning their heads
   (`turn_pc.mp4` / `turn_cp.mp4`: a Seedance start-frame/end-frame
   generation between the two stills, retimed, persons only composited over
   the still; `turn_cp` is `turn_pc` reversed) is cut in at the pause, with
   1 s of silence added to the audio, so every line after a turn moves back
   by 1 s — `timing.json` has the lines' final spans. Every HeyGen render is
   delayed 0.16 s (its lips run ahead of the voice by about that). Copy to
   `public/show/wide/`, put the timing.json spans, duration and shots into
   `src/lib/spotlight/wideClips.json`, and re-run `measure_levels.py`.
7. Grins only where they belong: in `shots.json` a face-to-face line is `P`
   (grinning: a joke, an insult, or the reaction to one) or `p`
   (straight-faced: the whole-clip renders on `medium.png`). The per-segment
   renders were made for the c/p runs saved in `runs.json`; a `P` line is cut
   out of the pair render of the run it falls in, so re-splitting P/p needs no
   re-render (`python3 plan_shots.py --plan-only`). p↔P is a 0.35 s crossfade
   at the pause; c↔p turns use the straight-faced `turn_pc_n.mp4` /
   `turn_cp_n.mp4` (Seedance, medium.png → medium_cam.png)..