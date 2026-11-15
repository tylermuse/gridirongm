"""Minimal GLB writer/reader (numpy)."""
import sys, site, json, struct
sys.path.append(site.getusersitepackages())
import numpy as np
CT={np.dtype('float32'):5126, np.dtype('uint16'):5123, np.dtype('uint32'):5125, np.dtype('uint8'):5121}
class GLB:
    def __init__(s): s.j={'asset':{'version':'2.0','generator':'gridiron-playerlab'},'accessors':[],'bufferViews':[],'buffers':[{}]}; s.bin=bytearray()
    def view(s, data, target=None):
        while len(s.bin)%4: s.bin.append(0)
        bv={'buffer':0,'byteOffset':len(s.bin),'byteLength':len(data)}
        if target: bv['target']=target
        s.bin+=data; s.j['bufferViews'].append(bv); return len(s.j['bufferViews'])-1
    def acc(s, arr, typ, target=None, minmax=False, normalized=False):
        arr=np.ascontiguousarray(arr); a={'bufferView':s.view(arr.tobytes(),target),'componentType':CT[arr.dtype],'count':len(arr),'type':typ}
        if minmax: a['min']=arr.min(0).tolist(); a['max']=arr.max(0).tolist()
        if normalized: a['normalized']=True
        s.j['accessors'].append(a); return len(s.j['accessors'])-1
    def image(s, data, mime):
        s.j.setdefault('images',[]).append({'bufferView':s.view(data),'mimeType':mime}); return len(s.j['images'])-1
    def save(s, path):
        while len(s.bin)%4: s.bin.append(0)
        s.j['buffers'][0]['byteLength']=len(s.bin); js=json.dumps(s.j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
        with open(path,'wb') as f:
            f.write(struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(s.bin))); f.write(struct.pack('<II',len(js),0x4E4F534A)); f.write(js); f.write(struct.pack('<II',len(s.bin),0x004E4942)); f.write(s.bin)
def read_glb(data):
    jl=struct.unpack('<I',data[12:16])[0]; j=json.loads(data[20:20+jl]); b=data[20+jl+8:]
    NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}; DT={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1',5120:'i1',5122:'<i2'}
    def acc(i):
        a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; n=NC[a['type']]; dt=np.dtype(DT[a['componentType']]); off=bv.get('byteOffset',0)+a.get('byteOffset',0); st=bv.get('byteStride')
        if st and st!=dt.itemsize*n:
            raw=np.frombuffer(b,np.uint8,st*a['count'],off).reshape(a['count'],st)[:,:dt.itemsize*n]; arr=np.frombuffer(raw.tobytes(),dt).reshape(a['count'],n)
        else: arr=np.frombuffer(b,dt,a['count']*n,off).reshape(a['count'],n)
        return arr[:,0] if n==1 else arr
    return j, acc, b
