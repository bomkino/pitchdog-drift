@preconcurrency import Metal
@preconcurrency import MetalKit
@preconcurrency import CoreImage
import CoreGraphics
import Foundation
import simd
import DriftCore

private struct ShaderMember:Decodable {let name:String,type:String,offset:Int}
private struct ShaderSchema:Decodable {let bytes:Int,members:[ShaderMember]}
private struct Uniforms {
    var bytes:Data
    let offsets:[String:Int]
    init(schema:ShaderSchema){bytes=Data(count:(schema.bytes+15)/16*16);offsets=Dictionary(uniqueKeysWithValues:schema.members.map{($0.name,$0.offset)})}
    mutating func set(_ name:String,_ values:[Float]){guard let offset=offsets[name] else{return};values.withUnsafeBytes{buffer in bytes.replaceSubrange(offset..<(offset+buffer.count),with:buffer)}}
    mutating func set(_ name:String,_ value:Double){set(name,[Float(value)])}
    mutating func set(_ name:String,_ matrix:simd_float4x4){var value=matrix;withUnsafeBytes(of:&value){buffer in guard let offset=offsets[name] else{return};bytes.replaceSubrange(offset..<(offset+buffer.count),with:buffer)}}
    mutating func color(_ name:String,_ hex:String){let v=(try? RGBA(hex:hex)) ?? RGBA(0,0,0);func linear(_ x:Double)->Float{Float(x<=0.04045 ? x/12.92:pow((x+0.055)/1.055,2.4))};set(name,[linear(v.r),linear(v.g),linear(v.b)])}
}
private func translation(_ x:Float,_ y:Float,_ z:Float)->simd_float4x4{var m=matrix_identity_float4x4;m.columns.3=SIMD4(x,y,z,1);return m}
private func scaling(_ x:Float,_ y:Float,_ z:Float=1)->simd_float4x4{simd_float4x4(diagonal:SIMD4(x,y,z,1))}
private func rotate(_ angle:Double,_ axis:SIMD3<Float>)->simd_float4x4{simd_float4x4(simd_quatf(angle:Float(angle),axis:axis))}
private func perspective(width:Double,height:Double,camera:Double)->simd_float4x4{
    let y=1/tan(Float(35*Double.pi/360)),x=y/Float(width/height),near:Float=1,far=Float(camera+50000),z=far/(near-far)
    return simd_float4x4(SIMD4(x,0,0,0),SIMD4(0,y,0,0),SIMD4(0,0,z,-1),SIMD4(0,0,z*near,0))
}
private func orthographic(width:Double,height:Double)->simd_float4x4{
    let near:Float=0,far:Float=100000
    return simd_float4x4(SIMD4(Float(2/width),0,0,0),SIMD4(0,Float(2/height),0,0),SIMD4(0,0,1/(near-far),0),SIMD4(0,0,near/(near-far),1))
}
public final class RenderedSurface:@unchecked Sendable {
    public let texture:any MTLTexture,frame:DirectedFrame
    public init(texture:any MTLTexture,frame:DirectedFrame){self.texture=texture;self.frame=frame}
}
/// Worker confined. All authored passes share linear premultiplied pixels. One
/// completed command buffer owns a frame; no texture or source is recycled early.
public final class NativeRenderer {
    public let device:any MTLDevice
    public let context:CIContext
    public let sources:MediaFrames
    private let queue:any MTLCommandQueue,sampler:any MTLSamplerState
    private let pipelines:[String:any MTLRenderPipelineState],copyPipeline:any MTLRenderPipelineState
    private let grid:any MTLBuffer,quad:any MTLBuffer
    private let schema:ShaderSchema,catalog:CreativeCatalog
    private let linear=CGColorSpace(name:CGColorSpace.extendedLinearSRGB)!
    private var textures:[String:any MTLTexture]=[:],textureOrder:[String]=[],textureBytes=0
    private let gridCount=32*18*6
    public init(resources:URL?=nil,cancellation:MediaCancellation=MediaCancellation())throws{
        guard let device=MTLCreateSystemDefaultDevice(),let queue=device.makeCommandQueue() else{throw NativeFailure.message("A Metal device is required to render Drift.")}
        self.device=device;self.queue=queue;sources=MediaFrames(cancellation:cancellation);catalog=try CreativeCatalog.load()
        context=CIContext(mtlDevice:device,options:[.cacheIntermediates:false,.workingColorSpace:linear])
        let directory=resources ?? Bundle.main.resourceURL!
        schema=try JSONDecoder().decode(ShaderSchema.self,from:Data(contentsOf:directory.appendingPathComponent("ShaderSchema.json")))
        let library=try device.makeLibrary(URL:directory.appendingPathComponent("Drift.metallib"))
        let descriptor=MTLVertexDescriptor();descriptor.attributes[0].format = .float3;descriptor.attributes[0].offset=0;descriptor.attributes[0].bufferIndex=1
        descriptor.attributes[1].format = .float2;descriptor.attributes[1].offset=12;descriptor.attributes[1].bufferIndex=1;descriptor.layouts[1].stride=20
        var made:[String:any MTLRenderPipelineState]=[:]
        for name in ["slide","shadow","background","lens"]{
            let p=MTLRenderPipelineDescriptor();p.vertexFunction=library.makeFunction(name:"drift_\(name)_vert");p.fragmentFunction=library.makeFunction(name:"drift_\(name)_frag");p.vertexDescriptor=descriptor
            let a=p.colorAttachments[0]!;a.pixelFormat = .rgba16Float;a.isBlendingEnabled=name != "lens"
            a.sourceRGBBlendFactor = .one;a.destinationRGBBlendFactor = .oneMinusSourceAlpha;a.sourceAlphaBlendFactor = .one;a.destinationAlphaBlendFactor = .oneMinusSourceAlpha
            made[name]=try device.makeRenderPipelineState(descriptor:p)
        }
        pipelines=made
        let copySource="""
        #include <metal_stdlib>
        using namespace metal;
        struct V {float4 p [[position]];float2 uv;};
        vertex V copyVertex(uint i [[vertex_id]]){float2 p[3]={float2(-1,-1),float2(3,-1),float2(-1,3)};V v;v.p=float4(p[i],0,1);v.uv=float2((p[i].x+1)*0.5,1-(p[i].y+1)*0.5);return v;}
        fragment float4 copyFragment(V v [[stage_in]],texture2d<float> t [[texture(0)]]){constexpr sampler s(filter::linear,address::clamp_to_edge);return t.sample(s,v.uv);}
        """
        let copyLibrary=try device.makeLibrary(source:copySource,options:nil),copy=MTLRenderPipelineDescriptor()
        copy.vertexFunction=copyLibrary.makeFunction(name:"copyVertex");copy.fragmentFunction=copyLibrary.makeFunction(name:"copyFragment")
        copy.colorAttachments[0].pixelFormat = .rgba16Float;copy.colorAttachments[0].isBlendingEnabled=true
        copy.colorAttachments[0].sourceRGBBlendFactor = .one;copy.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha;copy.colorAttachments[0].sourceAlphaBlendFactor = .one;copy.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
        copyPipeline=try device.makeRenderPipelineState(descriptor:copy)
        let samplerDescriptor=MTLSamplerDescriptor();samplerDescriptor.minFilter = .linear;samplerDescriptor.magFilter = .linear;samplerDescriptor.sAddressMode = .clampToEdge;samplerDescriptor.tAddressMode = .clampToEdge
        guard let s=device.makeSamplerState(descriptor:samplerDescriptor) else{throw NativeFailure.message("The GPU sampler could not be created.")};sampler=s
        func vertices(_ columns:Int,_ rows:Int,_ full:Bool)->[Float]{var data:[Float]=[];for y in 0..<rows{for x in 0..<columns{for (dx,dy) in [(0,0),(1,0),(0,1),(1,0),(1,1),(0,1)]{let u=Float(x+dx)/Float(columns),v=Float(y+dy)/Float(rows);data += [(u-0.5)*(full ? 2:1),(v-0.5)*(full ? 2:1),0,u,v]}}};return data}
        let g=vertices(32,18,false),q=vertices(1,1,true)
        guard let grid=device.makeBuffer(bytes:g,length:g.count*4,options:.storageModeShared),let quad=device.makeBuffer(bytes:q,length:q.count*4,options:.storageModeShared) else{throw NativeFailure.message("The GPU geometry could not be created.")}
        self.grid=grid;self.quad=quad
    }
    public func clear(){sources.clear();textures=[:];textureOrder=[];textureBytes=0;context.clearCaches()}
    private func texture(_ width:Int,_ height:Int)throws->any MTLTexture{
        let d=MTLTextureDescriptor.texture2DDescriptor(pixelFormat:.rgba16Float,width:width,height:height,mipmapped:false);d.usage=[.renderTarget,.shaderRead,.shaderWrite];d.storageMode = .private
        guard let texture=device.makeTexture(descriptor:d) else{throw NativeFailure.message("Not enough GPU memory for this frame.")};return texture
    }
    private func sourceTexture(slide:Slide,snapshot:RenderSnapshot,seconds:Double,dimension:Int)throws->any MTLTexture{
        let original=try snapshot.project.original(for:slide),image=try sources.image(original:original,workspace:snapshot.workspace,playback:slide.playback,seconds:seconds,maximumDimension:dimension),key=sources.frameToken
        if let texture=textures[key]{textureOrder.removeAll{$0==key};textureOrder.append(key);return texture}
        let width=max(1,Int(ceil(image.extent.width))),height=max(1,Int(ceil(image.extent.height))),cost=width*height*8
        let texture=try self.texture(width,height)
        context.render(image,to:texture,commandBuffer:nil,bounds:CGRect(x:0,y:0,width:width,height:height),colorSpace:linear)
        while textureBytes+cost>192*1024*1024,let oldest=textureOrder.first{textureOrder.removeFirst();if let removed=textures.removeValue(forKey:oldest){textureBytes-=removed.width*removed.height*8}}
        if cost<=192*1024*1024{textures[key]=texture;textureOrder.append(key);textureBytes+=cost};return texture
    }
    private func encoder(_ command:any MTLCommandBuffer,_ texture:any MTLTexture,clear:Bool)throws->any MTLRenderCommandEncoder{
        let pass=MTLRenderPassDescriptor();pass.colorAttachments[0].texture=texture;pass.colorAttachments[0].loadAction=clear ? .clear:.load;pass.colorAttachments[0].storeAction = .store;pass.colorAttachments[0].clearColor=MTLClearColorMake(0,0,0,0)
        guard let encoder=command.makeRenderCommandEncoder(descriptor:pass) else{throw NativeFailure.message("The GPU render pass could not start.")};encoder.setCullMode(.none);return encoder
    }
    private func draw(_ encoder:any MTLRenderCommandEncoder,kind:String,uniforms:Uniforms,source:(any MTLTexture)?=nil){
        encoder.setRenderPipelineState(pipelines[kind]!);encoder.setVertexBuffer(kind=="slide" || kind=="shadow" ? grid:quad,offset:0,index:1)
        uniforms.bytes.withUnsafeBytes{ptr in encoder.setVertexBytes(ptr.baseAddress!,length:ptr.count,index:0);encoder.setFragmentBytes(ptr.baseAddress!,length:ptr.count,index:0)}
        if let source{encoder.setFragmentTexture(source,index:1);encoder.setFragmentSamplerState(sampler,index:1)}
        encoder.drawPrimitives(type:.triangle,vertexStart:0,vertexCount:kind=="slide" || kind=="shadow" ? gridCount:6)
    }
    private func baseUniforms(_ snapshot:RenderSnapshot,_ frame:DirectedFrame,width:Int,height:Int)->Uniforms{
        var u=Uniforms(schema:schema);let p=snapshot.project,c=p.creative,w=Double(p.canvas.width),h=Double(p.canvas.height),camera=h/(2*tan(35*Double.pi/360))
        u.set("projectionMatrix",perspective(width:w,height:h,camera:camera));u.set("orthographicMatrix",orthographic(width:w,height:h));u.set("uResolution",[Float(width),Float(height)])
        u.set("uVelocity",frame.velocity);u.set("uAcceleration",frame.acceleration);u.set("uAxis",c.motion.transport.axis=="vertical" ? 1:0)
        let reduced=p.direction.reduceAuthoredMotion,seamless=p.direction.mode == .loop || c.motion.seamless.enabled
        let phase=reduced ? 0:seamless ? frame.outputSeconds/snapshot.plan.schedule.rate.seconds(frame:snapshot.plan.schedule.totalFrames)*2*Double.pi*max(1,c.motion.seamless.loops):frame.outputSeconds*c.atmosphere.motion*0.72
        u.set("uTravelPhase",frame.travelPhase);u.set("uPhase",phase)
        let compositions=catalog.backgroundCompositions[c.atmosphere.family] ?? [],composition=compositions.firstIndex{$0.id==c.atmosphere.composition} ?? 0
        let seed=c.atmosphere.composition=="legacy-v1" ? c.atmosphere.seedOffset:10000+Double(Int(c.atmosphere.seedOffset.rounded())%100)*8+Double(composition)
        u.set("uSeed",seed);u.set("uGrainSeed",positiveModulo(seed,4093));u.set("uGrainFrame",reduced ? 0:floor(Double(frame.index)*min(12,Double(p.output.rate.numerator)/Double(p.output.rate.denominator))/(Double(p.output.rate.numerator)/Double(p.output.rate.denominator))))
        return u
    }
    private func background(_ encoder:any MTLRenderCommandEncoder,_ snapshot:RenderSnapshot,_ frame:DirectedFrame,_ base:Uniforms){
        let p=snapshot.project,a=p.creative.atmosphere,l=p.creative.lens
        guard !p.transparent && a.enabled else{return}
        var u=base;u.color("uColorA",a.colourA);u.color("uColorB",a.colourB);u.color("uAccent",a.accent)
        u.set("uMode",Double(["solid","gradient","aura","paper","void","cutting-map","grid","wave","atelier"].firstIndex(of:a.family) ?? 0))
        u.set("uIntensity",a.intensity);u.set("uMotion",a.motion);u.set("uGrain",min(0.6,a.grain+(l.enabled ? l.cameraGrain*l.presence*0.18:0)))
        u.set("uVignette",a.vignette);u.set("uOpacity",frame.backgroundOpacity);draw(encoder,kind:"background",uniforms:u)
    }
    private func card(_ encoder:any MTLRenderCommandEncoder,_ pose:CardPose,_ source:any MTLTexture,_ snapshot:RenderSnapshot,_ frame:DirectedFrame,_ base:Uniforms){
        guard pose.opacity>0.00001 else{return}
        let p=snapshot.project,c=p.creative,m=c.material,l=c.lighting,w=pose.width,h=pose.height,camera=Double(p.canvas.height)/(2*tan(35*Double.pi/360))
        var u=base
        let rotation=rotate(pose.rotationZ,SIMD3(0,0,1))*rotate(pose.rotationY,SIMD3(0,1,0))*rotate(pose.rotationX,SIMD3(1,0,0))
        let view=translation(Float(pose.x),Float(pose.y),Float(pose.z-camera))*rotation
        u.set("modelViewMatrix",view*scaling(Float(w),Float(h)));u.set("uProjectionMix",pose.projectionMix)
        u.set("uSizePx",[Float(w),Float(h)]);u.set("uPlaneAspect",w/h);u.set("uTextureAspect",Double(source.width)/Double(source.height)*pose.crop.width/pose.crop.height)
        u.set("uCrop",[Float(pose.crop.x),Float(pose.crop.y),Float(pose.crop.width),Float(pose.crop.height)])
        u.set("uFit",pose.fit == .fit ? 1:0);u.set("uFocal",[Float(pose.focalX),Float(pose.focalY)])
        u.set("uRadiusPx",pose.radius);u.set("uSmoothing",pose.smoothing);u.set("uBorderPx",pose.borderWidth);u.color("uBorderColor",pose.borderColor);u.set("uBorderOpacity",pose.borderOpacity)
        u.set("uLegacyContainMatte",0);u.color("uMatteColor",pose.matteColor);u.set("uMatteOpacity",pose.matteOpacity);u.set("uOpacity",pose.opacity)
        u.set("uDistortion",pose.protected ? 0:m.flex);u.set("uPathBend",pose.pathBend);u.set("uPhase",Double(pose.slot));u.set("uSlideSeed",Double(pose.sourceIndex+1)*0.61803398875)
        u.set("uSurface",Double(["card","paper","silk","gel"].firstIndex(of:m.surface) ?? 0));u.set("uRoughness",m.roughness);u.set("uSheen",m.sheen);u.set("uMicrotexture",m.finish.microtexture)
        var az=l.azimuth*Double.pi/180;let elevation=l.elevation*Double.pi/180
        if l.motionMode=="orbit"{az += frame.travelPhase*l.motionSpeed};if l.motionMode=="sweep"{az += sin(frame.travelPhase*l.motionSpeed)*0.42}
        let pulse=l.motionMode=="flicker" ? 0.91+0.09*sin(frame.travelPhase*3+Double(pose.sourceIndex)*1.71):l.motionMode=="breathe" ? 0.96+0.04*sin(frame.travelPhase):1
        u.set("uLightingEnabled",l.enabled && !pose.protected ? 1:0);u.color("uKeyColor",l.keyColor);u.color("uFillColor",l.fillColor)
        u.set("uLightDirection",[Float(cos(elevation)*cos(az)),Float(sin(elevation)),Float(cos(elevation)*sin(az))]);u.set("uKeyIntensity",l.keyIntensity*pulse);u.set("uFillIntensity",l.fillIntensity);u.set("uRimIntensity",l.rimIntensity)
        u.set("uArtworkProtection",pose.protected || l.presetId != "custom" ? 1:l.artworkProtection)
        if pose.shadowOpacity>0.001{
            var shadow=u;let sigma=max(1,pose.shadowSoftness*0.34),margin=ceil(sigma*sqrt(2*log(pose.shadowOpacity/0.001))),sw=w+margin*2,sh=h+margin*2
            shadow.set("modelViewMatrix",translation(Float(pose.x+pose.shadowX),Float(pose.y+pose.shadowY),Float(pose.z-camera-8))*rotation*scaling(Float(sw),Float(sh)))
            shadow.set("uCanvasSizePx",[Float(sw),Float(sh)]);shadow.set("uCardSizePx",[Float(w),Float(h)]);shadow.set("uSoftnessPx",pose.shadowSoftness);shadow.set("uOpacity",pose.shadowOpacity*pose.opacity);shadow.color("uColor",l.shadowColor)
            draw(encoder,kind:"shadow",uniforms:shadow)
        }
        let thickness=pose.protected ? 0:min(w,h)*m.thickness*0.34
        if thickness>0.05{
            var shell=u;shell.set("uIsShell",1);shell.set("modelViewMatrix",view*translation(0,0,Float(-thickness))*scaling(Float(w),Float(h)))
            shell.color("uShellColor",m.surface=="paper" ? "#b9aa94":m.surface=="silk" ? "#362a34":m.surface=="gel" ? "#1b3030":"#191612");draw(encoder,kind:"slide",uniforms:shell,source:source)
        }
        draw(encoder,kind:"slide",uniforms:u,source:source)
    }
    private func lens(_ source:any MTLTexture,into target:any MTLTexture,command:any MTLCommandBuffer,snapshot:RenderSnapshot,frame:DirectedFrame,base:Uniforms)throws{
        let e=try encoder(command,target,clear:true);defer{e.endEncoding()};let l=snapshot.project.creative.lens
        if !l.enabled || l.presence<=0{e.setRenderPipelineState(copyPipeline);e.setFragmentTexture(source,index:0);e.drawPrimitives(type:.triangle,vertexStart:0,vertexCount:3);return}
        var u=base;u.set("uPresence",l.presence);u.set("uFocus",l.focus);u.set("uSmear",l.directionalSmear);u.set("uChromatic",l.chromaticSeparation);u.set("uBloom",l.bloom);u.set("uHalation",l.halation);u.set("uFlare",l.flare);u.set("uCurvature",l.curvature);u.set("uGateWeave",l.gateWeave);u.set("uVignette",l.vignette)
        u.set("uLensVelocity",snapshot.project.creative.motion.transport.axis=="vertical" ? [0,Float(-frame.velocity)]:[Float(frame.velocity),0]);draw(e,kind:"lens",uniforms:u,source:source)
    }
    public func render(_ snapshot:RenderSnapshot,frame:Int64,maximumDimension:Int?=nil,interaction:Double=0)throws->RenderedSurface{
        try sources.cancellation.check();let p=snapshot.project,value=try snapshot.plan.evaluate(frame:frame,interaction:interaction)
        let factor=maximumDimension.map{min(1,Double($0)/Double(max(p.canvas.width,p.canvas.height)))} ?? 1
        let width=max(1,Int((Double(p.canvas.width)*factor).rounded())),height=max(1,Int((Double(p.canvas.height)*factor).rounded()))
        let scene=try texture(width,height),result=try texture(width,height),uniforms=baseUniforms(snapshot,value,width:width,height:height)
        var prepared:[String:any MTLTexture]=[:]
        let slideMap=Dictionary(uniqueKeysWithValues:p.slides.map{($0.id,$0)})
        // One slide may appear at several scales (sequence, Pin, Spotlight).
        // Prepare at the largest demand before drawing any occurrence.
        var demands=SourceResolutionDemand()
        for pose in value.cards where pose.opacity>0.00001{
            demands.include(id:pose.slideID,width:pose.width,height:pose.height,scale:factor)
        }
        for (id,dimension) in demands.dimensions.sorted(by:{$0.key<$1.key}){
            guard let slide=slideMap[id] else{continue}
            prepared[id]=try sourceTexture(slide:slide,snapshot:snapshot,seconds:value.outputSeconds,dimension:dimension)
        }
        try sources.cancellation.check();guard let command=queue.makeCommandBuffer() else{throw NativeFailure.message("The GPU command could not start.")}
        let protected=value.cards.filter{$0.protected},unprotected=value.cards.filter{!$0.protected}
        let under=protected.filter{!$0.presentationPriority && p.pin?.aboveSlides==false},over=protected.filter{$0.presentationPriority || p.pin?.aboveSlides != false}
        if under.isEmpty{
            let e=try encoder(command,scene,clear:true);background(e,snapshot,value,uniforms)
            for pose in unprotected{if let source=prepared[pose.slideID]{card(e,pose,source,snapshot,value,uniforms)}};e.endEncoding()
            try lens(scene,into:result,command:command,snapshot:snapshot,frame:value,base:uniforms)
        }else{
            let e=try encoder(command,scene,clear:true);background(e,snapshot,value,uniforms);e.endEncoding()
            try lens(scene,into:result,command:command,snapshot:snapshot,frame:value,base:uniforms)
            let pe=try encoder(command,result,clear:false);for pose in under{if let source=prepared[pose.slideID]{card(pe,pose,source,snapshot,value,uniforms)}};pe.endEncoding()
            let foreground=try texture(width,height),treated=try texture(width,height),fe=try encoder(command,foreground,clear:true)
            for pose in unprotected{if let source=prepared[pose.slideID]{card(fe,pose,source,snapshot,value,uniforms)}};fe.endEncoding()
            try lens(foreground,into:treated,command:command,snapshot:snapshot,frame:value,base:uniforms)
            let ce=try encoder(command,result,clear:false);ce.setRenderPipelineState(copyPipeline);ce.setFragmentTexture(treated,index:0);ce.drawPrimitives(type:.triangle,vertexStart:0,vertexCount:3);ce.endEncoding()
        }
        let e=try encoder(command,result,clear:false);for pose in over{if let source=prepared[pose.slideID]{card(e,pose,source,snapshot,value,uniforms)}};e.endEncoding()
        command.commit();command.waitUntilCompleted();try sources.cancellation.check();try check(command.status == .completed,command.error?.localizedDescription ?? "The GPU did not finish the frame.")
        return RenderedSurface(texture:result,frame:value)
    }
    public func image(_ surface:RenderedSurface)throws->CGImage{
        guard let input=CIImage(mtlTexture:surface.texture,options:[.colorSpace:linear]) else{throw NativeFailure.message("The native frame could not be read.")}
        let image=input.transformed(by:CGAffineTransform(translationX:0,y:CGFloat(surface.texture.height)).scaledBy(x:1,y:-1))
        guard let result=context.createCGImage(image,from:image.extent,format:.RGBA8,colorSpace:CGColorSpace(name:CGColorSpace.sRGB)!) else{throw NativeFailure.message("The frame could not be encoded as an image.")};return result
    }
    public func write(_ surface:RenderedSurface,into buffer:CVPixelBuffer)throws{
        guard let input=CIImage(mtlTexture:surface.texture,options:[.colorSpace:linear]) else{throw NativeFailure.message("The output frame could not be read.")}
        let image=input.transformed(by:CGAffineTransform(translationX:0,y:CGFloat(surface.texture.height)).scaledBy(x:1,y:-1))
        context.render(image,to:buffer,bounds:image.extent,colorSpace:CGColorSpace(name:CGColorSpace.itur_709)!)
    }
}
