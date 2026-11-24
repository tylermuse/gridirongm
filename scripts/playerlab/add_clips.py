"""Add captured football clips to the packaged player (public/chase-cam/player-mh2.js).

Sources are the raw retarget files written by the private retarget step (FBX capture -> this rig, 30 fps):
`$PLAYERLAB_DIR/mocaplab/raw/<capture>.json` with per-bone local quaternions (`tracks`), the hips' local position per
frame (`frames[i].hip`, cm) and every bone's world matrix (`frames[i].bones`). They are licensed captures and are not committed.

What it bakes (see CLIPS):
- football_throw_b..e: four more throws, cut and turned to match football_throw exactly: 1.6 s long, the hand at top speed
  0.70 s in, the ball leaving along the model's forward axis. The step into the throw is shortened to about what
  football_throw travels, because the sim plays a throw on a fixed root.
- A clip with 't0'/'t1' in place of 'release' is copied as it is, root travel kept.

Tried and left out (Nov 2026): the same pack's quarterback dropback (a straight backpedal; it slid the feet as much as the
sim's own backpedal and held the ball away from the body) and its "zig zag run" (a rounded turn at constant speed, not a cut).

Run it after packaging player-mh2.js (player.py rebuilds the file without these clips). Running it twice is safe: the
second run removes what the first one added before adding it again. Bump SIM_BUILD afterwards.
"""
import base64, json, math, os, re, struct, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LAB = os.environ.get('PLAYERLAB_DIR', os.path.join(REPO, '..', 'gridirongm-playerlab'))
RAW = os.path.join(LAB, 'mocaplab', 'raw')
TARGET = os.path.join(REPO, 'public', 'chase-cam', 'player-mh2.js')
FPS = 30
BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'LeftEye', 'RightEye', 'LeftShoulder', 'LeftArm', 'LeftForeArm',
         'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToe_End',
         'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToe_End']
THROW_LEAD, THROW_LEN, THROW_STEP_CM = 0.70, 1.60, 36.0   # football_throw: hand at top speed 0.70 s in; its hips travel about a third of a metre
CLIPS = [
    {'name': 'football_throw_b', 'src': 'qb-hike-and-throw-the-ball-1-celebrates-catch', 'release': 8.33},
    {'name': 'football_throw_c', 'src': 'qb-practice-throwing', 'release': 19.37},
    {'name': 'football_throw_d', 'src': 'qb-practice-throwing-2', 'release': 8.50},
    {'name': 'football_throw_e', 'src': 'throw-001', 'release': 8.83},
]


def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz]


def build(spec):
    """-> (times, {bone: flat quats}, flat hips positions) for one clip."""
    raw = json.load(open(os.path.join(RAW, spec['src'] + '.json'))); F = raw['frames']; yaw = 0.0
    if 'release' in spec:
        r = round(spec['release'] * FPS)
        hand = lambda i: (F[i]['bones']['RightHand'][12], F[i]['bones']['RightHand'][14])
        (x0, z0), (x1, z1) = hand(r - 2), hand(r + 2)
        yaw = -math.atan2(x1 - x0, z1 - z0)                       # turn the capture so the hand's path at release runs along +z
        i0 = r - round(THROW_LEAD * FPS); i1 = i0 + round(THROW_LEN * FPS)
    else:
        i0, i1 = round(spec['t0'] * FPS), round(spec['t1'] * FPS)
    if i0 < 0 or i1 >= len(F): raise SystemExit(f"{spec['name']}: window {i0}-{i1} is outside the capture ({len(F)} frames)")
    qy = [0.0, math.sin(yaw / 2), 0.0, math.cos(yaw / 2)]; c, s = math.cos(yaw), math.sin(yaw)
    times = [round((i - i0) / FPS, 6) for i in range(i0, i1 + 1)]
    tracks = {}
    for b in BONES:
        src = raw['tracks'][b]; out = []
        for i in range(i0, i1 + 1):
            q = src[i * 4:i * 4 + 4]
            out += qmul(qy, q) if b == 'Hips' else q
        tracks[b] = out
    hx0, _, hz0 = F[i0]['hip']; pts = []
    for i in range(i0, i1 + 1):
        x, y, z = F[i]['hip']; x -= hx0; z -= hz0
        pts.append([c * x + s * z, y, -s * x + c * z])
    if 'release' in spec:                                           # shorten the step into the throw (see the module docstring)
        far = max(math.hypot(p[0], p[2]) for p in pts); k = min(1.0, THROW_STEP_CM / far) if far else 1.0
        for p in pts: p[0] *= k; p[2] *= k
    hip = [v for p in pts for v in p]
    info = f"{len(times)} frames, {times[-1]:.2f} s, turned {math.degrees(yaw):.0f} deg, hips end {pts[-1][0]:.0f},{pts[-1][2]:.0f} cm"
    return times, tracks, hip, info


