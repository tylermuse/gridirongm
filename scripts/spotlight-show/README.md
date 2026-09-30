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
