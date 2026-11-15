"""Player mh2: MakeHuman body (CC0) on the shipped skeleton, with
   - eyes, eyebrows, eyelashes (MakeHuman proxies, CC0)
   - jersey that drapes over generated shoulder pads (convex envelope), tucked into the pants
   - painted jersey / pants textures (white base + navy accents, keyed to team colours by the sim) with baked fold shading and normal maps
   - hands as their own part (gloves are a material in the sim), an optional forearm sleeve
   - three body types as morph targets on one topology: skill (base), line [0], power [1]; plus a face morph [2]
   - helmet and cleats refitted from the CC BY player; all its clips carried over
"""
import sys, os, json, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh, glb, rig, gear, proxy
import numpy as np
np.seterr(all='ignore')
OUT = os.path.join(mh.LAB, 'out')
ss = gear.ss
SHAPES = {'skill': dict(muscle=.95, weight=.55, proportions=.85),
          'line':  dict(muscle=.72, weight=1.0, proportions=.55),
          'power': dict(muscle=1.0, weight=.78, proportions=.8)}

# ---------------------------------------------------------------- geometry helpers
def quad_mesh(obj, Q, QT, keep, v, n):
    key = {}; src = []; uv = []; tris = []
    for q, qt in zip(Q[keep], QT[keep]):
        i = []
        for a, b in zip(q, qt):
            if (a, b) not in key: key[(a, b)] = len(src); src.append(a); uv.append(obj['vt'][b])
            i.append(key[(a, b)])
        tris += [(i[0], i[1], i[2]), (i[0], i[2], i[3])]
    src = np.array(src); uv = np.array(uv, float); uv[:, 1] = 1 - uv[:, 1]
    return dict(pos=v[src], nrm=n[src], uv=uv, tris=np.array(tris), src=src, nouter=len(tris))

