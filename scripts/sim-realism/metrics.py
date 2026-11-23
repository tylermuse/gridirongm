"""Movement metrics for plays logged by run_sim.py.

Every play is resampled to 10 frames per second from the snap, the rate NFL tracking data uses, so
speeds, accelerations and cuts are computed the same way as the real benchmarks in benchmarks.json.

Coordinates: P[player, frame] = (lateral, downfield) in yards; downfield is + toward the offense's
goal and 0 is the line of scrimmage.

tscale 1.0 measures the sim on its own clock. tscale 1.5 (or whatever G.speed is) measures it as it
plays on screen.
"""
import collections, gzip, json, math
import numpy as np

HZ = 10.0
DT = 1.0 / HZ
OFF = {'OL', 'QB', 'RB', 'FB', 'WR', 'TE'}
GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S']
PASS = ('complete', 'incomplete', 'int')


def sim_group(role, form):
    if role.startswith('ol'): return 'OL'
    if role.startswith('dl'): return 'DL'
    if role.startswith('lb'): return 'LB'
    if role.startswith('cb'): return 'CB'
    if role in ('sL', 'sR'): return 'S'
    if role == 'qb': return 'QB'
    if role == 'rb': return 'RB'
    if role == 'te': return 'TE'
    if role == 'slot': return 'FB' if form in ('iform', 'heavy') else 'WR'
    if role == 'wrL': return 'TE' if form == 'heavy' else 'WR'
    return 'WR'


def read_log(path):
    """Yield (meta, play) records from a run_sim.py log; stops quietly at a truncated tail."""
    meta = None
    try:
        with gzip.open(path, 'rt') as f:
            for line in f:
                try: o = json.loads(line)
                except json.JSONDecodeError: return
                if 'meta' in o: meta = o; continue
                yield meta, o
    except EOFError:
        return


def read_meta(path):
    with gzip.open(path, 'rt') as f:
        return json.loads(f.readline())


def _throw(o):
    """(throw time, arrival time, receiver role) in sim-clock seconds for a pass, else (None, None, None)."""
    bp = o['ballPlan']; snap = o['snap']
    for j, s in enumerate(bp):
        if s['flight'] and j > 0 and bp[j - 1]['held'] == 'qb' and s['t0'] > snap + 0.4:
            return s['t0'], s['t1'], (bp[j + 1]['held'] if j + 1 < len(bp) else None)
    return None, None, None


def load_sim(path, tscale=1.0, on_screen=False):
    """tscale is the playback rate (G.speed). With on_screen, a play's own fast-forward is applied too: the game plays a handoff
    run `rate` times faster until `rateUntil` (sim clock), so on-screen time is not one constant multiple of the sim clock there."""
    plays = []
    for meta, o in read_log(path):
        fr = o['frames']; snap = o['snap']; roles = o['roles']; form = o['cfg']['formation']; z0 = o['z0']
        ta = np.array([r[0] for r in fr])
        pos = np.array([[[q[0], q[1]] for q in r[4]] for r in fr], dtype=float)
        down = np.array([[q[2] for q in r[4]] for r in fr])
        ballr = np.array([[r[1], r[3]] for r in fr], dtype=float)
        rate = float(o.get('rate') or 1.0) if on_screen else 1.0; until = float(o.get('rateUntil') or 0.0) if rate != 1.0 else 0.0
        # on-screen seconds since the snap <-> sim clock (piecewise: tscale*rate before `until`, tscale after)
        to_screen = lambda tc, r=rate, u=until: ((np.minimum(tc, u) - min(snap, u)) / (tscale * r) + (np.maximum(tc, u) - max(snap, u)) / tscale)
        split = float(to_screen(max(until, snap)))
        to_clock = lambda ts, r=rate, u=until, sp=split: np.where(ts < sp, snap + ts * tscale * r, max(u, snap) + (ts - sp) * tscale)
        grid = to_clock(np.arange(0, float(to_screen(min(ta[-1], o['whistleT'] + 1.0))) + 1e-9, DT))   # sim-clock time of each 10 Hz on-screen frame
        if len(grid) < 8: continue
        P = np.zeros((len(roles), len(grid), 2))
        for i in range(len(roles)):
            P[i, :, 0] = np.interp(grid, ta, pos[:, i, 0]); P[i, :, 1] = np.interp(grid, ta, pos[:, i, 1]) - z0
        B = np.stack([np.interp(grid, ta, ballr[:, 0]), np.interp(grid, ta, ballr[:, 1]) - z0], axis=1)
        group = np.array([sim_group(r, form) for r in roles]); side = np.array(['O' if g in OFF else 'D' for g in group])
        kind = o['res']['kind']
        if kind == 'run' and o['res'].get('style') == 'scramble': kind = 'scramble'
        throw_a = arrive_a = handoff_a = None
        if kind in PASS: throw_a, arrive_a, _ = _throw(o)
        if kind == 'run':
            bp = o['ballPlan']
            for j, s in enumerate(bp):
                if s['held'] == 'rb' and j > 0 and bp[j - 1]['held'] == 'qb': handoff_a = s['t0']; break
        carrier = roles.index(o['carrier']) if o['carrier'] in roles and kind in ('run', 'scramble') else None
        end_a = o['whistleT']
        if carrier is not None and down[:, carrier].any(): end_a = min(end_a, ta[np.argmax(down[:, carrier] > 0)])
        # Stop measuring a player once his own fall or tackle animation takes over: his anchor point is re-set there
        # (about 1.3 yd in one step), which is an animation detail, not movement.
        pend = np.full(len(roles), 10 ** 6)
        for i in range(len(roles)):
            if down[:, i].any(): pend[i] = max(2, int(np.floor(float(to_screen(ta[np.argmax(down[:, i] > 0)])) / DT)) - 2)
        sc = lambda v: None if v is None else float(to_screen(v))
        plays.append(dict(id=o['seed'], t=to_screen(grid), P=P, side=side, group=group, ball=B, kind=kind, throw_t=sc(throw_a), arrive_t=sc(arrive_a),
                          handoff_t=sc(handoff_a), end_t=sc(end_a), carrier=carrier, pend=pend, shotgun=not o['uc'], form=form))
    return plays


