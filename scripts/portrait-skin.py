# Skin tone per generated headshot for the 3D sim: python3 scripts/portrait-skin.py . src/lib/portraits/portraitSkin.json /tmp/skinsheet.png
import json, sys, os, random
import numpy as np
from PIL import Image
root=sys.argv[1]; heads=os.path.join(root,'public/players/heads')
pool=json.load(open(os.path.join(root,'src/lib/portraits/portraitPool.json')))
# cheek patches + nose bridge, as fractions of the (square, centred, studio) headshot
P=[(.33,.41,.40,.47),(.60,.41,.67,.47),(.47,.35,.53,.41)]
out={}
for h in pool:
  im=np.asarray(Image.open(os.path.join(heads,h['file'])).convert('RGB')).astype(float); H,W,_=im.shape
  px=np.concatenate([im[int(y0*H):int(y1*H), int(x0*W):int(x1*W)].reshape(-1,3) for x0,y0,x1,y1 in P])
  r,g,b=px[:,0],px[:,1],px[:,2]; lum=.3*r+.59*g+.11*b
  ok=(r>=g-4)&(g>=b-8)&(lum>25)&(lum<245)          # skin-ish: warm, not blown out or in shadow/beard
  sel=px[ok] if ok.sum()>50 else px
  l2=.3*sel[:,0]+.59*sel[:,1]+.11*sel[:,2]; lo,hi=np.percentile(l2,[10,70]); sel=sel[(l2>=lo)&(l2<=hi)]   # drop beard/shadow and specular highlights
  c=np.median(sel,axis=0); out[h['file']]='#%02x%02x%02x'%tuple(int(round(v)) for v in c)
json.dump(out, open(sys.argv[2],'w'), separators=(',',':'))
# contact sheet: 48 random faces with their swatch
random.seed(3); pick=random.sample(pool,48); S=128; sheet=Image.new('RGB',(8*S,6*(S+28)),'white')
for i,h in enumerate(pick):
  x,y=(i%8)*S,(i//8)*(S+28); sheet.paste(Image.open(os.path.join(heads,h['file'])).convert('RGB').resize((S,S)),(x,y))
  sheet.paste(Image.new('RGB',(S,26),out[h['file']]),(x,y+S))
sheet.save(sys.argv[3])