def hull2(pts):
    pts = sorted(map(tuple, pts))
    if len(pts) < 3: return np.array(pts)
    cr = lambda o, a, b: (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo = []; hi = []
    for p in pts:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cr(hi[-2], hi[-1], p) <= 0: hi.pop()
        hi.append(p)
    return np.array(lo[:-1] + hi[:-1])

def ray_hull(H, ang):
    """radius of a convex polygon (containing the origin) along each angle"""
    d = np.stack([np.sin(ang), np.cos(ang)], 1); r = np.full(len(ang), np.inf)
    for k in range(len(H)):
        a = H[k]; b = H[(k+1) % len(H)]; e = b - a
        den = d[:, 0]*e[1] - d[:, 1]*e[0]
        t = (a[0]*e[1] - a[1]*e[0]) / np.where(np.abs(den) < 1e-12, np.nan, den)
        s = (a[0]*d[:, 1] - a[1]*d[:, 0]) / np.where(np.abs(den) < 1e-12, np.nan, den)
        ok = (t > 0) & (s >= -1e-6) & (s <= 1+1e-6)
        r = np.where(ok & (t < r), t, r)
    return r

def concave_env(y, R):
    """upper concave envelope of R(y) sampled at increasing y"""
    pts = [(a, b) for a, b in zip(y, R) if np.isfinite(b)]
    if len(pts) < 2: return R
    H = []
    for p in pts:
        while len(H) >= 2 and ((H[-1][0]-H[-2][0])*(p[1]-H[-2][1]) - (H[-1][1]-H[-2][1])*(p[0]-H[-2][0])) >= 0: H.pop()
        H.append(p)
    H = np.array(H); return np.interp(y, H[:, 0], H[:, 1])

def drape(outer, C, G, J, belt):
    """Cloth spans hollows: per height slice the torso jersey goes out to the convex hull of the slice (bridging chest/back hollows between the pads),
       and per direction it hangs in a straight line from the pad edge down to the tuck (no clinging to the abs). Sides under the arms move less."""
    m = G['jersey'] & G['torso']; idx = np.where(m)[0]; P = outer[idx]
    zc = (J['Spine2'][2] + J['Hips'][2]) / 2
    th = np.arctan2(P[:, 0], P[:, 2]-zc); r = np.hypot(P[:, 0], P[:, 2]-zc); y = P[:, 1]
    NT = 96; dy = .015; y0 = y.min(); NY = int((y.max()-y0)/dy) + 2
    ti = ((th + np.pi) / (2*np.pi) * NT).astype(int) % NT; yi = ((y - y0) / dy).astype(int)
    Rg = np.full((NT, NY), np.nan); np.fmax.at(Rg, (ti, yi), r)
    ang = (np.arange(NT) + .5) / NT * 2*np.pi - np.pi
    Hg = np.full_like(Rg, np.nan)
    for j in range(NY):
        ok = np.isfinite(Rg[:, j])
        if ok.sum() < 6: continue
        pts = np.stack([Rg[ok, j]*np.sin(ang[ok]), Rg[ok, j]*np.cos(ang[ok])], 1)
        Hg[:, j] = ray_hull(hull2(pts), ang)
    yy = y0 + (np.arange(NY) + .5) * dy
    Vg = np.full_like(Rg, np.nan)
    for i in range(NT):
        col = np.where(np.isfinite(Hg[i]), Hg[i], np.nan)
        if np.isfinite(col).sum() < 3: continue
        pk = np.nanargmax(col); env = concave_env(yy[:pk+1], col[:pk+1])
        Vg[i, :pk+1] = env; Vg[i, pk+1:] = col[pk+1:]
    tgt = np.where(np.isfinite(Vg[ti, yi]), Vg[ti, yi], r)
    side = np.abs(np.sin(th)); w = 1 - .75*ss(.55, .9, side)          # under the arms: hardly any bridging (arms pass there)
    w *= ss(belt+.005, belt+.075, y)                                   # tucked: tight at the waist
    push = np.clip(tgt - r, 0, .06) * w
    out = outer.copy(); rn = r + push
    out[idx, 0] = rn*np.sin(th); out[idx, 2] = zc + rn*np.cos(th)
    gap = np.zeros(len(outer)); gap[idx] = push
    return out, gap, (th, idx, zc)

# ---------------------------------------------------------------- per-shape build
def shape_parts(params, base=None):
    R = rig.build(**params); f = R['f']; C = gear.ctx(R); G = gear.regions(R, C); v = C['v']; n = C['n']; J = R['J']
    if base is not None:
        for k in ('jersey', 'pants', 'socks', 'skin', 'arm', 'leg', 'torso', 'hands', 'sleeve', 'ring'): G[k] = base['G'][k]
        G['sleeve_base'] = v.copy(); m1 = base['G']['sleeve']; G['sleeve_base'][m1] = v[m1] + (base['G']['sleeve_base'][m1] - base['C']['v'][m1])
    else:
        hw = C['wb']('Hand') > .5
        G['hands'] = hw
        G['skin'] = G['skin'] & ~hw | (C['wb']('Neck', 'Head') > .25)
        G['sleeve'] = G['arm'] & (G['ta'] > .55) & (G['ta'] < .97) & ~hw
        sb = v.copy(); axA = np.zeros((len(v), 3))
        for s_ in ('Left', 'Right'): mm = C['wb'](s_+'Arm', s_+'ForeArm', s_+'Hand') > .5; axA[mm] = J[s_+'Hand'] - J[s_+'Arm']
        lo, hi = .6, .92; m1 = G['sleeve'] & (G['ta'] < lo); m2 = G['sleeve'] & (G['ta'] > hi)
        sb[m1] += (lo - G['ta'][m1])[:, None]*axA[m1]; sb[m2] -= (G['ta'][m2] - hi)[:, None]*axA[m2]; G['sleeve_base'] = sb   # straight cuffs
        # jersey and pants meet edge to edge on one ring of body vertices at the belt (no overlap: layered cloth under linear skinning
        # crosses itself when he crouches). Split the torso by quad: above the line -> jersey, below -> pants.
        Q0 = C['Q']; yb = G['belt'] + .015; cyq = v[Q0][:, :, 1].mean(1); tq = G['torso'][Q0].all(1)
        jq = G['jersey'][Q0].all(1) & ~(tq & (cyq <= yb)); pq = (G['pants'][Q0].all(1) | (tq & (cyq <= yb) & (G['jersey'] | G['pants'])[Q0].all(1))) & ~(tq & (cyq > yb))
        jv = np.zeros(len(v), bool); jv[Q0[jq].ravel()] = True; pv = np.zeros(len(v), bool); pv[Q0[pq].ravel()] = True
        G['jersey'] = jv; G['pants'] = pv; G['ring'] = jv & pv
    belt = G['belt']; Q = C['Q']; QT = C['QT']; obj = R['obj']; parts = {}
    # skin: head/neck/forearms (hands separate)
    sk = G['skin'][Q].any(1) & ~G['hands'][Q].all(1)
    parts['MH_SKIN'] = quad_mesh(obj, Q, QT, sk, v, n)
    parts['MH_HANDS'] = quad_mesh(obj, Q, QT, G['hands'][Q].any(1), v, n)
    # jersey: pads -> drape -> relax
    dj = gear.pad_field(R, C, G)
    jb = G['jersey_base'].copy(); jb[G['torso']] = v[G['torso']]          # the torso is no longer cut at a hem: the ring is the edge
    outer = jb + n*dj[:, None]
    outer, gap, drape_info = drape(outer, C, G, J, belt)
    ring = G['ring']; ringp = v + n*.014
    outer[ring] = ringp[ring]
    for _ in range(2):
        outer = np.stack([gear.smooth(outer[:, k], Q, G['jersey'], it=2) for k in range(3)], 1); outer[ring] = ringp[ring]
    outer[~ring & G['jersey']] += n[~ring & G['jersey']]*.002
    parts['MH_JERSEY'] = gear.shell(R, C, G['jersey'], None, base=jb, outer=outer)
    # pants: pads + a waistband that sits over the tucked jersey
    dp = gear.pants_field(C, G); y = v[:, 1]
    dp = np.where(G['torso'] & (y > belt - .05), np.maximum(dp, .014*ss(belt-.05, belt-.02, y) + dp*(1-ss(belt-.05, belt-.02, y))), dp)
    pb = G['pants_base'].copy(); pb[G['torso']] = v[G['torso']]
    po = pb + n*dp[:, None]; po[ring] = ringp[ring]
    po = np.stack([gear.smooth(po[:, k], Q, G['pants'], it=3) for k in range(3)], 1); po[ring] = ringp[ring]
    po[~ring & G['pants']] += n[~ring & G['pants']]*.002
    parts['MH_PANTS'] = gear.shell(R, C, G['pants'], None, base=pb, outer=po)
    parts['MH_SOCKS'] = gear.shell(R, C, G['socks'], np.full(len(v), .0035), base=G['socks_base'])
    parts['MH_ARMSLEEVE'] = gear.shell(R, C, G['sleeve'], np.full(len(v), .0028), rim=.0008, base=G['sleeve_base'])
    # face proxies
    for nm, rel in (('MH_EYES', 'eyes/high-poly/high-poly.mhclo'), ('MH_BROWS', 'eyebrows/eyebrow001/eyebrow001.mhclo'), ('MH_LASHES', 'eyelashes/eyelashes02/eyelashes02.mhclo')):
        parts[nm] = proxy.mesh(rel, R['vdm'], v, R['W'])
    for nm, p in parts.items():
        if 'Wfull' in p:
            Wf = p.pop('Wfull'); col = np.array([f.J(k) for k in R['names']]); i = np.argsort(-Wf, axis=1)[:, :4]; w = np.take_along_axis(Wf, i, 1); w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
            p['jn'] = col[i].astype('u2'); p['jw'] = w.astype('f4')
        else:
            p['jn'], p['jw'] = rig.skin_attrs(R, p['src'])
    # pads ride the rib cage, not the upper arm
    pj = parts['MH_JERSEY']; k = ss(.014, .034, dj[pj['src']]); sideJ = np.where(v[pj['src'], 0] > 0, f.J('LeftShoulder'), f.J('RightShoulder'))
    Wf = np.zeros((len(k), len(f.joints)))
    np.add.at(Wf, (np.repeat(np.arange(len(k)), 4), pj['jn'].reshape(-1)), (pj['jw']*(1-k[:, None])).reshape(-1))
    Wf[:, f.J('Spine2')] += k*.7; Wf[np.arange(len(k)), sideJ] += k*.3
    i = np.argsort(-Wf, axis=1)[:, :4]; w = np.take_along_axis(Wf, i, 1); pj['jn'] = i.astype('u2'); pj['jw'] = (w/w.sum(1, keepdims=True)).astype('f4')
    # helmet + cleats from the CC BY model
    P = lambda nm: f.bind[f.J(nm)][:3, 3]
    hd = f.mesh('Bodymat'); hm = (hd['JOINTS_0'][np.arange(len(hd['JOINTS_0'])), hd['WEIGHTS_0'].argmax(1)] == f.J('Head')) & (hd['POSITION'][:, 1] > P('Head')[1]+.09); sh = hd['POSITION'][hm]
    th_ = v[(C['wb']('Head') > .9) & (v[:, 1] > J['Head'][1]+.09)]
    box = lambda a: (np.array([(a[:, 0].max()+a[:, 0].min())/2, a[:, 1].max(), (a[:, 2].max()+a[:, 2].min())/2]), np.array([a[:, 0].max()-a[:, 0].min(), a[:, 2].max()-a[:, 2].min()]))
    (cs, ds), (ct, dt) = box(sh), box(th_); kh = float(np.max(dt/ds))*1.03
    for nm in ('Mat.3', 'mask', 'frosted_glass', 'plain', 'trim'): parts[nm] = gear.refit(f, nm, ['Head'], lambda b: cs, lambda b: ct+[0, .004, 0], kh, R)
    kf = max(np.linalg.norm(J['LeftToeBase']-J['LeftFoot'])/np.linalg.norm(P('LeftToeBase')-P('LeftFoot')), 1.0)*1.04; ank = {}
    for s_ in ('Left', 'Right'): ank[s_+'Foot'] = ank[s_+'ToeBase'] = (P(s_+'Foot'), J[s_+'Foot'])
    parts['sepatu_key.obj'] = gear.refit(f, 'sepatu_key.obj', list(ank), lambda b: ank[b][0], lambda b: ank[b][1], kf, R)
    return dict(R=R, C=C, G=G, parts=parts, dj=dj, gap=gap, drape=drape_info, belt=belt)

# ---------------------------------------------------------------- texture painting (UV-space rasterisation of per-vertex fields)
def raster(uv, tris, F, N):
    """uv (n,2) in 0..1 (glTF orientation), tris (m,3), F (n,k) fields -> (N,N,k) image + coverage mask"""
    img = np.zeros((N, N, F.shape[1]), np.float32); cov = np.zeros((N, N), bool)
    P = uv * N - .5
    for t in tris:
        a, b, c = P[t]; x0 = int(max(0, np.floor(min(a[0], b[0], c[0])))); x1 = int(min(N-1, np.ceil(max(a[0], b[0], c[0]))))
        y0 = int(max(0, np.floor(min(a[1], b[1], c[1])))); y1 = int(min(N-1, np.ceil(max(a[1], b[1], c[1]))))
        if x1 < x0 or y1 < y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1+1), np.arange(y0, y1+1))
        d = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1])
        if abs(d) < 1e-12: continue
        l0 = ((b[1]-c[1])*(gx-c[0]) + (c[0]-b[0])*(gy-c[1]))/d; l1 = ((c[1]-a[1])*(gx-c[0]) + (a[0]-c[0])*(gy-c[1]))/d; l2 = 1-l0-l1
        e = -1.0/max(abs(d), 1)   # a little dilation so seams do not show a gap
        ins = (l0 >= e) & (l1 >= e) & (l2 >= e)
        if not ins.any(): continue
        val = l0[ins, None]*F[t[0]] + l1[ins, None]*F[t[1]] + l2[ins, None]*F[t[2]]
        img[gy[ins], gx[ins]] = val; cov[gy[ins], gx[ins]] = True
    return img, cov

