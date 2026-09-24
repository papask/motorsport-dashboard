import json,os,subprocess,sys,imageio_ffmpeg
FF=imageio_ffmpeg.get_ffmpeg_exe()
S=os.path.dirname(os.path.abspath(__file__))
os.makedirs(S+'/clips2',exist_ok=True)
for d in sorted(os.listdir(S+'/rec2')):
    p=f'{S}/rec2/{d}'
    if not os.path.isdir(p): continue
    j=json.load(open(p+'/frames.json')); fr=j['frames']
    # frame timestamps relative to cast start; first frame shown from t0
    lines=[]
    ts=[f['t'] for f in fr]; base=j['t0']
    for i,f in enumerate(fr):
        start = base if i==0 else f['t']
        end = fr[i+1]['t'] if i+1<len(fr) else j['t1']
        lines.append(f"file '{p}/{f['file']}'\nduration {max(0.001,end-start):.4f}")
    lines.append(f"file '{p}/{fr[-1]['file']}'")
    open(p+'/list.txt','w').write('\n'.join(lines)+'\n')
    w=1920 if d.startswith('d') else 780
    subprocess.run([FF,'-y','-loglevel','error','-f','concat','-safe','0','-i',p+'/list.txt','-vf',f'fps=30,scale={w}:-2:flags=lanczos,format=yuv420p','-c:v','libx264','-crf','12','-preset','fast',f'{S}/clips2/{d}.mp4'],check=True)
    print(d, round(j['t1']-j['t0'],1))
