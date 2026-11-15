"""Stage 1: athletic body shape + skin, exported as a static GLB for inspection."""
import sys, os, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh, glb
import numpy as np
OUT=os.path.join(mh.LAB,'out')
def body_mesh(obj, verts, groups=('body',)):
    """Unified (position,uv) vertices + triangles for the given face groups. Returns pos, uv, tris, src (original vertex index per output vertex)."""
    gi={obj['groups'].index(g) for g in groups}; key={}; src=[]; uv=[]; tris=[]
    for f,g in zip(obj['f'], obj['g']):
        if g not in gi: continue
        idx=[]
        for vi,ti in f:
            k=(vi,ti)
            if k not in key: key[k]=len(src); src.append(vi); uv.append(obj['vt'][ti] if ti>=0 else (0,0))
            idx.append(key[k])
        tris += [(idx[0],idx[1],idx[2]),(idx[0],idx[2],idx[3])] if len(idx)==4 else [tuple(idx)]
    src=np.array(src); uv=np.array(uv,float); uv[:,1]=1-uv[:,1]
    return verts[src], uv, np.array(tris), src
def normals(pos, tris, src):
    """Smooth normals shared across UV seams (accumulated on original vertex ids)."""
    fn=np.cross(pos[tris[:,1]]-pos[tris[:,0]], pos[tris[:,2]]-pos[tris[:,0]]); acc=np.zeros((src.max()+1,3))
    for k in range(3): np.add.at(acc, src[tris[:,k]], fn)
    n=acc[src]; return n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-9)
if __name__=='__main__':
    obj=mh.load_obj(os.path.join(mh.MH,'3dobjs/base.obj'))
    P=dict(muscle=float(os.environ.get('MUSCLE',.9)), weight=float(os.environ.get('WEIGHT',.5)), proportions=.85)
    v=mh.macro_shape(obj['v'], **P)*.1   # metres
    pos,uv,tris,src=body_mesh(obj, v); n=normals(pos,tris,src)
    pos=pos-[0,v[mh.group_verts(obj)['body']][:,1].min(),0]
    print('body verts',len(pos),'tris',len(tris),'height %.3f m'%(pos[:,1].max()), 'shoulder width %.3f'%(pos[:,0].max()-pos[:,0].min()))
    png=os.path.join(OUT,'skin_src.png'); jpg=os.path.join(OUT,'skin.jpg')
    if not os.path.exists(jpg):
        open(png,'wb').write(mh.zip_bytes('skins/young_caucasian_male/young_lightskinned_male_diffuse.png'))
        subprocess.run(['sips','-s','format','jpeg','-s','formatOptions','88',png,'--out',jpg],check=True,capture_output=True)
    g=glb.GLB(); im=g.image(open(jpg,'rb').read(),'image/jpeg')
    g.j.update(textures=[{'source':im,'sampler':0}], samplers=[{'magFilter':9729,'minFilter':9987}], materials=[{'name':'skin','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.62}}],
      meshes=[{'name':'BODY','primitives':[{'attributes':{'POSITION':g.acc(pos.astype('f4'),'VEC3',34962,True),'NORMAL':g.acc(n.astype('f4'),'VEC3',34962),'TEXCOORD_0':g.acc(uv.astype('f4'),'VEC2',34962)},'indices':g.acc(tris.astype('u4').reshape(-1),'SCALAR',34963),'material':0}]}],
      nodes=[{'mesh':0,'name':'body'}], scenes=[{'nodes':[0]}], scene=0)
    g.save(os.path.join(OUT,os.environ.get('NAME','stage1')+'.glb')); print('saved')
