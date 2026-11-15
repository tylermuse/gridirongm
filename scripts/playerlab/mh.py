"""MakeHuman data access: base mesh, macro shape targets, Mixamo rig joints + weights. Data is read only, never executed."""
import sys, site, os, json, zipfile
sys.path.append(site.getusersitepackages())
import numpy as np
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LAB = os.environ.get('PLAYERLAB_DIR', os.path.join(os.path.dirname(REPO), 'gridirongm-playerlab'))   # downloads + build outputs live outside the repo
MH = os.path.join(LAB, 'src/makehuman/makehuman/data'); MPFB = os.path.join(LAB, 'src/mpfb2/src/mpfb/data'); ZIP = os.path.join(LAB, 'src/assets/sys.zip')
TG = os.path.join(MH, 'targets')

def load_obj(path=None, text=None):
    V=[]; VT=[]; F=[]; G=[]; names=[]; cur=-1
    it = text.splitlines() if text is not None else open(path)
    for l in it:
        if l.startswith('v '): V.append(l.split()[1:4])
        elif l.startswith('vt '): VT.append(l.split()[1:3])
        elif l.startswith('g '): names.append(l.split()[1]); cur=len(names)-1
        elif l.startswith('f '):
            p=[x.split('/') for x in l.split()[1:]]
            F.append([(int(a[0])-1, int(a[1])-1 if len(a)>1 and a[1] else -1) for a in p]); G.append(cur)
    return dict(v=np.array(V,float), vt=np.array(VT,float) if VT else np.zeros((0,2)), f=F, g=np.array(G), groups=names)

def load_target(path, n):
    d=np.zeros((n,3))
    for l in open(path):
        if l[:1] in '#\n' or not l.strip(): continue
        p=l.split(); d[int(p[0])]=(float(p[1]),float(p[2]),float(p[3]))
    return d

def tri(v):  # MakeHuman's min/average/max split of a 0..1 slider
    mx=max(0.0, v*2-1); mn=max(0.0, 1-v*2); return {'min':mn, 'average':1-max(mx,mn), 'max':mx}

def macro_shape(base, muscle=.5, weight=.5, height=.5, proportions=.5, race=None):
    """Young adult male. Returns morphed vertices (decimetres, Y up, facing +Z)."""
    race = race or {'caucasian':1/3,'african':1/3,'asian':1/3}
    n=len(base); out=base.copy(); M=tri(muscle); W=tri(weight); md=os.path.join(TG,'macrodetails')
    for mk,mv in M.items():
        for wk,wv in W.items():
            k=mv*wv
            if k<=1e-6: continue
            out += k*load_target(f'{md}/universal-male-young-{mk}muscle-{wk}weight.target', n)
            for hk,hv in (('max',max(0,height*2-1)),('min',max(0,1-height*2))):
                if hv>1e-6: out += k*hv*load_target(f'{md}/height/male-young-{mk}muscle-{wk}weight-{hk}height.target', n)
            for pk,pv in (('ideal',max(0,proportions*2-1)),('uncommon',max(0,1-proportions*2))):
                if pv>1e-6: out += k*pv*load_target(f'{md}/proportions/male-young-{mk}muscle-{wk}weight-{pk}proportions.target', n)
    for r,k in race.items():
        if k>1e-6: out += k*load_target(f'{md}/{r}-male-young.target', n)
    return out

def group_verts(obj):
    gv={}
    for f,g in zip(obj['f'], obj['g']):
        gv.setdefault(obj['groups'][g], set()).update(i for i,_ in f)
    return {k:np.array(sorted(s)) for k,s in gv.items()}

def rig_joints(verts, gv):
    """Mixamo rig head/tail positions evaluated on the morphed mesh."""
    r=json.load(open(os.path.join(MPFB,'rigs/standard/rig.mixamo.json')))['bones']; out={}
    def pos(e):
        if e['strategy']=='CUBE': return verts[gv[e['cube_name']]].mean(0)
        if e['strategy']=='MEAN': return verts[e['vertex_indices']].mean(0)
        if e['strategy']=='VERTEX': return verts[e['vertex_index']]
        raise ValueError(e['strategy'])
    for n,b in r.items(): out[n.replace('mixamorig:','')] = dict(head=pos(b['head']), tail=pos(b['tail']), parent=b['parent'].replace('mixamorig:','') or None)
    return out

def rig_weights(n):
    w=json.load(open(os.path.join(MPFB,'rigs/standard/weights.mixamo.json')))['weights']; names=[k.replace('mixamorig:','') for k in w]
    Wm=np.zeros((n,len(names)))
    for j,(k,lst) in enumerate(w.items()):
        a=np.array(lst)
        if len(a): Wm[a[:,0].astype(int), j]=a[:,1]
    return names, Wm

def zip_bytes(name): return zipfile.ZipFile(ZIP).read(name)
