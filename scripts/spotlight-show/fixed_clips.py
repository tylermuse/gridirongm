"""Re-record the show's fixed open/close clips the same way as the phrase bank
(eleven_v3 voices -> one take per host -> HeyGen render -> freeze screens -> cut).
  python3 fixed_clips.py voice          # TTS + takes/fixed_<host>.wav + takes/fixed.json
  python3 fixed_clips.py cut <worktree> # after takes/fixed_<host>.mp4 renders exist
"""
import json, os, subprocess, sys, wave
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
LINES = {
    "marcus": [("marcus_intro", "Welcome back to Team Spotlight. I'm Marcus Cole, and as always, I've got Tony Blaze with me."),
               ("marcus_outro", "And that's the show. Thanks for spending some time with us on Team Spotlight. We'll see you next week.")],
    "tony": [("tony_intro", "Good to be here, Marcus. And I've got a lot to say about this team, so let's not waste any time."),
             ("tony_outro", "Stay loud, keep grinding, and we'll talk to you next time. I'm Tony Blaze. We're out.")],
}
SR, LEAD, GAP, PRE, POST = 44100, 0.6, 1.2, 0.15, 0.35

def voice():
    from produce_tts import tts, VOICES
    from build_takes import decode
    os.makedirs(os.path.join(HERE, "tts", "fixed"), exist_ok=True)
    man = {}
    for host, lines in LINES.items():
        pcm = bytearray(b"\0\0" * int(LEAD * SR)); entries = []
        for cid, text in lines:
            mp3 = os.path.join(HERE, "tts", "fixed", cid + ".mp3")
            if not os.path.exists(mp3):
                audio, _ = tts(VOICES[host], text, "eleven_v3"); open(mp3, "wb").write(audio)
            a = decode(mp3); s = len(pcm) / 2 / SR; pcm += a
            entries.append({"id": cid, "text": text, "start": round(s, 4), "end": round(len(pcm) / 2 / SR, 4)})
            pcm += b"\0\0" * int(GAP * SR)
        with wave.open(os.path.join(HERE, "takes", f"fixed_{host}.wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(bytes(pcm))
        man[host] = {"duration": round(len(pcm) / 2 / SR, 3), "clips": entries}
        print(host, man[host]["duration"], [e["id"] for e in entries])
    json.dump(man, open(os.path.join(HERE, "takes", "fixed.json"), "w"), indent=1)

def cut(wt):
    from freeze_bg import freeze
    from slice_phrases import speech_span, dur
    man = json.load(open(os.path.join(HERE, "takes", "fixed.json")))
    for host, t in man.items():
        raw = os.path.join(HERE, "takes", f"fixed_{host}.mp4"); vid = raw.replace(".mp4", ".frozen.mp4")
        if not os.path.exists(vid): freeze(raw, vid)
        vd = dur(vid); print(host, "video", vd, "audio", t["duration"])
        for e in t["clips"]:
            a, b = max(0, e["start"] - PRE), min(vd, e["end"] + POST)
            dst = os.path.join(wt, "public", "show", e["id"] + ".mp4")
            subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", vid, "-vf", "scale=1280:-2",
                                   "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", dst])
            print(json.dumps({"id": e["id"], "text": e["text"], "speech": speech_span(dst), "dur": round(dur(dst), 2)}))

if __name__ == "__main__":
    voice() if sys.argv[1] == "voice" else cut(sys.argv[2])