def dilate(img, cov, it=6):
    img = img.copy(); cov = cov.copy()
    for _ in range(it):
        acc = np.zeros_like(img); cnt = np.zeros(cov.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sc = np.roll(cov, (dy, dx), (0, 1)); si = np.roll(img, (dy, dx), (0, 1)); acc += si*sc[..., None]; cnt += sc
        new = ~cov & (cnt > 0); img[new] = acc[new]/cnt[new, None]; cov |= new
    return img

def normal_from_height(H, strength):
    gy, gx = np.gradient(H); n = np.stack([-gx*strength, -gy*strength, np.ones_like(H)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n*.5+.5)*255).clip(0, 255).astype(np.uint8)

def save_img(arr, path, q=88):
    """write RGB uint8 as PNG via a minimal encoder, then convert with sips"""
    import zlib, struct
    h, w = arr.shape[:2]; raw = b''.join(b'\x00' + arr[y].tobytes() for y in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw, 6)) + ch(b'IEND', b'')
    tmp = path + '.png'; open(tmp, 'wb').write(png)
    if path.endswith('.png'): os.replace(tmp, path); return
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', str(q), tmp, '--out', path], check=True, capture_output=True); os.remove(tmp)

WHITE = np.array([238, 238, 236.]); NAVY = np.array([27, 42, 85.]); UNDER = np.array([52, 52, 54.])
def paint_jersey(S, N=1024):
    p = S['parts']['MH_JERSEY']; C = S['C']; G = S['G']; v = C['v']; J = S['R']['J']; src = p['src']
    th_all = np.zeros(len(v)); th, idx, zc = S['drape']; th_all[idx] = th
    # collar: distance to the neck opening of the jersey
    Q = C['Q']; e = np.r_[Q[:, [0, 1]], Q[:, [1, 2]], Q[:, [2, 3]], Q[:, [3, 0]]]; jm = G['jersey']; nk = C['wb']('Neck', 'Head') > .2
    bnd = np.unique(np.r_[e[jm[e[:, 0]] & ~jm[e[:, 1]] & nk[e[:, 1]], 0], e[jm[e[:, 1]] & ~jm[e[:, 0]] & nk[e[:, 0]], 1]])
    B = v[bnd]; dcol = np.full(len(v), 1.0)
    jj = np.where(jm)[0]
    for k0 in range(0, len(jj), 2000):
        q = jj[k0:k0+2000]; dcol[q] = np.sqrt(((v[q, None, :]-B[None])**2).sum(-1)).min(1)
    neckY = B[B[:, 2] > np.median(B[:, 2])][:, 1].min()          # lowest point of the front collar
    F = np.stack([p['pos'][:, 0], p['pos'][:, 1], p['pos'][:, 2], G['ta'][src]*G['arm'][src], G['arm'][src].astype(float), dcol[src], S['gap'][src], np.cos(th_all[src]), np.sin(th_all[src])], 1)
    img, cov = raster(p['uv'], p['tris'][:p['nouter']], F, N); img = dilate(img, cov, 8)
    x, y, z, ta, arm, dc, gap, ct, st = [img[..., k] for k in range(9)]
    th = np.arctan2(st, ct); belt = S['belt']
    col = np.broadcast_to(WHITE, img.shape[:2]+(3,)).copy()
    front = z > zc
    # V-neck: an undershirt V below the front collar, edged by a 2.2 cm trim band
    vdepth = .075; vx = np.abs(x); inV = front & (arm < .5) & (y > neckY - vdepth + vx*1.25)
    band = (dc < .022) | (front & (arm < .5) & (y > neckY - vdepth - .022 + vx*1.25))
    col[band] = NAVY; col[inV] = UNDER
    # sleeve: two stripes and a cuff
    sl = arm > .5
    for a0, a1 in ((.226, .238), (.25, .3)): col[sl & (ta > a0) & (ta < a1)] = NAVY   # a stripe and the cuff, at the hem: higher up, the sleeve folds under the arm and thin stripes tore
    # folds: vertical drape lines where the cloth hangs off the pads, bunching at the tuck, creases under the arms
    gf = np.clip(gap/.025, 0, 1)
    Hf = gf * np.sin(th*17 + 2.2*np.sin(y*11 + th*3)) * (1-sl)
    tuck = ss(belt+.09, belt+.02, y) * (1-sl)
    Hf += .35*tuck*np.sin(th*23 + 4*np.sin(th*7) + 6*np.sin(y*41 + th*5))
    pit = sl * ss(.12, .02, ta)
    Hf += .25*pit*np.sin(ta*120)
    shade = 1 - .06*(1-(Hf*.5+.5))*np.maximum(gf, tuck) - .05*pit
    col *= shade[..., None]
    save_img(col.clip(0, 255).astype(np.uint8), os.path.join(OUT, 'jersey.jpg'))
    save_img(normal_from_height(Hf, 1.3), os.path.join(OUT, 'jersey_n.jpg'), 92)

