"""MakeHuman proxy assets (.mhclo): eyes, eyebrows, eyelashes fitted to the morphed body; skin weights follow the base vertices."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh
import numpy as np
X=os.path.join(mh.LAB,'src/x')
def load(rel):
    d=os.path.dirname(os.path.join(X,rel)); s=open(os.path.join(X,rel)).read().splitlines(); hdr={}; refs=[]; i=0
    while i<len(s):
        p=s[i].split()
        if p and p[0] in ('x_scale','y_scale','z_scale'): hdr[p[0]]=(int(p[1]),int(p[2]),float(p[3]))
        if p and p[0]=='obj_file': hdr['obj']=os.path.join(d,p[1])
        if p and p[0]=='verts': i+=1; break
        i+=1
    while i<len(s):
        p=s[i].split()
        if not p or p[0] in ('weights','delete_verts') or p[0].startswith('#'): break
        if len(p)==1: refs.append(((int(p[0]),int(p[0]),int(p[0])),(1.,0,0),(0,0,0)))
        else: refs.append((tuple(map(int,p[:3])),tuple(map(float,p[3:6])),tuple(map(float,p[6:9]))))
        i+=1
    return hdr, refs, mh.load_obj(hdr['obj'])
def fit(rel, base_dm, verts_m):
    """base_dm: unmorphed-but-shaped base verts in MakeHuman units (decimetres) for the scale refs; verts_m: the final posed verts (metres)."""
    hdr, refs, o = load(rel)
    I=np.array([r[0] for r in refs]); Wt=np.array([r[1] for r in refs]); D=np.array([r[2] for r in refs])
    sc=[abs(base_dm[hdr[k][0]][a]-base_dm[hdr[k][1]][a])/hdr[k][2] for k,a in (('x_scale',0),('y_scale',1),('z_scale',2))]
    k_m=np.linalg.norm(verts_m[5399]-verts_m[11998])/np.linalg.norm(base_dm[5399]-base_dm[11998])   # dm -> posed metres
    pos=(verts_m[I]*Wt[...,None]).sum(1) + D*np.array(sc)*k_m
    return pos, I, Wt, o
def mesh(rel, base_dm, verts_m, W):
    pos,I,Wt,o=fit(rel, base_dm, verts_m); key={}; P=[]; UV=[]; T=[]; S=[]
    for f in o['f']:
        idx=[]
        for vi,ti in f:
            k=(vi,ti)
            if k not in key: key[k]=len(P); P.append(pos[vi]); UV.append(o['vt'][ti] if ti>=0 else (0,0)); S.append(vi)
            idx.append(key[k])
        T += [(idx[0],idx[1],idx[2]),(idx[0],idx[2],idx[3])] if len(idx)==4 else [tuple(idx)]
    P=np.array(P); UV=np.array(UV,float); UV[:,1]=1-UV[:,1]; T=np.array(T); S=np.array(S)
    fn=np.cross(P[T[:,1]]-P[T[:,0]],P[T[:,2]]-P[T[:,0]]); n=np.zeros_like(P)
    for k in range(3): np.add.at(n,T[:,k],fn)
    n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
    Wv=(W[I[S]]*Wt[S][...,None]).sum(1)   # proxy vertex weights = barycentric blend of the base vertices' weights
    return dict(pos=P,nrm=n,uv=UV,tris=T,Wfull=Wv,src=None)