def main():
    js = open(TARGET).read()
    m = re.search(r'(PLAYER_GLB_B64\s*=\s*")([A-Za-z0-9+/=]+)(")', js)
    glb = base64.b64decode(m.group(2))
    jlen = struct.unpack('<I', glb[12:16])[0]; g = json.loads(glb[20:20 + jlen])
    blen = struct.unpack('<I', glb[20 + jlen:24 + jlen])[0]; binary = bytearray(glb[28 + jlen:28 + jlen + blen])
    mark = g.setdefault('extras', {}).get('addClips')
    if mark:                                                        # undo an earlier run
        del g['accessors'][mark['accessors']:]; del g['bufferViews'][mark['bufferViews']:]; del g['animations'][mark['animations']:]; del binary[mark['bin']:]
    g['extras']['addClips'] = {'accessors': len(g['accessors']), 'bufferViews': len(g['bufferViews']), 'animations': len(g['animations']), 'bin': len(binary)}
    node = {n.get('name', '').replace('mixamorig:', ''): i for i, n in enumerate(g['nodes']) if n.get('name', '').startswith('mixamorig:')}
    have = {a['name'] for a in g['animations']}

    def accessor(values, kind):
        while len(binary) % 4: binary.append(0)
        g['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(values) * 4})
        binary.extend(struct.pack(f'<{len(values)}f', *values))
        width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[kind]; a = {'bufferView': len(g['bufferViews']) - 1, 'componentType': 5126, 'count': len(values) // width, 'type': kind}
        if kind == 'SCALAR': a['min'] = [min(values)]; a['max'] = [max(values)]
        g['accessors'].append(a); return len(g['accessors']) - 1

    for spec in CLIPS:
        if spec['name'] in have: raise SystemExit(f"{spec['name']} is already in the player and was not added by this script")
        times, tracks, hip, info = build(spec)
        t = accessor(times, 'SCALAR'); samplers, channels = [], []
        for b in BONES:
            samplers.append({'input': t, 'output': accessor(tracks[b], 'VEC4'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': node[b], 'path': 'rotation'}})
        samplers.append({'input': t, 'output': accessor(hip, 'VEC3'), 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': node['Hips'], 'path': 'translation'}})
        g['animations'].append({'name': spec['name'], 'samplers': samplers, 'channels': channels})
        print(f"{spec['name']:20s} {info}")
    while len(binary) % 4: binary.append(0)
    g['buffers'][0]['byteLength'] = len(binary)
    j = json.dumps(g, separators=(',', ':')).encode(); j += b' ' * (-len(j) % 4)
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(j) + 8 + len(binary)) + struct.pack('<I', len(j)) + b'JSON' + j + struct.pack('<I', len(binary)) + b'BIN\x00' + bytes(binary)
    js = js[:m.start(2)] + base64.b64encode(out).decode() + js[m.end(2):]
    open(TARGET, 'w').write(js)
    print(f"player-mh2.js: {len(g['animations'])} clips, GLB {len(glb) / 1e6:.2f} -> {len(out) / 1e6:.2f} MB")


if __name__ == '__main__':
    main()
