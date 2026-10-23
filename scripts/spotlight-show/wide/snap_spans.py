"""Move ElevenLabs' per-line cuts (which tile the audio and often land
mid-word) to the pause between the lines. Same rule as snapLineCuts in
src/lib/spotlight/loudness.ts.  Usage: snap_spans.py <audio> <out.json>"""
import json, subprocess, numpy as np, sys
def pcm(f):
    b=subprocess.check_output(['ffmpeg','-v','error','-i',f,'-f','s16le','-ac','1','-ar','16000','-'])
    return np.frombuffer(b,np.int16).astype(np.float32)/32768
def snap(x, sr, lines, reach=0.7):
    """Score every 60 ms window within `reach` of a cut by its level plus a
    60 dB/s penalty for distance from the cut (levels below -40 dB all count
    as silence); only windows at least 35 dB under the peak count as pauses."""
    hop=sr//100; n=len(x)//hop
    rms=np.sqrt(np.mean(x[:n*hop].reshape(n,hop)**2,axis=1)); db=20*np.log10(rms+1e-9); db-=db.max()
    win=np.convolve(db, np.ones(6)/6, mode='valid')  # 60 ms windows, index k covers frames k..k+5
    cuts=[l[0] for l in lines]; dur=len(x)/sr
    for i in range(1,len(lines)):
        t=lines[i][0]; lo=max(0,int((t-reach)*100)); hi=min(len(win),int((t+reach)*100))
        best=None
        for k in range(lo,hi):
            if win[k]>-35: continue  # not a pause
            c=(k+3)/100; sc=max(win[k],-40)+60*abs(c-t)
            if best is None or sc<best[0]: best=(sc,c)
        if best: cuts[i]=best[1]
    return [[cuts[i], cuts[i+1] if i+1<len(lines) else max(lines[i][1],dur)] for i in range(len(lines))]
if __name__=='__main__':
    f=sys.argv[1]; lines=json.load(open(f+'.spans.json'))
    out=snap(pcm(f),16000,lines)
    json.dump(out, open(sys.argv[2],'w'))
    print(f, [(round(a,2),round(b,2)) for a,b in lines], '->', [(round(a,2),round(b,2)) for a,b in out])
