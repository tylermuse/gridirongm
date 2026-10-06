"""Voice the Spotlight phrase bank + rank ordinals with ElevenLabs (same voices/model
as /api/spotlight-show). Writes show-assets/tts/<id>.mp3 + <id>.json (alignment, slot timing)
and show-assets/tts/ordinals/<host>/<n>.mp3. Idempotent: skips files that exist."""
import base64, json, os, sys, urllib.request

KEY = os.environ["ELEVENLABS_API_KEY"]
VOICES = {"marcus": "NKI4WPSf2OjKR4G4fadW", "tony": "aGw6gMq5DRXPll7WVlNn"}
MODEL = "eleven_multilingual_v2"
HERE = os.path.dirname(os.path.abspath(__file__))
# Working files (audio, takes, renders) live in the gitignored <repo>/show-assets/.
# Run from a copy inside <repo>/show-assets/ (like the other scripts).
ROOT = HERE
OUT = os.path.join(ROOT, "tts")

ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
       "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth",
       "eighteenth", "nineteenth", "twentieth", "twenty-first", "twenty-second", "twenty-third",
       "twenty-fourth", "twenty-fifth", "twenty-sixth", "twenty-seventh", "twenty-eighth",
       "twenty-ninth", "thirtieth", "thirty-first", "thirty-second"]


def tts(voice, text, model=MODEL):
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": model}).encode(),
        headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.load(r)
    return base64.b64decode(j["audio_base64"]), j["alignment"]


def main():
    bank = json.load(open(os.path.join(HERE, "phrases.json")))
    os.makedirs(OUT, exist_ok=True)
    for p in bank["phrases"]:
        mp3 = os.path.join(OUT, p["id"] + ".mp3")
        if os.path.exists(mp3):
            continue
        text = p["text"]
        slot = None
        if "{rank}" in text:
            ph = bank["placeholders"][p["tone"]]
            i = text.index("{rank}")
            if i == 0:
                ph = ph[0].upper() + ph[1:]
            text = text.replace("{rank}", ph)
            slot = (i, i + len(ph))
        audio, al = tts(VOICES[p["host"]], text, p.get("model", MODEL))
        meta = {"id": p["id"], "spoken": text, "alignment": al}
        if slot:
            meta["slot"] = {"start": al["character_start_times_seconds"][slot[0]],
                            "end": al["character_end_times_seconds"][slot[1] - 1]}
        open(mp3, "wb").write(audio)
        json.dump(meta, open(os.path.join(OUT, p["id"] + ".json"), "w"))
        print("voiced", p["id"], "slot" if slot else "", flush=True)

    for host, voice in VOICES.items():
        d = os.path.join(OUT, "ordinals", host)
        os.makedirs(d, exist_ok=True)
        for n, word in enumerate(ORD, 1):
            f = os.path.join(d, f"{n}.mp3")
            if os.path.exists(f):
                continue
            audio, _ = tts(voice, word[0].upper() + word[1:] + ".")
            open(f, "wb").write(audio)
        print("ordinals done", host, flush=True)


if __name__ == "__main__":
    main()