def paint_pants(S, N=1024):
    p = S['parts']['MH_PANTS']; C = S['C']; G = S['G']; v = C['v']; J = S['R']['J']; src = p['src']; belt = S['belt']
    out = np.zeros(len(v)); kne = np.zeros(len(v)); back = np.zeros(len(v))
    for s_, sg in (('Left', 1), ('Right', -1)):
        H, K = J[s_+'UpLeg'], J[s_+'Leg']; m = G['leg'] & (np.sign(v[:, 0]) == sg); idx = np.where(m)[0]
        t = np.clip(((v[m]-H)@(K-H))/((K-H)@(K-H)), 0, 1.3)
        yb = np.round(v[m, 1]/.02).astype(int); ub = np.unique(yb); cen = np.array([v[idx[yb == b]].mean(0) for b in ub])   # the leg's own cross-section centres (the joints sit off-centre)
        A = np.c_[np.ones(len(ub)), cen[:, 1]]; cx = np.linalg.lstsq(A, cen[:, 0], rcond=None)[0]; cz = np.linalg.lstsq(A, cen[:, 2], rcond=None)[0]   # ... fitted with one straight line, so the stripe runs straight
        ax = np.stack([cx[0] + cx[1]*v[m, 1], v[m, 1], cz[0] + cz[1]*v[m, 1]], 1)
        d = v[m]-ax; d[:, 1] = 0; d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
        out[m] = np.arctan2(-d[:, 2], d[:, 0]*sg); kne[m] = t; back[m] = -d[:, 2]     # angle from the outer side seam (rad): interpolates cleanly, unlike its cosine
    tor = G['torso']; zc = v[tor, 2].mean(); out[tor] = np.arctan2(-(v[tor, 2]-zc), np.abs(v[tor, 0]))   # hips: the stripe runs up the side seam
    F = np.stack([p['pos'][:, 1], out[src], kne[src], back[src], G['leg'][src].astype(float)], 1)
    img, cov = raster(p['uv'], p['tris'][:p['nouter']], F, N); img = dilate(img, cov, 8)
    y, oc, kn, bk, lg = [img[..., k] for k in range(5)]
    col = np.broadcast_to(WHITE, img.shape[:2]+(3,)).copy()
    ao = np.abs(oc); col[ao < .085] = NAVY; col[(ao > .13) & (ao < .17)] = NAVY       # side stripe: a 2 cm band and a thin pin stripe
    col[np.abs(y-(belt-.026)) < .0025] *= .8                                       # waistband seam (the belt stays pants-coloured: a contrasting belt flickers where the tucked jersey rides up)
    Hf = lg*ss(.12, .0, np.abs(kn-1.02))*np.clip(bk, 0, 1)*np.sin(y*150)   # creases behind the knee
    Hf += ss(.04, .0, np.abs(y-(belt-.03)))*.5*np.sin(oc*40)     # gathered at the belt
    col *= (1 - .05*(1-(Hf*.5+.5)))[..., None]
    save_img(col.clip(0, 255).astype(np.uint8), os.path.join(OUT, 'pants.jpg'))
    save_img(normal_from_height(Hf, 1.6), os.path.join(OUT, 'pants_n.jpg'), 92)

