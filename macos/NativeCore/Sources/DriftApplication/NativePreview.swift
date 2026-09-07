import SwiftUI
import AppKit
@preconcurrency import MetalKit
import DriftCore
import DriftNative
import simd

private struct PreviewRequest:Sendable {
    let snapshot:RenderSnapshot,frame:Int64,revision:UInt64,seek:UInt64,dimension:Int
}
private actor PreviewWorker {
    private var renderer:NativeRenderer?
    func render(_ request:PreviewRequest)throws->RenderedSurface {
        if renderer==nil{renderer=try NativeRenderer()}
        return try renderer!.render(request.snapshot,frame:request.frame,maximumDimension:request.dimension)
    }
    func clear(){renderer?.clear();renderer=nil}
}
struct NativeCanvas:NSViewRepresentable {
    @ObservedObject var session:EditorSession
    @ObservedObject var transport:Transport
    func makeNSView(context:Context)->CanvasView {let view=CanvasView();view.session=session;view.transport=transport;return view}
    func updateNSView(_ view:CanvasView,context:Context){view.session=session;view.transport=transport;view.request()}
    static func dismantleNSView(_ view:CanvasView,coordinator:()){view.stop()}
}
@MainActor final class CanvasView:MTKView, @preconcurrency MTKViewDelegate {
    weak var session:EditorSession?
    weak var transport:Transport?
    private let worker=PreviewWorker()
    private var surface:RenderedSurface?,canvas:CanvasSize?
    var displayedFrame:Int64?{surface?.frame.index}
    private var pending:PreviewRequest?,active:Task<Void,Never>?,ticket=UUID(),lastIdentity=""
    private var pipeline:(any MTLRenderPipelineState)?,queue:(any MTLCommandQueue)?
    private var pan=CGPoint.zero,lastZoom=0.0
    private var requested:PreviewRequest?
    private var mouseStart:CGPoint?,pinStart:Pin?,focalStart:(Double,Double)?,gesture=false
    private var gestureTicket:EditTicket?,gestureTargets=Set<String>()
    private var pressure:DispatchSourceMemoryPressure?
    private var suspended=false
    override var acceptsFirstResponder:Bool{true}
    override var isFlipped:Bool{true}
    init(){
        let device=MTLCreateSystemDefaultDevice()
        super.init(frame:.zero,device:device)
        colorPixelFormat = .bgra8Unorm_srgb;framebufferOnly=true;isPaused=true;enableSetNeedsDisplay=true;autoResizeDrawable=true;delegate=self
        clearColor=MTLClearColorMake(0.055,0.055,0.055,1)
        setAccessibilityElement(true);setAccessibilityRole(.image);setAccessibilityLabel("Drift canvas")
        layer?.isOpaque=true
        do{
            guard let device else{throw NativeFailure.message("Metal is unavailable on this Mac.")}
            queue=device.makeCommandQueue()
            let source="""
            #include <metal_stdlib>
            using namespace metal;
            struct V{float4 position [[position]];float2 uv;};
            vertex V presentVertex(uint i [[vertex_id]]){float2 p[3]={float2(-1,-1),float2(3,-1),float2(-1,3)};V v;v.position=float4(p[i],0,1);v.uv=float2((p[i].x+1)*0.5,1-(p[i].y+1)*0.5);return v;}
            fragment float4 presentFragment(V v [[stage_in]],texture2d<float> image [[texture(0)]],constant float2 &size [[buffer(0)]]){constexpr sampler s(filter::linear,address::clamp_to_edge);float4 c=image.sample(s,v.uv);float2 cell=floor(v.uv*size/12.0);float checker=fmod(cell.x+cell.y,2.0)<1?0.22:0.32;return float4(c.rgb+checker*(1-c.a),1);}
            """
            let library=try device.makeLibrary(source:source,options:nil),p=MTLRenderPipelineDescriptor()
            p.vertexFunction=library.makeFunction(name:"presentVertex");p.fragmentFunction=library.makeFunction(name:"presentFragment");p.colorAttachments[0].pixelFormat=colorPixelFormat
            pipeline=try device.makeRenderPipelineState(descriptor:p)
        }catch{Task{@MainActor [weak self] in self?.session?.issue=error.localizedDescription}}
        let pressure=DispatchSource.makeMemoryPressureSource(eventMask:[.warning,.critical],queue:.main)
        pressure.setEventHandler{[weak self] in MainActor.assumeIsolated{guard let self else{return};self.ticket=UUID();self.lastIdentity="";Task{await self.worker.clear()};self.request()}}
        pressure.resume();self.pressure=pressure
        NSWorkspace.shared.notificationCenter.addObserver(self,selector:#selector(sleep),name:NSWorkspace.willSleepNotification,object:nil)
        NSWorkspace.shared.notificationCenter.addObserver(self,selector:#selector(wake),name:NSWorkspace.didWakeNotification,object:nil)
    }
    required init(coder:NSCoder){fatalError("Programmatic view")}
    func stop(){suspended=true;ticket=UUID();pending=nil;active?.cancel();pressure?.cancel();pressure=nil;NSWorkspace.shared.notificationCenter.removeObserver(self);Task{await worker.clear()}}
    @objc private func sleep(){suspended=true;transport?.pause();ticket=UUID();pending=nil}
    @objc private func wake(){suspended=false;lastIdentity="";request()}
    override func viewDidMoveToWindow(){super.viewDidMoveToWindow();lastIdentity="";request()}
    override func viewDidChangeBackingProperties(){super.viewDidChangeBackingProperties();lastIdentity="";ticket=UUID();request()}
    override func setFrameSize(_ size:NSSize){super.setFrameSize(size);lastIdentity="";request()}
    func mtkView(_ view:MTKView,drawableSizeWillChange size:CGSize){lastIdentity="";request()}
    private var contentRect:CGRect {
        guard let canvas=canvas ?? session?.project.canvas else{return bounds}
        let scale=(transport?.zoom ?? 0)==0 ? min(bounds.width/Double(canvas.width),bounds.height/Double(canvas.height)):(transport?.zoom ?? 1)/(window?.backingScaleFactor ?? 1)
        let w=Double(canvas.width)*scale,h=Double(canvas.height)*scale
        return CGRect(x:(bounds.width-w)/2+pan.x,y:(bounds.height-h)/2+pan.y,width:w,height:h)
    }
    func request(){
        guard !suspended,let session,let transport,bounds.width>1,bounds.height>1 else{return}
        if window != nil && window?.occlusionState.contains(.visible)==false && transport.playing{return}
        if lastZoom != transport.zoom{pan = .zero;lastZoom=transport.zoom;ticket=UUID()}
        let p=session.displaySnapshot.project,fit=min(bounds.width/Double(p.canvas.width),bounds.height/Double(p.canvas.height)),backing=window?.backingScaleFactor ?? 1
        let scale=transport.zoom==0 ? fit*backing*transport.quality:transport.zoom
        let dimension=max(64,min(8192,Int(ceil(Double(max(p.canvas.width,p.canvas.height))*min(1,scale)/128))*128))
        let identity="\(p.id)/\(session.presentationRevision)/\(transport.seekEpoch)/\(dimension)"
        if identity != lastIdentity{ticket=UUID();lastIdentity=identity;requested=nil}
        let value=PreviewRequest(snapshot:session.displaySnapshot,frame:min(transport.frame,session.displaySnapshot.plan.schedule.totalFrames-1),revision:session.presentationRevision,seek:transport.seekEpoch,dimension:dimension)
        if requested?.frame==value.frame && requested?.revision==value.revision && requested?.seek==value.seek && requested?.dimension==value.dimension && requested?.snapshot.project.id==p.id{needsDisplay=true;return}
        requested=value;pending=value;renderNext()
    }
    private func renderNext(){
        guard active==nil,let value=pending,!suspended else{return};pending=nil
        let current=ticket,worker=worker
        active=Task{[weak self] in
            do{
                let result=try await worker.render(value)
                if let self,!Task.isCancelled,self.ticket==current,!self.suspended{
                    self.surface=result;self.canvas=value.snapshot.project.canvas;self.needsDisplay=true
                    self.setAccessibilityValue("Frame \(value.frame), \(value.snapshot.project.slides.count) slides")
                }
            }catch is CancellationError{}catch{if let self,self.ticket==current{self.session?.issue=error.localizedDescription;self.transport?.pause()}}
            guard let self else{return};self.active=nil;self.renderNext()
        }
    }
    func draw(in view:MTKView){
        guard let pass=currentRenderPassDescriptor,let drawable=currentDrawable,let command=queue?.makeCommandBuffer(),let encoder=command.makeRenderCommandEncoder(descriptor:pass) else{return}
        if let surface,let pipeline{
            let rect=contentRect,backing=window?.backingScaleFactor ?? 1
            encoder.setViewport(MTLViewport(originX:rect.minX*backing,originY:rect.minY*backing,width:rect.width*backing,height:rect.height*backing,znear:0,zfar:1))
            encoder.setRenderPipelineState(pipeline);encoder.setFragmentTexture(surface.texture,index:0)
            var size=SIMD2<Float>(Float(rect.width*backing),Float(rect.height*backing));encoder.setFragmentBytes(&size,length:MemoryLayout<SIMD2<Float>>.stride,index:0)
            encoder.drawPrimitives(type:.triangle,vertexStart:0,vertexCount:3)
        }
        encoder.endEncoding();command.present(drawable);command.commit()
    }
    private func corners(_ pose:CardPose)->[CGPoint]{
        guard let canvas else{return []};let w=Double(canvas.width),h=Double(canvas.height),camera=h/(2*tan(35*Double.pi/360)),rect=contentRect
        func rotate(_ v:SIMD3<Double>)->SIMD3<Double>{
            let a=pose.rotationZ,b=pose.rotationY,c=pose.rotationX
            let x=SIMD3(v.x,v.y*cos(c)-v.z*sin(c),v.y*sin(c)+v.z*cos(c))
            let y=SIMD3(x.x*cos(b)+x.z*sin(b),x.y,-x.x*sin(b)+x.z*cos(b))
            return SIMD3(y.x*cos(a)-y.y*sin(a),y.x*sin(a)+y.y*cos(a),y.z)
        }
        return [(-0.5,-0.5),(0.5,-0.5),(0.5,0.5),(-0.5,0.5)].map {x,y in
            let v=rotate(SIMD3(x*pose.width,y*pose.height,0))+SIMD3(pose.x,pose.y,pose.z),scale=camera/max(1,camera-v.z)
            let q=pose.projectionMix,px=v.x*(scale*(1-q)+q),py=v.y*(scale*(1-q)+q)
            return CGPoint(x:rect.minX+(px/w+0.5)*rect.width,y:rect.minY+(0.5-py/h)*rect.height)
        }
    }
    private func hit(_ point:CGPoint)->CardPose?{
        surface?.frame.cards.reversed().first{pose in
            guard pose.opacity>0.1 else{return false};let points=corners(pose);guard let first=points.first else{return false}
            let path=CGMutablePath();path.move(to:first);for p in points.dropFirst(){path.addLine(to:p)};path.closeSubpath();return path.contains(point)
        }
    }
    override func mouseDown(with event:NSEvent){
        window?.makeFirstResponder(self);let point=convert(event.locationInWindow,from:nil)
        guard contentRect.contains(point),let pose=hit(point),let session else{return}
        let extend=event.modifierFlags.contains(.command)||event.modifierFlags.contains(.shift)
        if extend{if session.selection.contains(pose.slideID){session.selection.remove(pose.slideID)}else{session.selection.insert(pose.slideID)}}else{session.selection=[pose.slideID]}
        transport?.pause();mouseStart=point;gestureTargets=session.selection;gestureTicket=session.ticket(targets:gestureTargets)
        if pose.pinned{pinStart=session.project.pin;session.beginGesture("Move Pin");gesture=true}
        else if event.modifierFlags.contains(.option),let slide=session.project.slides.first(where:{$0.id==pose.slideID}){focalStart=(slide.focalX,slide.focalY);session.beginGesture("Frame media");gesture=true}
    }
    override func mouseDragged(with event:NSEvent){
        guard let start=mouseStart,let session else{return};let point=convert(event.locationInWindow,from:nil),rect=contentRect
        let dx=(point.x-start.x)/max(1,rect.width),dy=(point.y-start.y)/max(1,rect.height)
        if let pin=pinStart{session.change("Move Pin",ticket:gestureTicket){p in guard p.pin?.slideID==pin.slideID else{return};p.pin?.x=bounded(pin.x+dx,0,1);p.pin?.y=bounded(pin.y+dy,0,1)}}
        else if let focal=focalStart{let ids=gestureTargets;session.change("Frame media",ticket:gestureTicket){p in for i in p.slides.indices where ids.contains(p.slides[i].id){p.slides[i].focalX=bounded(focal.0-dx,0,1);p.slides[i].focalY=bounded(focal.1-dy,0,1)}}}
    }
    override func mouseUp(with event:NSEvent){if gesture{session?.endGesture()};gesture=false;mouseStart=nil;pinStart=nil;focalStart=nil;gestureTicket=nil;gestureTargets=[]}
    override func scrollWheel(with event:NSEvent){
        guard (transport?.zoom ?? 0)>0 else{super.scrollWheel(with:event);return};let rect=contentRect
        pan.x=bounded(pan.x+event.scrollingDeltaX,-max(0,(rect.width-bounds.width)/2),max(0,(rect.width-bounds.width)/2))
        pan.y=bounded(pan.y+event.scrollingDeltaY,-max(0,(rect.height-bounds.height)/2),max(0,(rect.height-bounds.height)/2));needsDisplay=true
    }
    override func keyDown(with event:NSEvent){
        switch event.keyCode{case 49:transport?.toggle();case 123:transport?.step(-1);case 124:transport?.step(1);case 53:if gesture{session?.cancelGesture();gesture=false;pinStart=nil;focalStart=nil}else{transport?.cancelAudition()};default:super.keyDown(with:event)}
    }
}
