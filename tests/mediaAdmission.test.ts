import { describe, it, expect } from 'vitest';
import { imageHeaderDimensions, assertImagePixelBudget } from '../src/lib/imageDimensions';
import { sameStoredAssetMetadata } from '../src/lib/projectStore';
describe('image admission and lightweight saves',()=>{
 it('rejects high-pixel PNGs before any bitmap allocation',()=>{const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10]);b.set([73,72,68,82],12);const v=new DataView(b.buffer);v.setUint32(16,50000);v.setUint32(20,50000);expect(imageHeaderDimensions(b)).toEqual({width:50000,height:50000});expect(()=>assertImagePixelBudget(50000,50000)).toThrow(/decode limit/);});
 it('safely leaves unknown/truncated headers to the decoder',()=>{expect(imageHeaderDimensions(new Uint8Array([255,216,255,225,255,255]))).toBeNull();});
 it('recognizes JPEG frame dimensions without decompressing the artwork',()=>{const bytes=new Uint8Array([255,216,255,192,0,8,8,4,56,10,16,0,255,217]);expect(imageHeaderDimensions(bytes)).toEqual({width:2576,height:1080});});
 it('rewrites changed media metadata but reuses unchanged original records',()=>{const a={id:'a',order:0,path:'assets/a',name:'a.png',type:'image/png',size:9,sha256:'a'.repeat(64)};expect(sameStoredAssetMetadata(a,{...a})).toBe(true);for(const changed of [{size:10},{sha256:'b'.repeat(64)},{order:1},{name:'changed'},{path:'assets/b'}])expect(sameStoredAssetMetadata(a,{...a,...changed})).toBe(false);});
});