# ----------------------------------------------------------------------------- kinematics
def kin(P):
    """P [..., frames, 2] -> velocity, speed, acceleration magnitude. Velocity is a central difference over 0.2 s;
    acceleration is the change in velocity across 0.4 s, wide enough that sensor jitter in real data does not inflate it."""
    P = np.asarray(P, float); one = P.ndim == 2
    if one: P = P[None]
    V = np.zeros_like(P); V[:, 1:-1] = (P[:, 2:] - P[:, :-2]) / (2 * DT); V[:, 0] = (P[:, 1] - P[:, 0]) / DT; V[:, -1] = (P[:, -1] - P[:, -2]) / DT
    S = np.hypot(V[..., 0], V[..., 1]); A = np.zeros_like(V)
    if P.shape[1] > 4: A[:, 2:-2] = (V[:, 4:] - V[:, :-4]) / (4 * DT); A[:, :2] = A[:, 2:3]; A[:, -2:] = A[:, -3:-2]
    Am = np.hypot(A[..., 0], A[..., 1])
    return (V[0], S[0], Am[0]) if one else (V, S, Am)


def sharp_cuts(V, e):
    """Frames where the heading swings more than 60 degrees across 0.2 s while moving faster than 4 yd/s before and after.
    Returns (sharp-cut frames, moving frames)."""
    if e < 3: return 0, 0
    v0 = V[:e - 1]; v1 = V[2:e + 1]; s0 = np.hypot(v0[:, 0], v0[:, 1]); s1 = np.hypot(v1[:, 0], v1[:, 1]); mv = (s0 > 4) & (s1 > 4)
    if not mv.any(): return 0, 0
    cs = (v0[mv] * v1[mv]).sum(1) / (s0[mv] * s1[mv]); return int((cs < .5).sum()), int(mv.sum())


def sharpest_turn(P):
    """Largest change of direction on a path: angle (deg) between the velocity 0.2 s before and 0.2 s after a frame, counted only
    while still running (over 3 yd/s going in, 2 coming out). Returns (angle, top speed in the 0.6 s before, lowest speed within 0.3 s)."""
    n = len(P)
    if n < 9: return (np.nan,) * 3
    V, S, A = kin(P); i = np.arange(3, n - 3); v0 = V[i - 2]; v1 = V[i + 2]; s0 = np.hypot(v0[:, 0], v0[:, 1]); s1 = np.hypot(v1[:, 0], v1[:, 1]); ok = (s0 > 3) & (s1 > 2)
    if not ok.any(): return (np.nan,) * 3
    ang = np.degrees(np.arccos(np.clip((v0 * v1).sum(1) / np.maximum(s0 * s1, 1e-9), -1, 1))); ang[~ok] = -1; k = int(i[ang.argmax()])
    return float(ang.max()), float(S[max(0, k - 6):k].max()), float(S[max(0, k - 3):k + 4].min())


