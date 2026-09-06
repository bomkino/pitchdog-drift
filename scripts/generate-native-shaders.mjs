// Build-time translation of Drift's authored shaders. No JavaScript or WebKit
// enters the native application. SPIR-V reflection owns the buffer layout.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'build/native-shaders');await mkdir(out,{recursive:true});
const server=await createServer({root,configFile:false,server:{middlewareMode:true},logLevel:'error'});
try {
  const shaders=await server.ssrLoadModule('/src/engine/shaders.ts');
  const lens=await server.ssrLoadModule('/src/engine/lensShader.ts');
  const programs=[['slide','vert',shaders.slideVertexShader],['slide','frag',shaders.slideFragmentShader],
    ['shadow','vert',shaders.shadowVertexShader],['shadow','frag',shaders.shadowFragmentShader],
    ['background','vert',shaders.backgroundVertexShader],['background','frag',shaders.backgroundFragmentShader],
    ['lens','vert',lens.lensVertexShader],['lens','frag',lens.lensFragmentShader]];
  const fields=new Map([['modelViewMatrix','mat4'],['projectionMatrix','mat4'],['orthographicMatrix','mat4'],['uProjectionMix','float'],['uCrop','vec4'],['uIsShell','float'],['uShellColor','vec3']]);
  for(const [kind,stage,raw]of programs){const text=kind==='lens'?raw.replace(/\buVelocity\b/g,'uLensVelocity'):raw;for(const match of text.matchAll(/uniform\s+(\w+)\s+(\w+)\s*;/g)){if(match[1]==='sampler2D')continue;if(fields.has(match[2])&&fields.get(match[2])!==match[1])throw Error('Conflicting uniform '+match[2]);fields.set(match[2],match[1]);}}
  const block='layout(std140,set=0,binding=0) uniform DriftUniforms {\n'+[...fields].map(([name,type])=>`  ${type} ${name};`).join('\n')+'\n};\n';
  const helpers=`vec3 driftEncode(vec3 x) { return mix(12.92*x,1.055*pow(max(x,vec3(0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),x)); }
vec3 driftDecode(vec3 x) { return mix(x/12.92,pow((max(x,vec3(0))+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),x)); }
`;
  const entries=[],sources=[];
  for(const [kind,stage,raw]of programs){
    let text=kind==='lens'?raw.replace(/\buVelocity\b/g,'uLensVelocity'):raw;
    text=text.replace(/precision\s+\w+\s+\w+\s*;/g,'').replace(/uniform\s+\w+\s+\w+\s*;/g,'');
    const location={vUv:0,vSurfaceEnergy:1,vViewPosition:2};
    text=text.replace(/varying\s+(\w+)\s+(\w+)\s*;/g,(_,type,name)=>`layout(location=${location[name]}) ${stage==='vert'?'out':'in'} ${type} ${name};`);
    text=text.replace(/#include\s*<colorspace_fragment>/g,'driftOutput.rgb = driftEncode(driftOutput.rgb);');
    text=text.replace(/\bgl_FragColor\b/g,'driftOutput').replace(/gl_FragCoord\.xy/g,'vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y)');
    let prefix='#version 450\n'+block;
    if(stage==='vert'){
      prefix+='layout(location=0) in vec3 position;\nlayout(location=1) in vec2 uv;\n';
      if(kind==='slide')text=text.replace('gl_Position = projectionMatrix * viewPosition;','gl_Position = mix(projectionMatrix * viewPosition, orthographicMatrix * viewPosition, uProjectionMix);');
      if(kind==='shadow')text=text.replace('gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);','vec4 p=modelViewMatrix*vec4(position,1.0); gl_Position=mix(projectionMatrix*p,orthographicMatrix*p,uProjectionMix);');
    }else{
      prefix+='layout(location=0) out vec4 driftOutput;\n'+helpers;
      if(kind==='slide'){
        prefix+='layout(set=0,binding=1) uniform sampler2D uMap;\n';
        prefix+=`vec4 driftOriginal(vec2 point){if(uIsShell>0.5)return vec4(uShellColor,1);vec2 uv=uCrop.xy+vec2(point.x,1.0-point.y)*uCrop.zw;vec4 c=texture(uMap,uv);if(c.a<=0.00001)c.rgb=vec3(0);return c;}\n`;
        text=text.replace(/texture2D\(uMap,\s*clamp\(textureUv, 0\.0, 1\.0\)\)/g,'driftOriginal(clamp(textureUv,0.0,1.0))');
      }
      if(kind==='lens'){
        prefix+='layout(set=0,binding=1) uniform sampler2D uScene;\n';
        text=text.replace('return texture2D(uScene, clamp(uv, 0.0, 1.0));','vec4 c=texture(uScene,vec2(clamp(uv.x,0.0,1.0),1.0-clamp(uv.y,0.0,1.0)));c.rgb=driftDecode(c.rgb);return c;');
      }
    }
    if(/texture2D|#include|varying|precision/.test(text))throw Error('Untranslated shader syntax '+kind+' '+stage);
    const name=`drift_${kind}_${stage}`,file=resolve(out,`${name}.${stage}`),spv=file+'.spv';
    await writeFile(file,prefix+text);
    execFileSync('glslangValidator',['-V','--target-env','vulkan1.1','-S',stage,'-o',spv,file],{stdio:'inherit'});
    execFileSync('spirv-cross',[spv,'--msl','--msl-version','20100','--msl-decoration-binding','--rename-entry-point','main',name,stage,'--output',file+'.metal'],{stdio:'inherit'});
    const reflection=JSON.parse(execFileSync('spirv-cross',[spv,'--reflect'],{encoding:'utf8'}));
    const ubo=reflection.ubos.find(x=>x.name==='DriftUniforms');const members=reflection.types[ubo.type].members;
    entries.push({name,stage,bytes:ubo.block_size,members:members.map(x=>({name:x.name,type:x.type,offset:x.offset}))});
    sources.push({name,authoredSHA256:createHash('sha256').update(raw).digest('hex'),translatedSHA256:createHash('sha256').update(prefix+text).digest('hex')});
  }
  const schema=JSON.stringify(entries[0].members);if(entries.some(x=>JSON.stringify(x.members)!==schema))throw Error('Shader uniform layouts disagree.');
  await writeFile(resolve(out,'ShaderSchema.json'),JSON.stringify({bytes:entries[0].bytes,members:entries[0].members,entries:entries.map(x=>x.name),sources},null,2));
}finally{await server.close();}