def face_morph(S):
    """African-ancestry face target (head only), for dark-skinned players; the sim drives it as morph [2]"""
    R = S['R']; v = S['C']['v']
    alt = mh.macro_shape(R['obj']['v'], race={'african': 1.0}, **SHAPES['skill']); d_dm = alt - R['vdm']
    k = np.linalg.norm(v[5399]-v[11998]) / np.linalg.norm(R['vdm'][5399]-R['vdm'][11998])
    hw = ss(.4, .9, S['C']['wb']('Head')); dv = d_dm*k*hw[:, None]
    return dv, alt

# ---------------------------------------------------------------- export
MAT = {'MH_SKIN': dict(tex='skin', rough=.58), 'MH_HANDS': dict(tex='skin', rough=.58),
       'MH_JERSEY': dict(tex='jersey', normal='jersey_n', rough=.85), 'MH_PANTS': dict(tex='pants', normal='pants_n', rough=.7),
       'MH_SOCKS': dict(col=[.92, .92, .92], rough=.9), 'MH_ARMSLEEVE': dict(col=[.05, .05, .06], rough=.75),
       'MH_EYES': dict(tex='eye', rough=.12), 'MH_BROWS': dict(tex='brow', rough=.9, mask=True, ds=True), 'MH_LASHES': dict(tex='lash', rough=.9, mask=True, ds=True),
       'sepatu_key.obj': dict(col=[.04, .04, .05], rough=.5), 'Mat.3': dict(col=[.03, .06, .2], rough=.3, metal=.3), 'mask': dict(col=[.75, .75, .78], rough=.4, metal=.5),
       'frosted_glass': dict(col=[.05, .06, .08], rough=.1, metal=.6), 'plain': dict(col=[.85, .85, .85], rough=.6), 'trim': dict(col=[.03, .06, .2], rough=.6)}