def fi(p, t):
    return None if t is None else int(min(len(p['t']) - 1, max(0, round(t * HZ))))


def pct(a, p):
    a = [x for x in a if x is not None and not (isinstance(x, float) and math.isnan(x))]
    return float(np.percentile(a, p)) if len(a) else float('nan')


def summarize(vals):
    vals = [float(v) for v in vals if v is not None and not math.isnan(float(v))]
    if not vals: return dict(n=0, mean=float('nan'), p10=float('nan'), p50=float('nan'), p90=float('nan'))
    return dict(n=len(vals), mean=float(np.mean(vals)), p10=pct(vals, 10), p50=pct(vals, 50), p90=pct(vals, 90), max=float(np.max(vals)))


# ----------------------------------------------------------------------------- whole plays, all 22 players
def whole_play(plays):
    M = {'n_plays': len(plays), 'kinds': dict(collections.Counter(p['kind'] for p in plays))}
    maxsp = {g: [] for g in GROUPS}; fr_sp = []; fr_acc = []; sharp = [0, 0]; fast_plays = set()
    dur = collections.defaultdict(list); P_ = collections.defaultdict(list); R_ = collections.defaultdict(list); AL = collections.defaultdict(list)
    for p in plays:
        P = p['P']; V, S, A = kin(P); n, F, _ = P.shape; e = max(fi(p, p['end_t']) or F - 1, 3)
        dur[p['kind']].append(p['end_t'])
        for i in range(n):
            g = p['group'][i]
            if g not in maxsp: continue
            ei = int(min(e, p['pend'][i]))
            if ei < 3: continue
            s = S[i, :ei + 1]; maxsp[g].append(s.max()); fr_sp.append(s); fr_acc.append(A[i, :ei + 1])
            if s.max() > 11.5: fast_plays.add(p['id'])
            c, m = sharp_cuts(V[i], ei); sharp[0] += c; sharp[1] += m
        G = p['group']; O = p['side'] == 'O'; D = ~O; z = P[:, 0, 1]; x = P[:, 0, 0]
        ol = np.where(G == 'OL')[0]; lb = np.where(G == 'LB')[0]; cb = np.where(G == 'CB')[0]; wr = np.where(G == 'WR')[0]; sf = np.where(G == 'S')[0]; qb = np.where(G == 'QB')[0]; rb = np.where(G == 'RB')[0]
        if len(ol) == 5: xs = np.sort(x[ol]); AL['ol_span'].append(xs[-1] - xs[0]); AL['ol_gap'].append(float(np.mean(np.diff(xs))))
        ob = lb[z[lb] > 2.5]
        if len(ob): AL['lb_depth_offball'].append(z[ob].mean())
        if len(sf): AL['deep_safety'].append(z[sf].max())
        if len(qb) and p['shotgun']: AL['qb_depth_shotgun'].append(-z[qb[0]])
        if len(rb) and p['shotgun']: AL['rb_depth_shotgun'].append(-z[rb].min())
        if len(wr): AL['widest_wr'].append(np.abs(x[wr]).max())
        for w in wr:
            if len(cb):
                c = cb[np.argmin(np.abs(x[cb] - x[w]))]
                if abs(x[c] - x[w]) < 4: AL['cb_cushion'].append(z[c] - z[w])
        if p['kind'] in PASS and p['throw_t'] is not None and len(qb):
            kt = fi(p, p['throw_t']); ka = fi(p, p['arrive_t']) if p['arrive_t'] is not None else None
            P_['time_to_throw'].append(p['throw_t']); P_['qb_depth_at_throw'].append(-P[qb[0], kt, 1])
            dd = np.hypot(*(P[D, kt] - P[qb[0], kt]).T); P_['nearest_defender_to_qb'].append(dd.min())
            if len(ol): P_['ol_depth_at_throw'].append(-P[ol, kt, 1].mean())
            if ka is not None and ka > kt:
                at = p['arrive_t'] - p['throw_t']; d = float(np.hypot(*(p['ball'][ka] - p['ball'][kt])))
                elig = np.where(O & (G != 'QB') & (G != 'OL'))[0]; tg = elig[np.argmin(np.hypot(*(P[elig, ka] - p['ball'][ka]).T))]
                if np.hypot(*(P[tg, ka] - p['ball'][ka])) < 4:
                    P_['air_distance'].append(d); P_['target_separation'].append(np.hypot(*(P[D, ka] - P[tg, ka]).T).min())
                    if at > 0.25: P_['ball_speed'].append(d / at)
        if p['kind'] == 'run' and p['carrier'] is not None:
            c = p['carrier']
            if p['handoff_t'] is not None: R_['handoff_shotgun' if p['shotgun'] else 'handoff_under_center'].append(p['handoff_t'])
            cross = np.where(P[c, :e + 1, 1] >= 0)[0]
            if len(cross) and P[c, 0, 1] < -2: R_['time_to_los'].append(cross[0] / HZ); R_['carrier_speed_at_los'].append(S[c, cross[0]])
            R_['carrier_max_speed'].append(S[c, :e + 1].max())
            dd = np.hypot(*(P[D, e] - P[c, e]).T); R_['defenders_within_3yd'].append(int((dd < 3).sum())); R_['defenders_within_5yd'].append(int((dd < 5).sum()))
    sp = np.concatenate(fr_sp) if fr_sp else np.zeros(1); ac = np.concatenate(fr_acc) if fr_acc else np.zeros(1)
    M['speed_max'] = {g: summarize(maxsp[g]) for g in GROUPS}
    M['all'] = dict(accel_share_over_10=float((ac > 10).mean()), speed_p99=pct(sp, 99), sharp_cuts_per_play=sharp[0] / max(1, len(plays)), plays_over_11_5=len(fast_plays) / max(1, len(plays)))
    M['duration'] = {k: summarize(v) for k, v in dur.items()}
    M['pass'] = {k: summarize(v) for k, v in P_.items()}; M['run'] = {k: summarize(v) for k, v in R_.items()}; M['align'] = {k: summarize(v) for k, v in AL.items()}
    return M


