"""Cut rendered Aurora takes into per-phrase clips + write the app manifest.

Usage: python3 slice_phrases.py <worktree> [--force]   (existing clips are kept unless --force)
Expects show-assets/takes/<take>.mp4 (Aurora output for <take>.wav).
Writes <worktree>/public/show/phrases/<id>.mp4, <worktree>/public/show/ordinals/<host>/<n>.mp3
and <worktree>/src/lib/spotlight/phraseManifest.json.
"""
import json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PRE, POST = 0.30, 0.40   # padding around each phrase (gaps are 0.9s)

def speech_span(f):
    """First/last 20ms window within 32 dB of the loudest: where the words are.
    The player trims the clip's lead-in/tail silence to this."""
    import numpy as np
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", f, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"])
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    hop = 320; n = len(x) // hop
    db = 20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12))
    idx = np.where(db > db.max() - 32)[0]
    return {"start": round(idx[0] * 0.02, 2), "end": round((idx[-1] + 1) * 0.02, 2)}

def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]))

def main(wt):
    bank = {p["id"]: p for p in json.load(open(os.path.join(ROOT, "phrases.json")))["phrases"]}
    takes = json.load(open(os.path.join(ROOT, "takes", "takes.json")))
    out = os.path.join(wt, "public", "show", "phrases")
    os.makedirs(out, exist_ok=True)
    manifest = []
    for take, t in takes.items():
        vid = os.path.join(ROOT, "takes", take + ".mp4")
        vd = dur(vid)
        drift = vd - t["duration"]
        print(f"{take}: video {vd:.2f}s vs audio {t['duration']:.2f}s (drift {drift:+.2f}s)")
        if abs(drift) > 0.5:
            raise SystemExit(f"{take}: video/audio length mismatch — cut points unsafe")
        for e in t["phrases"]:
            a = max(0.0, e["start"] - PRE)
            b = min(vd, e["end"] + POST)
            dst = os.path.join(out, e["id"] + ".mp4")
            if os.path.exists(dst) and "--force" not in sys.argv:
                pass  # already cut (keeps committed clips byte-stable)
            else:
              subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", vid,
                                   "-vf", "scale=960:-2", "-c:v", "libx264", "-preset", "slow", "-crf", "26",
                                   "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", dst])
            p = bank[e["id"]]
            kind = p.get("kind") or "stat"
            m = {"id": e["id"], "host": p["host"], "kind": kind, "text": p["text"],
                 "src": f"/show/phrases/{e['id']}.mp4", "duration": round(dur(dst), 3),
                 "speech": speech_span(dst)}
            if "stat" in p: m["stat"] = p["stat"]
            if "tone" in p: m["tone"] = p["tone"]
            if "slot" in e:
                m["slot"] = {"start": round(e["slot"]["start"] - a, 3), "end": round(e["slot"]["end"] - a, 3)}
            manifest.append(m)
    order = {pid: i for i, pid in enumerate(bank)}
    manifest.sort(key=lambda m: order[m["id"]])
    json.dump(manifest, open(os.path.join(wt, "src", "lib", "spotlight", "phraseManifest.json"), "w"), indent=1)
    for host in ("marcus", "tony"):
        d = os.path.join(wt, "public", "show", "ordinals", host)
        os.makedirs(d, exist_ok=True)
        for n in range(1, 33):
            shutil.copyfile(os.path.join(ROOT, "ordinals", host, f"{n}.mp3"), os.path.join(d, f"{n}.mp3"))
    print(len(manifest), "phrases sliced; manifest + ordinals written")

if __name__ == "__main__":
    main(sys.argv[1])