def prep_textures():
    x = os.path.join(mh.LAB, 'src/x'); conv = {'eye': ('eyes/materials/brown_eye.png', 'jpeg', 256), 'brow': ('eyebrows/eyebrow001/eyebrow001.png', 'png', 256), 'lash': ('eyelashes/eyelashes02/eyelashes02.png', 'png', 256),
                                               'skin_dark': ('skins/young_african_male/young_darkskinned_male_diffuse.png', 'jpeg', 2048)}
    for k, (rel, fmt, sz) in conv.items():
        o = os.path.join(OUT, k + ('.jpg' if fmt == 'jpeg' else '.png'))
        if not os.path.exists(o): subprocess.run(['sips', '-Z', str(sz), '-s', 'format', fmt] + (['-s', 'formatOptions', '86'] if fmt == 'jpeg' else []) + [os.path.join(x, rel), '--out', o], check=True, capture_output=True)

# Extra captured motion for the motion pass: clips already retargeted to this skeleton (same joint frames as the CC BY player) for the basketball
# court-cam (Animo + Mixamo captures, Tyler's licences). Local rotations per joint at 30 fps; the hips keep their height, travel is stripped (the sim moves the root).
CC_DIR = os.path.join(mh.REPO, 'apps/bs-basketball/public/court-cam')
CC_PICK = {'run': 'cc_run', 'jog': 'cc_jog', 'walk': 'cc_walk', 'idle_long': 'cc_idle_long', 'tired': 'cc_tired', 'def_slide_l': 'cc_slide_l', 'def_slide_r': 'cc_slide_r',
           'def_idle': 'cc_def_idle', 'mx_jog_back': 'cc_back', 'mx_strafe_l': 'cc_strafe_l', 'mx_strafe_r': 'cc_strafe_r', 'boxout': 'cc_boxout', 'celebrate1': 'cc_celebrate1',
           'celebrate3': 'cc_celebrate3', 'mx_victory': 'cc_victory', 'angry': 'cc_angry', 'sidestep': 'cc_sidestep'}
