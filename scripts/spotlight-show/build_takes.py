"""Assemble phrase audio into long takes for Aurora (fixed gaps → exact cut points),
and trim rank ordinals. Writes show-assets/takes/<take>.wav + takes.json."""
import json, os, subprocess, wave

HERE = os.path.dirname(os.path.abspath(__file__))
# Working files (audio, takes, renders) live in the gitignored <repo>/show-assets/.
ROOT = os.path.join(HERE, '..', '..', 'show-assets')
os.makedirs(ROOT, exist_ok=True)
TTS = os.path.join(ROOT, "tts")
OUT = os.path.join(ROOT, "takes")
SR = 44100
GAP = 0.9     # silence between phrases
LEAD = 0.6    # silence at the start of each take

def decode(mp3):
    return subprocess.check_output(["ffmpeg", "-v", "error", "-i", mp3, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"])

def main():
    bank = json.load(open(os.path.join(HERE, "phrases.json")))["phrases"]
    os.makedirs(OUT, exist_ok=True)
    takes = {}
    for host in ("marcus", "tony"):
        ps = [p for p in bank if p["host"] == host]
        half = (len(ps) + 1) // 2
        takes[f"{host}_a"] = ps[:half]
        takes[f"{host}_b"] = ps[half:]

    manifest = {}
    for name, ps in takes.items():
        pcm = bytearray(b"\0\0" * int(LEAD * SR))
        entries = []
        for p in ps:
            a = decode(os.path.join(TTS, p["id"] + ".mp3"))
            start = len(pcm) / 2 / SR
            pcm += a
            end = len(pcm) / 2 / SR
            meta = json.load(open(os.path.join(TTS, p["id"] + ".json")))
            e = {"id": p["id"], "start": round(start, 4), "end": round(end, 4)}
            if "slot" in meta:
                e["slot"] = {"start": round(start + meta["slot"]["start"], 4), "end": round(start + meta["slot"]["end"], 4)}
            entries.append(e)
            pcm += b"\0\0" * int(GAP * SR)
        with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(bytes(pcm))
        manifest[name] = {"duration": round(len(pcm) / 2 / SR, 3), "phrases": entries}
        print(name, len(ps), "phrases", manifest[name]["duration"], "s")
    json.dump(manifest, open(os.path.join(OUT, "takes.json"), "w"), indent=1)

    # Trim ordinals to the spoken word (keeps a hair of tail).
    for host in ("marcus", "tony"):
        d = os.path.join(TTS, "ordinals", host)
        od = os.path.join(ROOT, "ordinals", host)
        os.makedirs(od, exist_ok=True)
        for n in range(1, 33):
            subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(d, f"{n}.mp3"),
                "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.03",
                "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", os.path.join(od, f"{n}.mp3")])
    print("ordinals trimmed")

if __name__ == "__main__":
    main()
