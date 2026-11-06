// Retarget basketball clips (Animo 3ds Max Biped rig, Mixamo rig) onto the Court Cam player rig
// (Mixamo-named bones inside player-fp27.js). World-space rotation transfer with bind-pose offsets:
//   tgtWorld(t) = Yaw * srcWorld(t) * inv(srcBind) * tgtBind       (rotation only)
// Output: clips.bin (Int16 quaternions per frame per bone + hips Y + root path) and clips.json (index + metadata).
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// Usage: node --max-old-space-size=8000 scripts/court-cam-retarget.mjs  (run from apps/bs-basketball; needs `three` resolvable, e.g. npm i three@0.160.1 in a scratch dir and NODE_PATH)
const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIPS_DIR = process.env.CLIPS_DIR || join(APP, 'model/clips');   // the Mixamo + Animo FBX sources (not committed: licensed content)
const OUT = join(APP, 'public/court-cam');
globalThis.self = globalThis; globalThis.window = globalThis;
const V = (...a) => new THREE.Vector3(...a);
const FPS = 30;

// ---------- target rig ----------
const js = readFileSync(join(OUT, 'player-fp27.js'), 'utf8');
const b64 = js.match(/PLAYER_GLB_B64\s*=\s*"([A-Za-z0-9+/=]+)"/)[1];
const glbBuf = Buffer.from(b64, 'base64');
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength), '', res, rej));
let skin = null; gltf.scene.traverse(o => { if (o.isSkinnedMesh && !skin) skin = o; });
gltf.scene.updateMatrixWorld(true);
const tBindRot = {}, tBindPos = {};
const rotOf = m => { const q = new THREE.Quaternion(); m.decompose(V(), q, V()); return q.normalize(); };
skin.skeleton.bones.forEach((b, i) => { const m = new THREE.Matrix4().copy(skin.skeleton.boneInverses[i]).invert(); tBindRot[b.name] = rotOf(m); tBindPos[b.name] = V().setFromMatrixPosition(m); });
const tHips = skin.skeleton.bones.find(b => b.name === 'mixamorigHips');
const tHipsLocal = tHips.position.clone();            // cm, armature space
const tHipsBindY = tBindPos.mixamorigHips.y * 100;   // world metres -> cm (armature scale .01)

// target bones we drive (no fingers: hands keep the base clip's pose)
const TBONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'].map(n => 'mixamorig' + n);
// parent lookup in the target rig
const tParent = {}; skin.skeleton.bones.forEach(b => { tParent[b.name] = b.parent && b.parent.isBone ? b.parent.name : null; });

// ---------- source bone maps ----------
const BIPED = {
  mixamorigHips: 'RobotBip01_Pelvis', mixamorigSpine: 'RobotBip01_Spine', mixamorigSpine1: 'RobotBip01_Spine1', mixamorigSpine2: ['RobotBip01_Spine3', 'RobotBip01_Spine2'],
  mixamorigNeck: 'RobotBip01_Neck', mixamorigHead: 'RobotBip01_Head',
  mixamorigLeftShoulder: 'RobotBip01_L_Clavicle', mixamorigLeftArm: 'RobotBip01_L_UpperArm', mixamorigLeftForeArm: 'RobotBip01_L_Forearm', mixamorigLeftHand: 'RobotBip01_L_Hand',
  mixamorigRightShoulder: 'RobotBip01_R_Clavicle', mixamorigRightArm: 'RobotBip01_R_UpperArm', mixamorigRightForeArm: 'RobotBip01_R_Forearm', mixamorigRightHand: 'RobotBip01_R_Hand',
  mixamorigLeftUpLeg: 'RobotBip01_L_Thigh', mixamorigLeftLeg: 'RobotBip01_L_Calf', mixamorigLeftFoot: 'RobotBip01_L_Foot', mixamorigLeftToeBase: 'RobotBip01_L_Toe0',
  mixamorigRightUpLeg: 'RobotBip01_R_Thigh', mixamorigRightLeg: 'RobotBip01_R_Calf', mixamorigRightFoot: 'RobotBip01_R_Foot', mixamorigRightToeBase: 'RobotBip01_R_Toe0',
};
const MIXAMO = Object.fromEntries(TBONES.map(n => [n, n]));