def add_cc_clips(g, R, nid):
    f = R['f']; meta = json.load(open(os.path.join(CC_DIR, 'clips.json'))); B = open(os.path.join(CC_DIR, 'clips.bin'), 'rb').read()
    bones = meta['bones']; nb = len(bones); fps = meta['fps']; speeds = {}
    for src, name in CC_PICK.items():
        c = meta['clips'].get(src)
        if not c: print('missing clip', src); continue
        n = c['frames']; q = np.frombuffer(B, '<i2', n*nb*4, c['q']).reshape(n, nb, 4).astype('f4')/32767.
        hy = np.frombuffer(B, '<f4', n, c['hipsY']); path = np.frombuffer(B, '<f4', n*2, c['path']).reshape(n, 2)
        if c['loop']:   # close the loop: repeat the first frame at the end
            q = np.concatenate([q, q[:1]]); hy = np.concatenate([hy, hy[:1]]); n += 1
        times = (np.arange(n)/fps).astype('f4'); tacc = g.acc(times, 'SCALAR', minmax=True); S = []; C = []
        for bi, bn_ in enumerate(bones):
            k = f.J(bn_.replace('mixamorig', '')); node = nid[f.joints[k]]
            qq = q[:, bi].copy(); qq /= np.linalg.norm(qq, axis=1, keepdims=True)
            for i in range(1, n):   # keep the quaternion hemisphere continuous so the slerp never takes the long way round
                if qq[i] @ qq[i-1] < 0: qq[i] = -qq[i]
            S.append({'input': tacc, 'output': g.acc(qq.astype('f4'), 'VEC4'), 'interpolation': 'LINEAR'}); C.append({'sampler': len(S)-1, 'target': {'node': node, 'path': 'rotation'}})
            if bn_ == 'mixamorigHips':
                hp0 = f.nodes[f.joints[k]].get('translation', [0, 0, 0]); tr = np.zeros((n, 3), 'f4'); tr[:, 0] = hp0[0]; tr[:, 2] = hp0[2]; tr[:, 1] = hy
                S.append({'input': tacc, 'output': g.acc((tr*R['k_h']).astype('f4'), 'VEC3'), 'interpolation': 'LINEAR'}); C.append({'sampler': len(S)-1, 'target': {'node': node, 'path': 'translation'}})
        g.j['animations'].append({'name': name, 'samplers': S, 'channels': C})
        dur = (c['frames'] - (0 if c['loop'] else 1))/fps; speeds[name] = round(float(c['travel'])/3/max(dur, 1e-3), 3)   # ground speed of the capture, yd/s
    return speeds

def export(base, morphs, path, viewer=False):
    R = base['R']; parts = base['parts']; g = glb.GLB(); bn, nid = rig.write_skeleton(g, R, anim=True)
    base['ccSpeeds'] = add_cc_clips(g, R, nid)
    texfile = {'skin': 'skin.jpg', 'jersey': 'jersey.jpg', 'jersey_n': 'jersey_n.jpg', 'pants': 'pants.jpg', 'pants_n': 'pants_n.jpg', 'eye': 'eye.jpg', 'brow': 'brow.png', 'lash': 'lash.png'}
    tex = {}
    def T(name):
        if name not in tex:
            fn = texfile[name]; im = g.image(open(os.path.join(OUT, fn), 'rb').read(), 'image/png' if fn.endswith('.png') else 'image/jpeg')
            g.j.setdefault('textures', []).append({'source': im, 'sampler': 0}); tex[name] = len(g.j['textures'])-1
        return tex[name]
    g.j.update(samplers=[{'magFilter': 9729, 'minFilter': 9987}], materials=[], meshes=[]); roots = [bn]
    for nm, p in parts.items():
        if not len(p['tris']): continue
        m = MAT[nm]; pbr = {'metallicFactor': m.get('metal', 0), 'roughnessFactor': m['rough']}
        if m.get('tex'): pbr['baseColorTexture'] = {'index': T(m['tex'])}
        else: pbr['baseColorFactor'] = (m['col'] if viewer else [1, 1, 1]) + [1]
        mat = {'name': nm, 'pbrMetallicRoughness': pbr, 'doubleSided': bool(m.get('ds'))}
        if m.get('normal'): mat['normalTexture'] = {'index': T(m['normal'])}
        if m.get('mask'): mat['alphaMode'] = 'MASK'; mat['alphaCutoff'] = .45
        g.j['materials'].append(mat)
        at = {'POSITION': g.acc(p['pos'].astype('f4'), 'VEC3', 34962, True), 'NORMAL': g.acc(p['nrm'].astype('f4'), 'VEC3', 34962),
              'TEXCOORD_0': g.acc(p['uv'].astype('f4'), 'VEC2', 34962), 'JOINTS_0': g.acc(p['jn'].astype('u2'), 'VEC4', 34962), 'WEIGHTS_0': g.acc(p['jw'].astype('f4'), 'VEC4', 34962)}
        if p.get('col') is not None:
            c = np.ascontiguousarray(p['col']); at['COLOR_0'] = g.acc(c, 'VEC4' if c.shape[1] == 4 else 'VEC3', 34962, normalized=c.dtype != np.float32)
        tg = []; names = []
        for mk, (mp, mn) in morphs.items():
            if nm not in mp: continue
            k = 1.0
            dp = ((mp[nm] - p['pos'])*k).astype('f4'); dn = (mn[nm] - p['nrm']).astype('f4')
            tg.append({'POSITION': g.acc(dp, 'VEC3', 34962, True), 'NORMAL': g.acc(dn, 'VEC3', 34962)}); names.append(mk)
        prim = {'attributes': at, 'indices': g.acc(p['tris'].astype('u4').reshape(-1), 'SCALAR', 34963), 'material': len(g.j['materials'])-1}
        mesh = {'name': nm, 'primitives': [prim]}
        if tg: prim['targets'] = tg; mesh['weights'] = [0]*len(tg); mesh['extras'] = {'targetNames': names}
        g.j['meshes'].append(mesh); g.j['nodes'].append({'name': nm, 'mesh': len(g.j['meshes'])-1, 'skin': 0}); roots.append(len(g.j['nodes'])-1)
    g.j['scenes'] = [{'nodes': roots}]; g.j['scene'] = 0; g.save(path)

