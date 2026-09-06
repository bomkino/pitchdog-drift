// Preserve actual recorded sources and their treatments; no synthetic replacement.
import {createServer} from 'vite';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=resolve(root,'build/native-sound');await mkdir(out,{recursive:true});
const server=await createServer({root,configFile:false,server:{middlewareMode:true},logLevel:'error'});
try{
 const cat=await server.ssrLoadModule('/src/sonic/catalog.ts'),palettes={},names=new Set();
 for(const palette of ['studio','cinematic','paper']){palettes[palette]={};for(const cue of cat.SONIC_CUES){palettes[palette][cue]=[];for(let i=0;i<cat.getSonicAssetVariantCount(palette,cue);i++){const s=cat.getSonicAssetSpec(palette,cue,i);names.add(s.name);palettes[palette][cue].push({name:s.name,trimStart:s.trimStart,trimEnd:s.trimEnd,gain:s.gain});}}}
 const files=[];
 for(const name of names){const bytes=Buffer.from((await readFile(resolve(root,'src/sonic/assets/recordings',name+'.b64'),'utf8')).trim(),'base64');await writeFile(resolve(out,name),bytes);files.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(resolve(out,'SoundCatalog.json'),JSON.stringify({palettes,files}));
 await cp(resolve(root,'src/sonic/assets/licenses'),resolve(out,'licenses'),{recursive:true});
 await cp(resolve(root,'src/sonic/assets/manifest.json'),resolve(out,'ORIGINAL_SOURCE_MANIFEST.json'));
 console.log(`Native sound: ${names.size} unchanged recorded sources.`);
}finally{await server.close();}