// ---------- clip selection: source clip name -> output name (+flags) ----------
const PICK = {
  // dribbling / ball handling (ball in RH unless LH)
  'AA_Basketball_PlayerA_Basic_Stance_Idle_Type01_Loop': 'dribble_idle', 'AA_Basketball_PlayerA_Basic_Stance_Type01_RH_Loop': 'dribble_low', 'AA_Basketball_PlayerA_Basic_Stance_Type02_Loop': 'dribble_idle2', 'AA_Basketball_PlayerA_Basic_Stance_Type03_Loop': 'dribble_idle3',
  'AA_Basketball_PlayerA_Walk_Type01_Loop': 'dribble_walk', 'AA_Basketball_PlayerA_Jog_RH_Loop': 'dribble_jog', 'AA_Basketball_PlayerA_Run_RH_Loop': 'dribble_run',
  'AA_Basketball_PlayerA_crossover_RH_To_LH': 'crossover', 'AA_Basketball_PlayerA_Between_The_Legs_Type01_Loop': 'between_legs', 'AA_Basketball_PlayerA_Behind_The_Back_RH_To_LH': 'behind_back',
  'AA_Basketball_PlayerA_Triple_Threat_Type01_Loop': 'triple', 'AA_Basketball_PlayerA_Jab_Fake_RF_Loop': 'jab', 'AA_Basketball_PlayerA_Spin_Move_RH_Loop': 'spin', 'AA_Basketball_PlayerA_Pivot_Foot_Type01_LF_Loop': 'pivot',
  'AA_Basketball_PlayerA_Hop_Fake_RH': 'hop_fake', 'AA_Basketball_PlayerA_Pump_Fake': 'pump_fake', 'AA_Basketball_PlayerA_Euro_Step': 'euro_step', 'AA_Basketball_PlayerA_Jump_Stop_RH_Loop': 'jump_stop',
  // shots
  'AA_Basketball_PlayerA_Jump_Shot_RH': 'jump_shot', 'AA_Basketball_PlayerA_Jump_Shot_LH': 'jump_shot_lh', 'AA_Basketball_PlayerA_Pull_Up_Jump_Shot_RH': 'pullup', 'AA_Basketball_PlayerA_Catch_And_Shot_Type01_RH': 'catch_shoot', 'AA_Basketball_PlayerA_Catch_And_Shot_Type02_RH': 'catch_shoot2',
  'AA_Basketball_PlayerA_Turnaround_Jump_Shot_R': 'turnaround', 'AA_Basketball_PlayerA_Fade_Away_RH': 'fadeaway', 'AA_Basketball_PlayerA_Step_Back_RH': 'stepback', 'AA_Basketball_PlayerA_Hook_Shot_RH': 'hook', 'AA_Basketball_PlayerA_Floater_RH': 'floater',
  'AA_Basketball_PlayerA_Free_Throw_RH': 'free_throw', 'AA_Basketball_PlayerA_Side_Step_RH': 'sidestep', 'AA_Basketball_PlayerA_Pull_Back_RH': 'pullback', 'AA_Basketball_PlayerA_Double_Clutch_Shot_RH': 'double_clutch',
  'AA_Basketball_PlayerA_Layup_RH': 'layup', 'AA_Basketball_PlayerA_Layup_LH': 'layup_lh', 'AA_Basketball_PlayerA_Finger_Roll_RH': 'finger_roll', 'AA_Basketball_PlayerA_Finger_Roll_LH': 'finger_roll_lh', 'AA_Basketball_PlayerA_Reverse_Layup_Fake_RH_Shot_to_Idle': 'reverse_layup',
  'AA_Basketball_PlayerA_Dunk_Type01': 'dunk', 'AA_Basketball_PlayerA_Dunk_Type02': 'dunk2', 'AA_Basketball_PlayerA_Tip_In_RH': 'tip_in',
  'DUNK_One-Handed Dunk_Right Hand': 'dunk_one', 'DUNK_One-Handed Tomahawk Dunk_Right Hand': 'dunk_tomahawk', 'DUNK_Two-Handed Front Dunk_Right Side': 'dunk_two', 'DUNK_Two Hand Windmill Dunk': 'dunk_windmill', 'DUNK_Reverse Dunk': 'dunk_reverse', 'DUNK_360 Windmill Dunk': 'dunk_360', 'DUNK_Alley Oop Windmill Dunk_Right Hand': 'dunk_oop',
  // passing / catching
  'AA_Basketball_PlayerA_Chest_Pass_Type01': 'chest_pass', 'AA_Basketball_PlayerA_Bounce_Pass_Type01': 'bounce_pass', 'AA_Basketball_PlayerA_Overhead_Pass': 'overhead_pass', 'AA_Basketball_PlayerA_Wraparound_Pass_RH': 'wrap_pass',
  'AA_Basketball_PlayerA1_Catching_Type01': 'catch', 'AA_Basketball_PlayerA1_Catching_Type04_RH': 'catch_rh', 'AA_Basketball_PlayerA_Drifter_Type01_Run_To_Catching': 'run_catch',
  // defense / no ball
  'AA_Basketball_PlayerB_Defensive_Idle_Loop': 'def_idle', 'AA_Basketball_PlayerB_Defensive_Type01_LF_Loop': 'def_slide_l', 'AA_Basketball_PlayerB_Defensive_Type01_RF_Loop': 'def_slide_r', 'AA_Basketball_PlayerB_Defensive_Type02_LF_Loop': 'def_quick_l', 'AA_Basketball_PlayerB_Defensive_Type02_RF_Loop': 'def_quick_r',
  'AA_Basketball_PlayerB_Defensive_Type03_Loop': 'def_active', 'AA_Basketball_PlayerB_Defensive_Type05_Loop': 'def_hands',
  'AA_Basketball_PlayerB_Block_Shot_Type01_RH_Loop': 'block', 'AA_Basketball_PlayerB_Block_Shot_Type02_RH_Loop': 'block2', 'AA_Basketball_PlayerB_Steal_Type01_RH_Loop': 'steal', 'AA_Basketball_PlayerB_Steal_Type02_RH': 'steal2',
  'AA_Basketball_PlayerB_Box_Out_Type01_Loop': 'boxout', 'AA_Basketball_PlayerB_Box_Out_Type02_Loop': 'boxout2', 'AA_Basketball_PlayerB_Screen_Loop': 'screen', 'AA_Basketball_PlayerB_Screen_Jog_To_Loop': 'screen_set',
  'AA_Basketball_PlayerB_Idle_Type02_Loop': 'idle_long', 'AA_Basketball_PlayerA_Idle_Type02_Loop': 'idle', 'AA_Basketball_PlayerB_Walk_Loop': 'walk', 'AA_Basketball_PlayerB_Jog_RF_Loop': 'jog', 'AA_Basketball_PlayerB_Run_RF_Loop': 'run',
  'AA_Basketball_PlayerAB_Jump_Ball_Ready_Pose_Loop': 'jumpball_ready', 'AA_Basketball_PlayerA1_Jump_Ball': 'jumpball_a', 'AA_Basketball_PlayerB1_Jump_Ball': 'jumpball_b', 'AA_Basketball_Official_Tosses': 'official_toss',
  'AA_Basketball_PlayerB_EMO_Celebration_Type01': 'celebrate1', 'AA_Basketball_PlayerB_EMO_Celebration_Type03': 'celebrate3', 'AA_Basketball_PlayerB_EMO_Celebration_Type04': 'celebrate4', 'AA_Basketball_PlayerB_EMO_Tired_Loop': 'tired', 'AA_Basketball_PlayerB_EMO_Angry_Type01': 'angry',
  // mixamo
  'mixamo.com': null,   // resolved per file below
};
const MIXAMO_FILES = { 'Dribble': 'mx_dribble', 'Jump': 'mx_jump', 'Standing Jump': 'mx_standing_jump', 'Jumping Up': 'mx_jump_up', 'Left Strafe Walking': 'mx_strafe_l', 'Right Strafe Walking': 'mx_strafe_r', 'Jog Backward': 'mx_jog_back', 'Throw': 'mx_throw', 'Goalie Throw': 'mx_outlet', 'Goalkeeper Catch': 'mx_catch', 'Victory': 'mx_victory' };
const MAX_DUR = { celebrate1: 3.2, celebrate3: 3.2, celebrate4: 3.2, angry: 3.0, idle_long: 6, jumpball_ready: 2.5, official_toss: 4 };