def numoff(S):
    R = S['R']; f = R['f']; s2 = R['bind'][f.J('Spine2')]; pj = S['parts']['MH_JERSEY']['pos']
    loc = (np.c_[pj, np.ones(len(pj))] @ np.linalg.inv(s2).T)[:, :3]; mid = np.abs(loc[:, 0]) < 6; o = {}
    for nm, yy in (('front', -9), ('back', -13)):
        band = mid & (np.abs(loc[:, 1]-yy) < 6); z = loc[band, 2]; o[nm] = round(float(z.max() if nm == 'front' else z.min()), 2)
    return o

if __name__ == '__main__':
    prep_textures()
    base = shape_parts(SHAPES['skill']); print('skill built')
    paint_jersey(base); paint_pants(base); print('textures painted')
    lift = -min(p['pos'][:, 1].min() for p in base['parts'].values())
    alts = {}
    for k in ('line', 'power'):
        alts[k] = shape_parts(SHAPES[k], base); print(k, 'built')
    for S in [base] + list(alts.values()):
        for p in S['parts'].values(): p['pos'][:, 1] += lift
        S['R']['bind'][:, 1, 3] += lift
    f = base['R']['f']; base['R']['k_h'] = base['R']['bind'][f.J('Hips')][1, 3] / f.bind[f.J('Hips')][1, 3]
    for k, S in alts.items():
        for nm, p in S['parts'].items():
            assert len(p['pos']) == len(base['parts'][nm]['pos']), (k, nm, len(p['pos']), len(base['parts'][nm]['pos']))
    morphs = {k: ({nm: p['pos'] for nm, p in S['parts'].items()}, {nm: p['nrm'] for nm, p in S['parts'].items()}) for k, S in alts.items()}
    # face morph: skin + face proxies only
    dv, alt_dm = face_morph(base); v2 = base['C']['v'] + dv; fp = {}; fn = {}
    sk = base['parts']['MH_SKIN']; fp['MH_SKIN'] = sk['pos'] + dv[sk['src']]; fn['MH_SKIN'] = sk['nrm']
    for nm, rel in (('MH_EYES', 'eyes/high-poly/high-poly.mhclo'), ('MH_BROWS', 'eyebrows/eyebrow001/eyebrow001.mhclo'), ('MH_LASHES', 'eyelashes/eyelashes02/eyelashes02.mhclo')):
        q = proxy.mesh(rel, alt_dm, v2, base['R']['W']); q['pos'][:, 1] += lift; fp[nm] = q['pos']; fn[nm] = q['nrm']
    # every mesh gets targets in the same order: line, power, (face)
    for nm in base['parts']:
        if nm not in fp: continue
    morphs['face'] = (fp, fn)
    for nm, p in base['parts'].items():   # parts without a face morph still need 3 targets when others have them? no: targets are per mesh
        pass
    info = {'height': round(float(max(p['pos'][:, 1].max() for p in base['parts'].values())), 3),
            'numOff': {k: numoff(S) for k, S in [('skill', base)] + list(alts.items())}}
    export(base, morphs, os.path.join(OUT, 'player-mh2.glb')); info['clipSpeed'] = base['ccSpeeds']
    export(base, morphs, os.path.join(OUT, 'viewer-mh2.glb'), viewer=True)
    json.dump(info, open(os.path.join(OUT, 'player-mh2.json'), 'w')); print(info)
    print({k: (len(p['pos']), len(p['tris'])) for k, p in base['parts'].items()}, 'tris', sum(len(p['tris']) for p in base['parts'].values()))
