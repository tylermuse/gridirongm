"""Put the MakeHuman body on the shipped player's skeleton: same joint names, same bind orientations (so every existing clip and every
procedural bone tweak in the sim applies unchanged), MakeHuman's own joint positions and skin weights. The body is re-posed from its A-pose
into the template's T-pose first, so identical local rotations give identical poses."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh, glb
from fp27 import FP27, quat_mat
import numpy as np
import re
def rot_between(a, b):
    a=a/np.linalg.norm(a); b=b/np.linalg.norm(b); v=np.cross(a,b); c=float(a@b); s=np.linalg.norm(v)
    if s<1e-9: return np.eye(3)
    K=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]); return np.eye(3)+K+K@K*((1-c)/(s*s))
def build(muscle=.95, weight=.55, proportions=.85, stature=1.86, race=None):
    f=FP27(); obj=mh.load_obj(os.path.join(mh.MH,'3dobjs/base.obj')); gv=mh.group_verts(obj)
    vdm=mh.macro_shape(obj['v'], muscle=muscle, weight=weight, proportions=proportions, race=race); v=vdm*.1
    body=gv['body']; v[:,1]-=v[body][:,1].min(); v*=stature/v[body][:,1].max()
    J=mh.rig_joints(v, gv); names,W=mh.rig_weights(len(v)); W=W/np.maximum(W.sum(1,keepdims=True),1e-9)
    P=lambda n: f.bind[f.J(n)][:3,3]
    child={}
    for s in ('Left','Right'):
        child.update({s+'Arm':s+'ForeArm', s+'ForeArm':s+'Hand', s+'UpLeg':s+'Leg', s+'Leg':s+'Foot', s+'Foot':s+'ToeBase'})
    # Hands are NOT fitted joint-by-joint: the template's finger joints are irregular (its index knuckle sits twice as far from the wrist as its middle
    # knuckle), so matching them bent these anatomical fingers out of shape. Instead the whole hand is turned so its shape (long axis, palm, thumb side)
    # lines up with the template's hand mesh, and the fingers keep MakeHuman's own relaxed pose (the clips' finger channels are dropped on export).
    def hand_frame(pts, wrist, thumb):
        c=pts.mean(0); _,_,Vt=np.linalg.svd(pts-c, full_matrices=False); e1,e3=Vt[0],Vt[2]
        if e1@(c-wrist)<0: e1=-e1
        if np.cross(e1,e3)@(thumb-c)<0: e3=-e3
        return np.stack([e1,np.cross(e3,e1),e3],1)
    fhand={}
    for s in ('Left','Right'):
        pts=[]; th=[]
        for mn in ('Bodymat',):
            m=f.mesh(mn); dom=m['JOINTS_0'][np.arange(len(m['JOINTS_0'])), m['WEIGHTS_0'].argmax(1)]; nm=np.array([f.short(int(k)) for k in dom])
            hm=np.char.startswith(nm, s+'Hand'); pts.append(m['POSITION'][hm]); th.append(m['POSITION'][np.char.startswith(nm, s+'HandThumb')])
        fhand[s]=hand_frame(np.concatenate(pts).astype(float), P(s+'Hand'), np.concatenate(th).astype(float).mean(0))
    hcols={s:[i for i,nm in enumerate(names) if nm.startswith(s+'Hand')] for s in ('Left','Right')}
    tcols={s:[i for i,nm in enumerate(names) if nm.startswith(s+'HandThumb')] for s in ('Left','Right')}
    kids={b:[c for c in J if J[c]['parent']==b] for b in J}
    def desc(b):
        out=[b]
        for c in kids[b]: out+=desc(c)
        return out
    order=[]; todo=[b for b in J if J[b]['parent'] is None]
    while todo: b=todo.pop(0); order.append(b); todo+=kids[b]
    M={b:np.eye(4) for b in J}; pos={b:J[b]['head'].copy() for b in J}; tail={b:J[b]['tail'].copy() for b in J}
    for b in order:
        c=child.get(b)
        if not c: continue
        cur=(pos[c] if c in pos else tail[b])-pos[b]; want=P(c)-P(b)
        T=np.eye(4); T[:3,:3]=rot_between(cur,want); T[:3,3]=pos[b]-T[:3,:3]@pos[b]
        def apply(T, b=b):
            for d in desc(b):
                M[d]=T@M[d]; tail[d]=T[:3,:3]@tail[d]+T[:3,3]
                if d!=b: pos[d]=T[:3,:3]@pos[d]+T[:3,3]
        apply(T)
        if b.endswith('ForeArm'):   # the hand hangs off the forearm: turn it as a whole to the template hand's frame
            s_=b[:-7]; hb=s_+'Hand'; hv=np.where(W[:,hcols[s_]].sum(1)>.5)[0]; tv=np.where(W[:,tcols[s_]].sum(1)>.5)[0]
            Mn={n:M[n] for n in names}; cur=lambda idx: np.einsum('vb,bij,vj->vi', W[idx], np.stack([Mn[n] for n in names]), np.c_[v[idx],np.ones(len(idx))])[:,:3]
            Fo=hand_frame(cur(hv), pos[hb], cur(tv).mean(0)); Rh=fhand[s_]@Fo.T
            T2=np.eye(4); T2[:3,:3]=Rh; T2[:3,3]=pos[hb]-Rh@pos[hb]
            for d in desc(hb):
                M[d]=T2@M[d]; tail[d]=Rh@tail[d]+T2[:3,3]
                if d!=hb: pos[d]=Rh@pos[d]+T2[:3,3]
            print(hb,'hand turned %.0f deg'%np.degrees(np.arccos(np.clip((np.trace(Rh)-1)/2,-1,1))))
    # a relaxed athlete's hand: fingers drawn together a little and gently curled toward the palm (baked into the rest pose; no clip moves the fingers)
    def turn(b, Rm):
        piv=pos[b].copy(); T=np.eye(4); T[:3,:3]=Rm; T[:3,3]=piv-Rm@piv
        for d in desc(b):
            M[d]=T@M[d]; tail[d]=Rm@tail[d]+T[:3,3]
            if d!=b: pos[d]=Rm@pos[d]+T[:3,3]
    def axrot(a, ang):
        a=a/np.linalg.norm(a); K=np.array([[0,-a[2],a[1]],[a[2],0,-a[0]],[-a[1],a[0],0]]); return np.eye(3)+np.sin(ang)*K+(1-np.cos(ang))*K@K
    CURL={'Index':(14,24,14),'Middle':(16,26,16),'Ring':(19,29,18),'Pinky':(23,31,20),'Thumb':(4,14,10)}
    for s_ in ('Left','Right'):
        hb=s_+'Hand'; mid=pos[s_+'HandMiddle1']; ax=mid-pos[hb]; ax/=np.linalg.norm(ax)
        nrm=np.cross(pos[s_+'HandIndex1']-pos[hb], pos[s_+'HandPinky1']-pos[hb]); nrm-=ax*(nrm@ax); nrm/=np.linalg.norm(nrm)
        tipv=tail[s_+'HandMiddle3']-pos[s_+'HandMiddle1']
        if tipv@nrm<0: nrm=-nrm            # the palm side is where the fingers already lean
        for fg in ('Index','Ring','Pinky'):   # close the spread a bit
            b=s_+'Hand'+fg+'1'; d=tail[b]-pos[b]; m=tail[s_+'HandMiddle1']-pos[s_+'HandMiddle1']; d-=nrm*(d@nrm); m-=nrm*(m@nrm)
            ang=np.arctan2(np.cross(d,m)@nrm, d@m); turn(b, axrot(nrm, .45*ang))
        for fg,angs in CURL.items():
            for k,a in zip((1,2,3),angs):
                b=f'{s_}Hand{fg}{k}'
                if b not in pos: continue
                d=tail[b]-pos[b]; d/=np.linalg.norm(d); cax=np.cross(d, nrm)
                if np.linalg.norm(cax)<1e-6: continue
                turn(b, axrot(cax, np.radians(a)))
    Ms=np.stack([M[n] for n in names]); vh=np.c_[v,np.ones(len(v))]
    posed=np.einsum('vb,bij,vj->vi', W, Ms, vh)[:,:3]; un=W.sum(1)<.5; posed[un]=v[un]
    # new joint positions for all 67 template joints
    k_h=pos['Hips'][1]/P('Hips')[1]; newp=np.zeros((len(f.joints),3))
    for k in range(len(f.joints)):
        n=f.short(k)
        if n in pos: newp[k]=pos[n]; continue
        par=f.short(f.jparent[k]); off=P(n)-P(par)
        if n=='HeadTop_End': newp[k]=[pos['Head'][0], posed[body][:,1].max(), pos['Head'][2]+.02]
        elif n.endswith('4'): L=np.linalg.norm(tail[par]-pos[par]); newp[k]=pos[par]+off/np.linalg.norm(off)*L
        else: newp[k]=newp[f.jparent[k]]+off*k_h
    bindn=f.bind.copy(); bindn[:,:3,3]=newp
    return dict(vdm=vdm, f=f, obj=obj, gv=gv, v=posed, J=pos, tail=tail, names=names, W=W, newp=newp, bind=bindn, k_h=k_h, M=Ms)
def skin_attrs(R, src, top=4):
    """JOINTS_0 / WEIGHTS_0 (template joint indices) for output vertices that follow original vertices `src`."""
    f=R['f']; col=np.array([f.J(n) for n in R['names']]); W=R['W'][src]; idx=np.argsort(-W,axis=1)[:,:top]; w=np.take_along_axis(W,idx,1); w/=np.maximum(w.sum(1,keepdims=True),1e-9)
    return col[idx].astype('u2'), w.astype('f4')
def write_skeleton(g, R, anim=True):
    """Armature + 67 joints (template order), skin with new inverse bind matrices, and the template's clips (rotations kept verbatim, hips travel scaled)."""
    f=R['f']; nodes=g.j.setdefault('nodes',[]); base=len(nodes); nodes.append({'name':'Armature','scale':[.01,.01,.01],'children':[]}); nid={}
    for k,ni in enumerate(f.joints):
        src=f.nodes[ni]; p=f.jparent[k]; Wp=np.diag([.01,.01,.01,1.]) if p is None else R['bind'][p]; L=np.linalg.inv(Wp)@R['bind'][k]
        n={'name':src['name'],'translation':L[:3,3].tolist()}
        for key in ('rotation','scale'):
            if key in src: n[key]=src[key]
        nodes.append(n); nid[ni]=len(nodes)-1
    for k,ni in enumerate(f.joints):
        p=f.jparent[k]; nodes[base if p is None else nid[f.joints[p]]].setdefault('children',[]).append(nid[ni])
    ibm=np.linalg.inv(R['bind']).transpose(0,2,1).reshape(-1,16).astype('f4')
    g.j['skins']=[{'joints':[nid[i] for i in f.joints],'inverseBindMatrices':g.acc(ibm,'MAT4'),'skeleton':nid[f.joints[0]]}]
    if anim:
        hips=f.joints[0]; out=[]
        for a in f.j['animations']:
            S=[]; C=[]; tcache={}
            for c in a['channels']:
                path=c['target']['path']; node=c['target']['node']
                if node not in nid or path=='scale' or (path=='translation' and node!=hips): continue
                if re.search(r'Hand(Thumb|Index|Middle|Ring|Pinky)', f.nodes[node]['name']): continue   # fingers keep the model's own relaxed pose
                sm=a['samplers'][c['sampler']]; data=np.array(f.acc(sm['output']),dtype='f4')
                if path=='translation': data=(data*R['k_h']).astype('f4')
                if sm['input'] not in tcache: tcache[sm['input']]=g.acc(np.array(f.acc(sm['input']),dtype='f4'),'SCALAR',minmax=True)
                S.append({'input':tcache[sm['input']],'output':g.acc(data,'VEC3' if path=='translation' else 'VEC4'),'interpolation':sm.get('interpolation','LINEAR')}); C.append({'sampler':len(S)-1,'target':{'node':nid[node],'path':path}})
            out.append({'name':a['name'],'samplers':S,'channels':C})
        g.j['animations']=out
    return base, nid