// ---------- helpers ----------
const findBone = (root, name) => { let f = null; root.traverse(o => { if (!f && o.isBone && o.name === name) f = o; }); return f; };
function loadFbx(path) { const buf = readFileSync(path); return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '/'); }

const out = { fps: FPS, bones: TBONES, clips: {} }; const bin = []; let offset = 0;
function pushI16(arr) { const a = Int16Array.from(arr); bin.push(Buffer.from(a.buffer)); const o = offset; offset += a.byteLength; return o; }
function pushF32(arr) { const a = Float32Array.from(arr); bin.push(Buffer.from(a.buffer)); const o = offset; offset += a.byteLength; return o; }

function retargetClip(root, clip, map, srcBindRot, srcHipsBindY, name, isLoop) {
  const mixer = new THREE.AnimationMixer(root); const action = mixer.clipAction(clip); action.play();
  const maxDur = MAX_DUR[name] || 99; const dur = Math.min(clip.duration, maxDur); const frames = Math.max(2, Math.round(dur * FPS) + (isLoop ? 0 : 1));
  const srcBones = {}; for (const [t, s] of Object.entries(map)) { const names = Array.isArray(s) ? s : [s]; for (const n of names) { const b = findBone(root, n); if (b) { srcBones[t] = b; break; } } }
  const hipsSrc = srcBones.mixamorigHips; const scaleK = tHipsBindY / srcHipsBindY;
  // pass 1: sample hips path + facing to decide the yaw normalisation
  const hipsPos = [], fwd = [];
  const bindInvHips = srcBindRot.mixamorigHips.clone().invert();
  for (let f = 0; f < frames; f++) { mixer.setTime(Math.min(f / FPS, clip.duration - 1e-4)); root.updateMatrixWorld(true);
    hipsPos.push(hipsSrc.getWorldPosition(V())); const q = hipsSrc.getWorldQuaternion(new THREE.Quaternion()).multiply(bindInvHips); fwd.push(V(0, 0, 1).applyQuaternion(q)); }
  const travel = V().subVectors(hipsPos[frames - 1], hipsPos[0]); travel.y = 0;
  let yaw;
  if (travel.length() > 60 && !isLoop) yaw = Math.atan2(travel.x, travel.z);                   // moving clips: face the direction of travel
  else { let sx = 0, sz = 0; const n = isLoop ? frames : Math.min(frames, 8); for (let i = 0; i < n; i++) { sx += fwd[i].x; sz += fwd[i].z; } yaw = Math.atan2(sx, sz); }
  const fix = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -yaw);
  // pass 2: rotations + hips
  const quats = new Array(frames); const hipsY = new Float32Array(frames); const path = new Float32Array(frames * 2); const handY = new Float32Array(frames); const handF = new Float32Array(frames);
  const tWorld = {}; const p0 = hipsPos[0].clone().applyQuaternion(fix);
  for (let f = 0; f < frames; f++) {
    mixer.setTime(Math.min(f / FPS, clip.duration - 1e-4)); root.updateMatrixWorld(true);
    const row = new Int16Array(TBONES.length * 4);
    for (let bi = 0; bi < TBONES.length; bi++) {
      const tn = TBONES[bi]; const sb = srcBones[tn];
      let world;
      if (sb) { const sq = sb.getWorldQuaternion(new THREE.Quaternion()); world = fix.clone().multiply(sq).multiply(srcBindRot[tn].clone().invert()).multiply(tBindRot[tn]); }
      else { world = tWorld[tParent[tn]] ? tWorld[tParent[tn]].clone().multiply(tBindRot[tParent[tn]].clone().invert()).multiply(tBindRot[tn]) : tBindRot[tn].clone(); }
      tWorld[tn] = world;
      const parent = tParent[tn]; const local = parent && tWorld[parent] ? tWorld[parent].clone().invert().multiply(world) : world.clone();   // Hips: parent is the armature (no rotation)
      local.normalize(); row.set([local.x, local.y, local.z, local.w].map(v => Math.round(v * 32767)), bi * 4);
    }
    quats[f] = row;
    const hp = hipsPos[f].clone().applyQuaternion(fix);
    hipsY[f] = tHipsLocal.y + (hipsPos[f].y - srcHipsBindY) * scaleK;              // cm in armature space
    path[f * 2] = (hp.x - p0.x) * scaleK / 30.48; path[f * 2 + 1] = (hp.z - p0.z) * scaleK / 30.48;   // feet, yaw-normalised, from the start point
    const rh = srcBones.mixamorigRightHand ? srcBones.mixamorigRightHand.getWorldPosition(V()) : hipsPos[f], lh = srcBones.mixamorigLeftHand ? srcBones.mixamorigLeftHand.getWorldPosition(V()) : hipsPos[f];
    handY[f] = Math.max(rh.y, lh.y) - hipsPos[f].y;                                 // hand height above the hips (cm)
    const hf = rh.clone().sub(hipsPos[f]).applyQuaternion(fix); handF[f] = hf.z;    // right hand forward reach
  }
  const argmax = a => { let m = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i; return m; };
  const argmin = a => { let m = 0; for (let i = 1; i < a.length; i++) if (a[i] < a[m]) m = i; return m; };
  const hy = Array.from(hipsY); const hipsMinF = argmin(hy), hipsMaxF = argmax(hy);
  const q16 = new Int16Array(frames * TBONES.length * 4); quats.forEach((r, f) => q16.set(r, f * TBONES.length * 4));
  const entry = { frames, dur: (frames - (isLoop ? 0 : 1)) / FPS, loop: isLoop, q: pushI16(q16), hipsY: pushF32(hipsY), path: pushF32(path),
    handPeak: argmax(Array.from(handY)) / FPS, reach: argmax(Array.from(handF)) / FPS, hipsMin: hipsMinF / FPS, hipsMax: hipsMaxF / FPS, jump: +((hy[hipsMaxF] - hy[0]) / 30.48).toFixed(2),
    travel: +Math.hypot(path[(frames - 1) * 2], path[(frames - 1) * 2 + 1]).toFixed(2), yaw: +yaw.toFixed(2) };
  out.clips[name] = entry; mixer.uncacheRoot(root);
  console.log(`${name.padEnd(18)} src=${clip.name.slice(0, 44).padEnd(44)} ${entry.dur.toFixed(2)}s loop=${isLoop ? 1 : 0} jump=${entry.jump}ft travel=${entry.travel}ft handPeak=${entry.handPeak.toFixed(2)} hipsMax=${entry.hipsMax.toFixed(2)}`);
}