# ----------------------------------------------------------------------------- pass plays, snap to throw
def pass_window(plays):
    """Route runners and coverage defenders from the snap to the throw, plus the receiver who catches it from the snap to the
    catch: the same window and roles as the 2023-season benchmarks."""
    R = {g: collections.defaultdict(list) for g in ('WR', 'TE', 'RB', 'CB', 'S', 'LB')}; tot = dict(fr=0, a10=0, cuts=0); T = collections.defaultdict(list); n = 0
    for p in plays:
        if p['kind'] not in PASS or p['throw_t'] is None: continue
        kt = fi(p, p['throw_t'])
        if kt < 5: continue
        n += 1; P = p['P'][:, :kt + 1]; V, S, A = kin(P)
        for i, g in enumerate(p['group']):
            if g not in R: continue
            r = R[g]; e = kt
            for key, k in (('s05', 5), ('s10', 10), ('s15', 15), ('s20', 20)):
                if k <= e: r[key].append(S[i, k])
            r['vmax'].append(S[i].max()); r['amax'].append(A[i].max())
            if e >= 10: r['d1'].append(float(np.hypot(*(P[i, 10] - P[i, 0]))))
            hit = np.where(S[i] >= 5)[0]
            if len(hit): r['t5'].append(hit[0] / HZ)
            c, _ = sharp_cuts(V[i], e); tot['cuts'] += c; tot['fr'] += len(S[i]); tot['a10'] += int((A[i] > 10).sum())
        # the receiver who catches it: the eligible player nearest the ball when it arrives (completions only)
        if p['kind'] == 'complete' and p['arrive_t'] is not None:
            ka = fi(p, p['arrive_t']); G = p['group']; elig = np.where((p['side'] == 'O') & (G != 'QB') & (G != 'OL'))[0]
            tg = elig[np.argmin(np.hypot(*(p['P'][elig, ka] - p['ball'][ka]).T))]
            if np.hypot(*(p['P'][tg, ka] - p['ball'][ka])) < 4 and ka >= 9:
                Pf = p['P'][tg, :ka + 1]; ang, pre, mn = sharpest_turn(Pf); T['vmax'].append(kin(Pf)[1].max()); T['angle'].append(ang)
    out = {'n_pass_plays': n, 'groups': {g: {k: summarize(v) for k, v in r.items()} for g, r in R.items()},
           'accel_share_over_10': tot['a10'] / max(1, tot['fr']), 'sharp_cuts_per_pass_play': tot['cuts'] / max(1, n)}
    ang = np.array(T['angle'], float)
    out['target'] = dict(n=len(ang), vmax=summarize(T['vmax']), share_turn_over_60=float(np.mean(ang >= 60)) if len(ang) else float('nan'))
    return out
