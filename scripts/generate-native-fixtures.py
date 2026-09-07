#!/usr/bin/env python3
"""Synthetic, non-client media for the exact packaged Mac self-test."""
from pathlib import Path
import subprocess, shutil, base64, json, hashlib, os, struct, zlib
root=Path(__file__).resolve().parents[1]
out=root/'build/native-fixtures';out.mkdir(parents=True,exist_ok=True)
ffmpeg=shutil.which('ffmpeg')
full=Path('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg')
if full.exists(): ffmpeg=str(full)
if not ffmpeg: raise SystemExit('Build fixture tool ffmpeg-full is missing.')
def run(args):subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y',*args],check=True)
def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
pixels=bytearray()
for y in range(256):
    pixels.append(0)
    for x in range(320): pixels.extend(((255,0,0,255) if x<160 else (0,255,0,255)) if y<128 else ((0,0,255,255) if x<160 else (255,255,0,255)))
(out/'Still.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',320,256,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b''))
run(['-f','lavfi','-i','color=red@0.5:size=320x256,format=rgba','-frames:v','1','-c:v','libwebp','-lossless','1',str(out/'Alpha.webp')])
run(['-f','lavfi','-i','testsrc2=size=320x256:rate=4:duration=1','-c:v','libwebp_anim','-lossless','1','-loop','0',str(out/'Animation.webp')])
for codec,name in [('libvpx','VP8.webm'),('libvpx-vp9','VP9.webm'),('libx264','Video.mp4')]:
    run(['-f','lavfi','-i','testsrc2=size=320x256:rate=12:duration=1','-c:v',codec,'-g','6','-pix_fmt','yuv420p','-an',str(out/name)])
files=[]
for f in sorted(out.iterdir()):
    if f.is_file() and f.suffix in ['.png','.webp','.webm','.mp4']:files.append({'name':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size})
(out/'ORIGINALS.json').write_text(json.dumps(files,indent=2)+'\n')
print('Synthetic fixture originals:',len(files))
