#!/usr/bin/env python3
"""
Team Spotlight Podcast Generator
Converts a two-host dialogue script into a stitched MP3 podcast using ElevenLabs TTS.
"""

import json
import os
import io
import time
from pathlib import Path
from elevenlabs import ElevenLabs
from pydub import AudioSegment

# ── Config ──────────────────────────────────────────────────────────────
API_KEY = "sk_a223ec6a8c8f40a82fffa4c9ee2e94b5c6b08bd61e23131c"
SCRIPT_PATH = "podcast_script.json"
OUTPUT_DIR = Path("audio_clips")
FINAL_OUTPUT = "team_spotlight_podcast.mp3"

# Voice settings — pick two distinct ElevenLabs voices
# Marcus Cole: calm, analytical anchor → "Chris" (deep, measured)
# Tony Blaze: energetic hot-take host → "Brian" (punchy, expressive)
VOICES = {
    "marcus": {
        "voice_id": "iP95p4xoKVk53GoZ742B",   # Chris
        "name": "Marcus Cole",
        "model": "eleven_multilingual_v2"
    },
    "tony": {
        "voice_id": "nPczCjzI2devNBz1zQrb",    # Brian
        "name": "Tony Blaze",
        "model": "eleven_multilingual_v2"
    }
}

PAUSE_BETWEEN_LINES_MS = 400      # pause between speakers
PAUSE_BETWEEN_SECTIONS_MS = 1200  # pause between topic sections

def main():
    client = ElevenLabs(api_key=API_KEY)

    # Voice assignments
    # Marcus Cole → "Sam - Engaging Game Narrator" (sports play-by-play energy)
    # Tony Blaze → custom voice provided by user
    VOICES["marcus"]["voice_id"] = "NKI4WPSf2OjKR4G4fadW"   # Marcus Cole voice
    VOICES["tony"]["voice_id"] = "aGw6gMq5DRXPll7WVlNn"     # Tony Blaze voice
    print("🎙️  Voice assignment:")
    print("   Marcus Cole → NKI4W...")
    print("   Tony Blaze  → JS0Kw...")

    # Load script
    print("\n📜 Loading podcast script...")
    with open(SCRIPT_PATH) as f:
        script = json.load(f)

    total_lines = sum(len(s["lines"]) for s in script)
    print(f"   {len(script)} sections, {total_lines} total lines\n")

    # Generate audio for each line
    OUTPUT_DIR.mkdir(exist_ok=True)
    all_segments = []
    line_num = 0

    for sec_idx, section in enumerate(script):
        print(f"🔊 Section {sec_idx+1}/{len(script)}: {section['section']}")

        for line in section["lines"]:
            line_num += 1
            speaker = line["speaker"]
            text = line["text"]
            voice_cfg = VOICES[speaker]

            clip_path = OUTPUT_DIR / f"line_{line_num:03d}_{speaker}.mp3"

            # Generate TTS
            print(f"   [{line_num}/{total_lines}] {voice_cfg['name']}: {text[:60]}...")

            try:
                audio_gen = client.text_to_speech.convert(
                    voice_id=voice_cfg["voice_id"],
                    text=text,
                    model_id="eleven_multilingual_v2",
                    output_format="mp3_44100_128"
                )

                # Collect the generator output into bytes
                audio_bytes = b""
                for chunk in audio_gen:
                    audio_bytes += chunk

                with open(clip_path, "wb") as out:
                    out.write(audio_bytes)

                # Load into pydub
                segment = AudioSegment.from_mp3(str(clip_path))
                all_segments.append(("line", segment))

            except Exception as e:
                print(f"   ⚠️  Error generating line {line_num}: {e}")
                continue

            # Small delay to respect rate limits
            time.sleep(0.3)

        # Add section break marker
        all_segments.append(("section_break", None))
        print()

    # Stitch everything together
    print("🎧 Stitching final podcast...")
    silence_between = AudioSegment.silent(duration=PAUSE_BETWEEN_LINES_MS)
    silence_section = AudioSegment.silent(duration=PAUSE_BETWEEN_SECTIONS_MS)

    podcast = AudioSegment.empty()

    for i, (seg_type, segment) in enumerate(all_segments):
        if seg_type == "section_break":
            podcast += silence_section
        elif seg_type == "line":
            if len(podcast) > 0:
                podcast += silence_between
            podcast += segment

    # Export
    print(f"\n💾 Exporting to {FINAL_OUTPUT}...")
    podcast.export(FINAL_OUTPUT, format="mp3", bitrate="192k")

    duration_sec = len(podcast) / 1000
    minutes = int(duration_sec // 60)
    seconds = int(duration_sec % 60)

    print(f"\n✅ Done! Podcast generated:")
    print(f"   📁 {FINAL_OUTPUT}")
    print(f"   ⏱️  Duration: {minutes}:{seconds:02d}")
    print(f"   🎙️  Marcus Cole + Tony Blaze")
    print(f"   📊 {total_lines} lines across {len(script)} segments")

if __name__ == "__main__":
    main()
