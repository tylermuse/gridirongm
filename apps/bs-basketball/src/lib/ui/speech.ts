/**
 * Client-side "podcast" playback for The Show (parity 3.5).
 *
 * Reads the two-persona spotlight script aloud via the browser's built-in
 * SpeechSynthesis API — no backend, no TTS cost. The two hosts get distinct
 * pitch/rate so the analyst and the hot-take voice sound different. No-ops
 * (and reports unsupported) on browsers without the API or on the server.
 */

export type SpeechVoice = 'analyst' | 'take';
export interface SpeechLine { text: string; voice: SpeechVoice }

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Speak a sequence of lines in order. Cancels anything already playing.
 *  `onEnd` fires after the last line finishes (or immediately if unsupported). */
export function speakLines(lines: SpeechLine[], onEnd?: () => void): void {
  if (!isSpeechSupported()) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  if (lines.length === 0) { onEnd?.(); return; }
  lines.forEach((line, i) => {
    const u = new SpeechSynthesisUtterance(line.text);
    // Analyst = steadier/lower; hot-take = quicker/higher.
    u.rate = line.voice === 'take' ? 1.08 : 0.98;
    u.pitch = line.voice === 'take' ? 1.18 : 0.9;
    if (i === lines.length - 1) u.onend = () => onEnd?.();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