if __name__=='__main__':
    from stage1 import body_mesh, normals
    R=build(); f=R['f']; pos,uv,tris,src=body_mesh(R['obj'], R['v']); n=normals(pos,tris,src); jn,jw=skin_attrs(R,src)
    print('hips ratio %.3f'%R['k_h'], 'head joint', np.round(R['J']['Head'],3), 'top', round(pos[:,1].max(),3), 'L shoulder', np.round(R['J']['LeftArm'],3), 'L hand', np.round(R['J']['LeftHand'],3))
    g=glb.GLB(); im=g.image(open(os.path.join(mh.LAB,'out/skin.jpg'),'rb').read(),'image/jpeg'); base,nid=write_skeleton(g,R)
    g.j.update(textures=[{'source':im,'sampler':0}], samplers=[{'magFilter':9729,'minFilter':9987}], materials=[{'name':'skin','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.62}}],
      meshes=[{'name':'BODY','primitives':[{'attributes':{'POSITION':g.acc(pos.astype('f4'),'VEC3',34962,True),'NORMAL':g.acc(n.astype('f4'),'VEC3',34962),'TEXCOORD_0':g.acc(uv.astype('f4'),'VEC2',34962),'JOINTS_0':g.acc(jn,'VEC4',34962),'WEIGHTS_0':g.acc(jw,'VEC4',34962)},'indices':g.acc(tris.astype('u4').reshape(-1),'SCALAR',34963),'material':0}]}])
    g.j['nodes'].append({'name':'BODY','mesh':0,'skin':0}); g.j['scenes']=[{'nodes':[base,len(g.j['nodes'])-1]}]; g.j['scene']=0
    g.save(os.path.join(mh.LAB,'out/stage2.glb')); print('saved', os.path.getsize(os.path.join(mh.LAB,'out/stage2.glb')))
