"""The shipped player (CC BY) as the rig template: skeleton node tree, bind pose, animations, and the rigid gear we keep (helmet, shoes)."""
import sys, os, re, base64, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glb
import numpy as np
SRC=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'public/chase-cam/player-fp27.js')
def quat_mat(q):
    x,y,z,w=q; return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def trs(n):
    if 'matrix' in n: return np.array(n['matrix'],float).reshape(4,4).T
    m=np.eye(4); m[:3,:3]=quat_mat(n.get('rotation',[0,0,0,1]))*np.array(n.get('scale',[1,1,1]))[None,:]; m[:3,3]=n.get('translation',[0,0,0]); return m
class FP27:
    def __init__(s):
        js=open(SRC).read(); s.js=js
        s.data=base64.b64decode(re.search(r'PLAYER_GLB_B64="([^"]+)"',js).group(1)); s.j,s.acc,s.bin=glb.read_glb(s.data)
        j=s.j; s.nodes=j['nodes']; s.parent={}
        for i,n in enumerate(s.nodes):
            for c in n.get('children',[]): s.parent[c]=i
        sk=j['skins'][0]; s.joints=sk['joints']; s.jname=[s.nodes[i]['name'] for i in s.joints]; s.jidx={n:k for k,n in enumerate(s.jname)}
        ibm=s.acc(sk['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float); s.bind=np.linalg.inv(ibm)   # joint bind world matrices (mesh space)
        s.jparent=[s.jidx.get(s.nodes[s.parent[i]]['name']) if s.parent.get(i) in s.joints else None for i in s.joints]
    def world(s, i):   # node world matrix from the file's TRS
        m=trs(s.nodes[i]); p=s.parent.get(i)
        return m if p is None else s.world(p)@m
    def J(s, n): return s.jidx['mixamorig:'+n]
    def short(s, k): return s.jname[k].replace('mixamorig','').replace(':','')
    def mesh(s, name):
        for m in s.j['meshes']:
            if m.get('name')==name:
                p=m['primitives'][0]; a=p['attributes']; out={k:np.array(s.acc(v)) for k,v in a.items()}; out['idx']=np.array(s.acc(p['indices'])).reshape(-1,3); return out
if __name__=='__main__':
    f=FP27(); print(len(f.joints),'joints; root chain:', [f.nodes[i].get('name') for i in [f.parent.get(f.joints[0])] if i is not None], 'root joint', f.jname[0])
    a=f.parent.get(f.joints[0]); chain=[]
    while a is not None: chain.append((f.nodes[a].get('name'), {k:np.round(v,4).tolist() for k,v in f.nodes[a].items() if k in('rotation','scale','translation')})); a=f.parent.get(a)
    print('ancestors', chain)
    P=lambda n: f.bind[f.J(n)][:3,3]
    for n in ['Hips','Spine2','Neck','Head','HeadTop_End','LeftShoulder','LeftArm','LeftForeArm','LeftHand','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase']: print(n, np.round(P(n),3))
    print('bind scale', np.round(np.linalg.norm(f.bind[0][:3,:3],axis=0),4))
    # does file TRS reproduce bind?
    err=max(np.abs(f.world(f.joints[k])-f.bind[k]).max() for k in range(len(f.joints))); print('node TRS vs bind max err', round(err,4))
    print('not in MH rig:', [f.short(k) for k in range(len(f.joints)) if not re.search(r'Hips|Spine|Neck|Head$|Shoulder|Arm|ForeArm|Hand$|Hand(Index|Middle|Pinky|Ring|Thumb)[123]|UpLeg|Leg|Foot|ToeBase', f.short(k))])
    for m in f.j['meshes']:
        d=f.mesh(m['name']); y=d['POSITION']; jw=d['JOINTS_0']; dom=np.bincount(jw[np.arange(len(jw)), d['WEIGHTS_0'].argmax(1)].astype(int), minlength=len(f.joints)); top=[(f.short(k),int(c)) for k,c in sorted(enumerate(dom),key=lambda x:-x[1])[:4] if c]
        print(m['name'], 'y %.2f..%.2f'%(y[:,1].min(),y[:,1].max()), top)
    an=f.j['animations'][3]; print(an['name'], [(c['target']['path']) for c in an['channels'][:4]], 'samplers', len(an['samplers']))