// ---------- Animo files ----------
// The dunk file's skin binds the Biped rig in a T-pose; the 167-clip file binds it arms-down. Same rig, so the
// T-pose bind is the reference for both (the retarget needs both rigs' reference poses to be the same pose).
let bipedBindRot = null, bipedHipsBindY = 0;
for (const file of ['AA_Dunk.fbx', 'AA_Basic_Basketball_Movement.fbx']) {
  const g = loadFbx(join(CLIPS_DIR, file)); g.updateMatrixWorld(true);
  if (!bipedBindRot) {
    let sskin = null; g.traverse(o => { if (o.isSkinnedMesh && !sskin) sskin = o; });
    const bindByName = {}; sskin.skeleton.bones.forEach((b, i) => { if (!bindByName[b.name]) bindByName[b.name] = new THREE.Matrix4().copy(sskin.skeleton.boneInverses[i]).invert(); });
    bipedBindRot = {}; for (const [t, s] of Object.entries(BIPED)) { const names = Array.isArray(s) ? s : [s]; for (const n of names) { if (bindByName[n]) { bipedBindRot[t] = rotOf(bindByName[n]); break; } } }
    bipedHipsBindY = V().setFromMatrixPosition(bindByName['RobotBip01_Pelvis']).y;
    const ua = V().setFromMatrixPosition(bindByName['RobotBip01_L_UpperArm']), fa = V().setFromMatrixPosition(bindByName['RobotBip01_L_Forearm']);
    console.log('biped reference bind: L arm dir', V().subVectors(fa, ua).normalize().toArray().map(v => v.toFixed(2)).join(','), 'hips y', bipedHipsBindY.toFixed(1));
  }
  // Spine3 exists only in the big file; its reference rotation is Spine2's (same chain, T-pose)
  for (const clip of g.animations) { const name = PICK[clip.name]; if (!name) continue; retargetClip(g, clip, BIPED, bipedBindRot, bipedHipsBindY, name, /_Loop$/.test(clip.name)); }
}
// ---------- Mixamo files ----------
for (const [file, name] of Object.entries(MIXAMO_FILES)) {
  const g = loadFbx(join(CLIPS_DIR, `${file}.fbx`)); g.updateMatrixWorld(true);
  const srcBindRot = {}; for (const tn of TBONES) { const b = findBone(g, tn); srcBindRot[tn] = b ? b.getWorldQuaternion(new THREE.Quaternion()).normalize() : new THREE.Quaternion(); }
  const srcHipsBindY = findBone(g, 'mixamorigHips').getWorldPosition(V()).y;
  const loop = /dribble|strafe|jog/i.test(file);
  retargetClip(g, g.animations[0], MIXAMO, srcBindRot, srcHipsBindY, name, loop);
}
writeFileSync(join(OUT, 'clips.bin'), Buffer.concat(bin));
writeFileSync(join(OUT, 'clips.json'), JSON.stringify(out));
console.log('clips', Object.keys(out.clips).length, 'bin bytes', offset);
