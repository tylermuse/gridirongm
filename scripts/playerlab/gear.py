"""Football gear generated on the rigged body: jersey draped over shoulder pads, padded pants, socks; helmet and cleats refitted from the shipped CC BY player."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh, glb, rig
import numpy as np
np.seterr(all='ignore')   # numpy 2.0 on macOS/arm64 raises spurious matmul FP warnings
ss=lambda a,b,x: (lambda t: t*t*(3-2*t))(np.clip((x-a)/(b-a),0,1))
def ctx(R):
    obj=R['obj']; v=R['v']; J=R['J']; names=R['names']; W=R['W']; body=R['gv']['body']; nb=len(v)
    quads=[f for f,g in zip(obj['f'],obj['g']) if obj['groups'][g]=='body']; Q=np.array([[vi for vi,_ in f] for f in quads]); QT=np.array([[ti for _,ti in f] for f in quads])
    tr=np.r_[Q[:,[0,1,2]],Q[:,[0,2,3]]]; fn=np.cross(v[tr[:,1]]-v[tr[:,0]], v[tr[:,2]]-v[tr[:,0]]); n=np.zeros((nb,3))
    for k in range(3): np.add.at(n,tr[:,k],fn)
    n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
    wb=lambda *pats: sum(W[:,i] for i,nm in enumerate(names) if any(p in nm for p in pats))
    return dict(Q=Q,QT=QT,n=n,wb=wb,v=v,J=J)
def smooth(val, Q, mask, it=6, lam=.5):
    """Laplacian smoothing of a per-vertex scalar over the quad mesh, restricted to `mask`."""
    val=val.copy(); e=np.r_[Q[:,[0,1]],Q[:,[1,2]],Q[:,[2,3]],Q[:,[3,0]]]; e=e[mask[e[:,0]]&mask[e[:,1]]]
    for _ in range(it):
        s=np.zeros_like(val); c=np.zeros_like(val); np.add.at(s,e[:,0],val[e[:,1]]); np.add.at(s,e[:,1],val[e[:,0]]); np.add.at(c,e[:,0],1); np.add.at(c,e[:,1],1)
        m=c>0; val[m]+=lam*(s[m]/c[m]-val[m])
    return val
def shell(R, C, mask, d, rim=.0015, base=None, relax=0, outer=None):
    """Offset copy of the body faces inside `mask`, pushed out d metres along the body normal, with a rim back to the skin at every opening."""
    obj=R['obj']; Q=C['Q']; QT=C['QT']; sel=mask[Q].all(1); v=C['v'] if base is None else base; n=C['n']; key={}
    outer=(v+n*d[:,None]) if outer is None else outer
    if relax: outer=np.stack([smooth(outer[:,k],Q,mask,it=relax,lam=.5) for k in range(3)],1)+n*.002   # cloth does not show every muscle; +2 mm gives back what smoothing shrinks
    pos=[]; uv=[]; src=[]; nid=[]; tris=[]; edges={}
    def vert(vi,ti,inner=False):
        k=(vi,ti,inner)
        if k not in key:
            key[k]=len(pos); pos.append(v[vi]+n[vi]*rim if inner else outer[vi]); uv.append(obj['vt'][ti]); src.append(vi); nid.append(vi+(len(v) if inner else 0))
        return key[k]
    for q,qt in zip(Q[sel],QT[sel]):
        i=[vert(a,b) for a,b in zip(q,qt)]; tris+=[(i[0],i[1],i[2]),(i[0],i[2],i[3])]
        for k in range(4): a,b=q[k],q[(k+1)%4]; edges[(a,b)]=(qt[k],qt[(k+1)%4])
    nouter=len(tris)
    for (a,b),(ta,tb) in edges.items():
        if (b,a) in edges: continue   # interior edge
        o0,o1,i0,i1=vert(a,ta),vert(b,tb),vert(a,ta,True),vert(b,tb,True); tris+=[(o1,o0,i0),(o1,i0,i1)]
    pos=np.array(pos); tris=np.array(tris); nid=np.array(nid); uv=np.array(uv,float); uv[:,1]=1-uv[:,1]
    fn=np.cross(pos[tris[:,1]]-pos[tris[:,0]], pos[tris[:,2]]-pos[tris[:,0]]); acc=np.zeros((2*len(v),3))
    for k in range(3): np.add.at(acc,nid[tris[:,k]],fn)
    nn=acc[nid]; nn/=np.maximum(np.linalg.norm(nn,axis=1,keepdims=True),1e-12)
    return dict(pos=pos,nrm=nn,uv=uv,tris=tris,src=np.array(src),nouter=nouter,inner=nid>=len(v))
def regions(R, C):
    v=C['v']; J=C['J']; wb=C['wb']; y=v[:,1]; out={}
    belt=J['Hips'][1]+.075; neck=wb('Neck','Head'); out['belt']=belt
    armw={s:wb(s+'Arm',s+'ForeArm',s+'Hand') for s in ('Left','Right')}; legw={s:wb(s+'UpLeg',s+'Leg',s+'Foot',s+'ToeBase') for s in ('Left','Right')}
    ta=np.zeros(len(v)); tl=np.zeros(len(v)); tt=np.zeros(len(v)); arm=np.zeros(len(v),bool); leg=np.zeros(len(v),bool)
    for s in ('Left','Right'):
        S,E,Wr=J[s+'Arm'],J[s+'ForeArm'],J[s+'Hand']; m=armw[s]>.5; arm|=m; ta[m]=((v[m]-S)@(Wr-S))/((Wr-S)@(Wr-S))          # 0 shoulder .. 1 wrist
        H,K,A=J[s+'UpLeg'],J[s+'Leg'],J[s+'Foot']; m=legw[s]>.5; leg|=m; tl[m]=((v[m]-K)@(A-K))/((A-K)@(A-K)); tt[m]=((v[m]-H)@(K-H))/((K-H)@(K-H))   # shin 0 knee..1 ankle; thigh 0 hip..1 knee
    torso=~arm&~leg; foot=wb('Foot','ToeBase')>.5; ank=J['LeftFoot'][1]
    axA=np.zeros((len(v),3)); axL=np.zeros((len(v),3))
    for s in ('Left','Right'): axA[armw[s]>.5]=J[s+'Hand']-J[s+'Arm']; axL[legw[s]>.5]=J[s+'Foot']-J[s+'Leg']
    # every opening is cut on a straight line: faces are taken a little past the line, then the overshoot is slid back onto it
    SLEEVE,HEM,KNEE=.27,belt-.035,.2
    out['jersey']=(torso&(neck<.42)&(y>HEM-.06)) | (arm&(ta<SLEEVE+.08))
    b=v.copy(); m=arm&(ta>SLEEVE); b[m]-=(ta[m]-SLEEVE)[:,None]*axA[m]; m=torso&(y<HEM); b[m,1]=HEM; out['jersey_base']=b
    out['pants']=(torso&(y<belt+.03)&(neck<.1)) | (leg&(tl<KNEE+.1)&~foot)   # the waist rows only: verts slid down to the belt keep their own (spine) skin weights, so taking more makes the waistband ride up the back when he bends
    b=v.copy(); m=leg&(tl>KNEE); b[m]-=(tl[m]-KNEE)[:,None]*axL[m]; m=torso&(y>belt+.012); b[m,1]=belt+.012; out['pants_base']=b
    out['socks']=leg&(tl>.1)&(y>ank-.08)
    b=v.copy(); m=y<ank-.035; b[m,1]=ank-.035; out['socks_base']=b
    out['skin']=(neck>.25) | (arm&(ta>.2))
    out.update(ta=ta,tl=tl,tt=tt,arm=arm,leg=leg,torso=torso)
    return out
def pad_field(R, C, G):
    """Jersey offset: cloth sits 7 mm off the skin, and drapes over shoulder pads modelled as a smooth union of ellipsoids on the joints."""
    v=C['v']; n=C['n']; J=C['J']; SL,SR=J['LeftArm'],J['RightArm']; sy=(SL[1]+SR[1])/2; sx=(SL[0]-SR[0])/2; cz=(SL[2]+SR[2])/2
    tor=v[G['torso']&(np.abs(v[:,1]-(sy-.12))<.03)]; zc=(tor[:,2].max()+tor[:,2].min())/2; zr=(tor[:,2].max()-tor[:,2].min())/2
    # sized down 2026-11-15 (Tyler: "way too big"): caps sit closer over the shoulder point, plates a couple of cm off the chest
    E=[((SL[0]+.022,sy+.02,cz),(.118,.066,.112)), ((SR[0]-.022,sy+.02,cz),(.118,.066,.112)),        # caps over each shoulder point
       ((0,sy-.05,zc),(sx+.028,.128,zr+.028)),                                                      # chest + back plate
       ((0,sy+.018,zc-.01),(sx*.84,.062,zr*.9))]                                                    # the shelf between the caps, either side of the neck
    def f(p):
        k=24.0; acc=0
        for c,r in E: q=(p-np.array(c))/np.array(r); acc=acc+np.exp(-k*(np.linalg.norm(q,axis=1)-1))
        return -np.log(np.maximum(acc,1e-30))/k          # <0 inside the pads
    m=G['jersey']; d=np.full(len(v),.009); idx=np.where(m)[0]; t=np.full(len(idx),.009); done=np.zeros(len(idx),bool)
    for step in np.arange(.009,.105,.0015):
        inside=f(v[idx]+n[idx]*step)<0; t[~done&inside]=step+.0015; done|=~inside
    d[idx]=t; d=smooth(d,C['Q'],m,it=8); d[idx]=np.maximum(d[idx],.009)
    return d
def pants_field(C, G):
    v=C['v']; n=C['n']; J=C['J']; d=np.full(len(v),.005); front=np.clip(n[:,2],0,1)**1.3; side=np.clip(np.abs(n[:,0]),0,1)
    for s in ('Left','Right'):
        K=J[s+'Leg']; m=G['leg']
        d[m]+=.013*np.exp(-((G['tt'][m]-.5)/.24)**2)*front[m]*(G['tt'][m]<1.0)                       # thigh pad
        d[m]+=.011*np.exp(-(np.linalg.norm(v[m]-(K+[0,0,.03]),axis=1)/.075)**2)*front[m]             # knee pad
    d+= .008*np.exp(-((v[:,1]-(J['Hips'][1]-.02))/.06)**2)*side*G['torso']                           # hip pads
    return smooth(d,C['Q'],G['pants'],it=3)
def refit(f, name, bones, src_ref, dst_ref, k, R, face_all=True):
    """Rigid gear from the shipped model (helmet, cleats): keep the triangles bound to `bones`, move them from the old joint to the new one."""
    m=f.mesh(name); dom=m['JOINTS_0'][np.arange(len(m['JOINTS_0'])), m['WEIGHTS_0'].argmax(1)]; ok=np.isin(dom,[f.J(b) for b in bones]); tri=m['idx']; keep=ok[tri].all(1) if face_all else ok[tri].any(1)
    used=np.unique(tri[keep]); remap=-np.ones(len(ok),int); remap[used]=np.arange(len(used)); P=m['POSITION'][used].astype(float)
    out=dict(pos=np.zeros_like(P), nrm=m['NORMAL'][used].astype(float), uv=m.get('TEXCOORD_0',np.zeros((len(ok),2)))[used].astype(float), tris=remap[tri[keep]], jn=m['JOINTS_0'][used].astype('u2'), jw=m['WEIGHTS_0'][used].astype('f4'), col=m['COLOR_0'][used] if 'COLOR_0' in m else None)
    d=dom[used]
    for b in bones:
        mm=d==f.J(b)
        if mm.any(): out['pos'][mm]=dst_ref(b)+k*(P[mm]-src_ref(b))
    return out
