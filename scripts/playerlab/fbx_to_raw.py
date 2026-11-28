"""FBX capture -> this rig, 30 fps: writes the raw retarget files that add_clips.py reads.

    python3 fbx_to_raw.py <folder of .fbx> [name ...]

Output: `$PLAYERLAB_DIR/mocaplab/raw/<name>.json` (name = the file name in lower case with dashes): per-bone local
quaternions for the sim's skeleton (`tracks`), the hips' local position per frame in cm (`frames[i].hip`) and every bone's
world matrix (`frames[i].bones`, column-major, armature space). Captures are licensed and are not committed.

How: a headless Chrome page (fbx_dump.html) reads each file with three.js' FBXLoader and samples every bone's local
rotation. The captures are on the Mixamo "Y Bot", z up; the sim's player is a Mixamo rig too, with other rest rotations, so
each bone needs one fixed rotation on either side: target = A * source * B. Those pairs are in fbx_fit.json. They were fitted
(Nov 2026) to seven clips already in player-fp27.js whose source takes are in the pack, and reproduce them and two held-out
clips to about 0.05 degrees per joint. The right toe pair comes from the four extra throws instead (the baked clips treat that toe differently). Hips: target = (-90 deg about x) * source;
position x,y,z = HX*sx, HY*sz, -HX*sy (see HX, HY below).

Needs: playwright, numpy, Google Chrome, and three.js r160 with its examples:
    cd $PLAYERLAB_DIR/mocaplab && npm install three@0.160.0
"""
import json, os, socket, subprocess, sys, time, shutil
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
LAB = os.environ.get('PLAYERLAB_DIR', os.path.join(REPO, '..', 'gridirongm-playerlab')); MOCAP = os.path.join(LAB, 'mocaplab'); RAW = os.path.join(MOCAP, 'raw')
FPS = 30; HX, HY = 1.0437, 1.0978   # hips travel and height: the baked fp27 clips use 1.061 and 1.116 at its 113.26 cm hips; add_clips.py writes into player-mh2.js (111.41 cm) and the sim rescales by hip height for fp27
BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'LeftEye', 'RightEye', 'LeftShoulder', 'LeftArm', 'LeftForeArm',
         'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToe_End',
         'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToe_End']
PARENT = {'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck', 'HeadTop_End': 'Head', 'LeftEye': 'Head', 'RightEye': 'Head',
          'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm', 'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder',
          'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm', 'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', 'LeftToeBase': 'LeftFoot',
          'LeftToe_End': 'LeftToeBase', 'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', 'RightToeBase': 'RightFoot', 'RightToe_End': 'RightToeBase'}


def qm(a, b):
    ax, ay, az, aw = a[..., 0], a[..., 1], a[..., 2], a[..., 3]; bx, by, bz, bw = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], -1)


def rot(q):
    x, y, z, w = q.T; n = len(q); m = np.zeros((n, 4, 4)); m[:, 3, 3] = 1
    m[:, 0, 0] = 1 - 2 * (y * y + z * z); m[:, 0, 1] = 2 * (x * y - z * w); m[:, 0, 2] = 2 * (x * z + y * w)
    m[:, 1, 0] = 2 * (x * y + z * w); m[:, 1, 1] = 1 - 2 * (x * x + z * z); m[:, 1, 2] = 2 * (y * z - x * w)
    m[:, 2, 0] = 2 * (x * z - y * w); m[:, 2, 1] = 2 * (y * z + x * w); m[:, 2, 2] = 1 - 2 * (x * x + y * y)
    return m


def convert(src, target, fit):
    """one dumped capture -> the raw dict"""
    n = src['n']; L = {}
    for b in BONES:
        if b not in src['tracks'] or not src['tracks'][b]:                 # the Y Bot has no eye bones: keep the rest rotation
            L[b] = np.tile(np.array(target[b]['l'], float), (n, 1)); continue
        s = np.array(src['tracks'][b], float).reshape(-1, 4)
        if b == 'Hips': q = qm(np.array([0.70710678, 0, 0, -0.70710678]), s)
        else: q = qm(qm(np.array(fit[b][0]), s), np.array(fit[b][1]))
        q /= np.linalg.norm(q, axis=1, keepdims=True)
        for i in range(1, n):                                                # one sign all the way through, for interpolation
            if (q[i] * q[i - 1]).sum() < 0: q[i] = -q[i]
        L[b] = q
    h = np.array(src['hip'], float); hip = np.stack([HX * h[:, 0], HY * h[:, 2], -HX * h[:, 1]], 1)
    W = {}
    for b in BONES:
        m = rot(L[b]); m[:, :3, 3] = hip if b == 'Hips' else np.array(target[b]['p'], float)
        W[b] = m if b == 'Hips' else W[PARENT[b]] @ m
    frames = [{'hip': [round(float(v), 3) for v in hip[i]], 'bones': {b: [round(float(v), 4) for v in W[b][i].T.reshape(-1)] for b in BONES}} for i in range(n)]
    return {'fps': FPS, 'source': src['file'], 'seconds': round(src['dur'], 3), 'tracks': {b: [round(float(v), 6) for v in L[b].reshape(-1)] for b in BONES}, 'frames': frames}


def main():
    from playwright.sync_api import sync_playwright
    folder = os.path.abspath(sys.argv[1]); want = set(sys.argv[2:])
    if not os.path.exists(os.path.join(MOCAP, 'node_modules', 'three', 'examples', 'jsm', 'loaders', 'FBXLoader.js')): sys.exit('three.js r160 is missing: see the top of this file')
    os.makedirs(RAW, exist_ok=True); shutil.copy(os.path.join(HERE, 'fbx_dump.html'), os.path.join(MOCAP, 'fbx_dump.html'))
    js = open(os.path.join(REPO, 'public', 'chase-cam', 'player-fp27.js')).read(); import re, base64
    open(os.path.join(MOCAP, 'fp27.glb'), 'wb').write(base64.b64decode(re.search(r'PLAYER_GLB_B64\s*=\s*"([^"]+)"', js).group(1)))
    link = os.path.join(MOCAP, 'pack')
    if os.path.islink(link): os.unlink(link)
    os.symlink(folder, link)
    fit = json.load(open(os.path.join(HERE, 'fbx_fit.json')))
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', MOCAP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox']); pg = b.new_page()
            pg.goto(f'http://127.0.0.1:{port}/fbx_dump.html'); pg.wait_for_function('window.ready', timeout=30000)
            target = pg.evaluate('tgt()')['rest']
            for f in sorted(os.listdir(folder)):
                name = f[:-4].lower().replace(' ', '-')
                if not f.lower().endswith('.fbx') or (want and name not in want): continue
                raw = convert(pg.evaluate('f=>src(f)', f), target, fit)
                json.dump(raw, open(os.path.join(RAW, name + '.json'), 'w'), separators=(',', ':'))
                print(f"{name:60s} {raw['seconds']:6.2f} s  {len(raw['frames'])} frames")
            b.close()
    finally: srv.terminate()


if __name__ == '__main__':
    main()
