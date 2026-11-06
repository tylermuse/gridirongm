// Court Cam clip library: loads clips.json + clips.bin (retargeted mocap, Int16 quaternions per bone per frame,
// hips height in cm, yaw-normalised root path in feet) into THREE.AnimationClips for the player rig.
import * as THREE from 'three';

export async function loadClipLibrary(base = './', { maxJumpFt = 3.0, maxShotJumpFt = 1.5, standingCm = 113.3 } = {}) {
  const [meta, bin] = await Promise.all([
    fetch(base + 'clips.json').then(r => r.json()),
    fetch(base + 'clips.bin').then(r => r.arrayBuffer()),
  ]);
  const lib = { fps: meta.fps, bones: meta.bones, meta: meta.clips, clips: {} };
  const i16 = new Int16Array(bin), f32 = new Float32Array(bin);
  for (const [name, c] of Object.entries(meta.clips)) {
    const n = c.frames, nb = meta.bones.length; const times = new Float32Array(n); for (let f = 0; f < n; f++) times[f] = f / meta.fps;
    const tracks = [];
    for (let b = 0; b < nb; b++) {
      const vals = new Float32Array(n * 4);
      for (let f = 0; f < n; f++) { const o = c.q / 2 + (f * nb + b) * 4; vals[f * 4] = i16[o] / 32767; vals[f * 4 + 1] = i16[o + 1] / 32767; vals[f * 4 + 2] = i16[o + 2] / 32767; vals[f * 4 + 3] = i16[o + 3] / 32767; }
      tracks.push(new THREE.QuaternionKeyframeTrack(meta.bones[b] + '.quaternion', times, vals));
    }
    // hips position: height from the clip, x/z stay at the rig's rest (root motion is the sim's job)
    const hy = f32.subarray(c.hipsY / 4, c.hipsY / 4 + n); const pos = new Float32Array(n * 3);
    // exaggerated captures (the flying-dunk pack rises 5–7 ft, the jumpers 2+) are squashed to a believable vertical:
    // rim finishes/blocks/jump balls may rise maxJumpFt, every other clip (jump shots) maxShotJumpFt
    const cap = /free_throw/.test(name) ? .15 : /dunk|block|jumpball|tip_in|layup|finger|floater|hook|double_clutch|mx_jump|mx_standing/.test(name) ? maxJumpFt : maxShotJumpFt;   // a free throw rises onto the toes, no more
    const k = c.jump > cap ? cap / c.jump : 1;
    for (let f = 0; f < n; f++) { pos[f * 3] = 0; pos[f * 3 + 1] = hy[f] > standingCm ? standingCm + (hy[f] - standingCm) * k : hy[f]; pos[f * 3 + 2] = 0; }
    // when to let go of the ball: just before the hand's full extension, and never after the top of the jump
    // (the hand keeps rising into the follow-through while the body is already coming down)
    let release = Math.max(0, c.handPeak - .06);
    if (!c.loop && c.jump >= .9) { let apex = -1, best = -Infinity; for (let f = 0; f < n; f++) { const t = f / meta.fps; if (t < c.handPeak - .8 || t > c.handPeak + .1) continue; if (hy[f] > best) { best = hy[f]; apex = t; } }
      if (apex >= 0) release = Math.max(0, Math.min(release, apex - .03)); }
    c.release = release;
    tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', times, pos));
    const clip = new THREE.AnimationClip(name, c.dur, tracks);
    lib.clips[name] = clip;
    c.pathXZ = f32.subarray(c.path / 4, c.path / 4 + n * 2);
  }
  return lib;
}

/** Root path sample (feet, clip-local: +z is the clip's facing) at time t. */
export function pathAt(lib, name, t) {
  const c = lib.meta[name]; if (!c) return [0, 0];
  const f = Math.min(c.frames - 1, Math.max(0, t * lib.fps)); const i = Math.floor(f), u = f - i, j = Math.min(c.frames - 1, i + 1);
  return [c.pathXZ[i * 2] * (1 - u) + c.pathXZ[j * 2] * u, c.pathXZ[i * 2 + 1] * (1 - u) + c.pathXZ[j * 2 + 1] * u];
}
