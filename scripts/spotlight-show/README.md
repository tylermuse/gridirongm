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
