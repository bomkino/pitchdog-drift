from pathlib import Path
R=Path('.')
def edit(path,old,new):
 p=R/path;s=p.read_text()
 if new in s:return
 assert old in s,(path,old[:100]);p.write_text(s.replace(old,new,1))
core='macos/NativeCore/Sources/DriftCore/'
app='macos/NativeCore/Sources/DriftApplication/'
native='macos/NativeCore/Sources/DriftNative/'
edit(native+'EditorSession.swift','''        do{let before=journal
            if try journal.apply(name,ticket:ticket,edit){do{try refresh()}catch{journal=before;throw error}}
        }catch{issue=error.localizedDescription}''','''        do{
            // UI edits may read session.project while mutating the candidate.
            // Never hold an inout borrow of self.journal across their closure:
            // Swift otherwise terminates the app for overlapping access.
            var candidate=journal
            if try candidate.apply(name,ticket:ticket,edit){
                let before=journal;journal=candidate
                do{try refresh()}catch{journal=before;throw error}
            }
        }catch{issue=error.localizedDescription}''')
edit(core+'ExactGeometry.swift','    public static let wideDeck = try! CanvasSize(width: 2576, height: 1080)','    public static let wideDeck = try! CanvasSize(width: 2576, height: 1080)\n    public static let portrait = try! CanvasSize(width: 1080, height: 1920)')
edit(core+'Project.swift','''    public var framePolicy:FramePolicy = .matchCanvas
    public var aspect:ExactRatio?=nil''','''    // New slides are wide deck compartments, independent of output pixels.
    // Codable retains the explicit policy and ratio in existing documents.
    public var framePolicy:FramePolicy = .ratio
    public var aspect:ExactRatio?=CanvasSize.wideDeck.ratio''')
edit(core+'Project.swift','public var canvas=CanvasSize.wideDeck','public var canvas=CanvasSize.portrait')
edit(core+'Project.swift','''        try require(framePolicy != .ratio || aspect != nil,"Custom framing needs an exact ratio.")''','''        try require(framePolicy != .ratio || aspect != nil,"Custom framing needs an exact ratio.")
        if framePolicy == .ratio,let aspect{try number(aspect.value,0.0001...10000,"Slide aspect ratio")}''')
edit(core+'Project.swift','''        try require(framePolicy != .ratio || aspect != nil,"Custom Pin framing needs a ratio.")''','''        try require(framePolicy != .ratio || aspect != nil,"Custom Pin framing needs a ratio.")
        if framePolicy == .ratio,let aspect{try number(aspect.value,0.0001...10000,"Pin aspect ratio")}''')
edit(core+'Project.swift','''values.card.defaultFit=creative.card.defaultFit
        let take''','''values.card.defaultFit=creative.card.defaultFit
        // A Look/Recut must not rotate or reverse the user's directed sequence.
        values.motion.transport.axis=creative.motion.transport.axis
        values.motion.transport.direction=creative.motion.transport.direction
        let take''')
edit(core+'Project.swift','''    public mutating func removeSlides(_ ids:Set<String>){''','''    /// Explicit, undoable conversion for existing documents; never an on-open migration.
    public mutating func useInstagramTrain(){
        canvas = .portrait
        creative.card.aspectWidth=25.76;creative.card.aspectHeight=10.8
        creative.motion.transport.axis="vertical"
        creative.motion.path.id="straight";creative.motion.path.gap=0.06
        creative.motion.path.curvature=0;creative.motion.path.depth=0
        creative.motion.path.banking=0;creative.motion.path.focusScale=0
        creative.motion.performance.imperfection=0
        for i in slides.indices{slides[i].framePolicy = .ratio;slides[i].aspect=CanvasSize.wideDeck.ratio}
    }
    public mutating func removeSlides(_ ids:Set<String>){''')
edit('scripts/generate-native-catalog.mjs'," const baseline=fresh();baseline.card.aspectWidth=25.76;baseline.card.aspectHeight=10.8;baseline.card.defaultFit='contain';",""" const baseline=fresh();baseline.card.aspectWidth=25.76;baseline.card.aspectHeight=10.8;baseline.card.defaultFit='contain';
 // Native social-video defaults: wide slides in a portrait output, close vertical train.
 baseline.motion.transport.axis='vertical';
 Object.assign(baseline.motion.path,{id:'straight',gap:0.06,curvature:0,depth:0,banking:0,focusScale:0});
 baseline.motion.performance.imperfection=0;""")
(R/(core+'SlideTrackLayout.swift')).write_text('''import Foundation

/// One geometry authority for spacing, visits and visibility. Distances remain
/// authored in slide visits; the variable-width track maps them to output pixels.
/// Built once per immutable frame plan, not once per preview/export frame.
struct SlideTrackLayout:Sendable {
    let heights:[Double],extents:[Double],centers:[Double],advances:[Double]
    let cycleLength:Double,maximumExtent:Double
    init(project:DriftProject,slides:[Slide]) {
        let width=Double(project.canvas.width)*bounded(project.creative.card.scale,0.1,1.6)
        let vertical=project.creative.motion.transport.axis=="vertical"
        let heights=slides.map{width/$0.aspectRatio(canvas:project.canvas,original:project.assets[$0.assetID]!)}
        let extents=slides.indices.map{(vertical ? heights[$0]:width)*bounded(1+slides[$0].scaleOffset,0.24,1.6)}
        let gap=1+bounded(project.creative.motion.path.gap,0,2.5)
        let advances=slides.indices.map{(extents[$0]+extents[($0+1)%slides.count])*0.5*gap}
        var positions:[Double]=[],cursor=0.0
        for advance in advances{positions.append(cursor);cursor += advance}
        self.heights=heights;self.extents=extents;self.advances=advances
        centers=positions;cycleLength=cursor;maximumExtent=extents.max() ?? 0
    }
    func position(slot:Int)->Double {
        guard !centers.isEmpty else{return 0}
        return Double(slot/centers.count)*cycleLength+centers[slot%centers.count]
    }
    /// Reduce the phase before converting to Int, including reverse travel and
    /// long-running loops. No allocation grows with output time or tiny ratios.
    func displacement(visits:Double,repetitions:Int)->Double {
        guard !centers.isEmpty,visits.isFinite else{return 0}
        let phase=positiveModulo(visits,Double(centers.count*repetitions))
        let slot=Int(floor(phase))
        return position(slot:slot)+(phase-Double(slot))*advances[slot%centers.count]
    }
}
''')
edit(core+'FramePlan.swift','''    private let byID:[String:Slide]
    public init''','''    private let byID:[String:Slide]
    private let slideTrack:SlideTrackLayout
    public init''')
edit(core+'FramePlan.swift','''        byID=Dictionary(uniqueKeysWithValues:project.slides.map{($0.id,$0)})''','''        byID=Dictionary(uniqueKeysWithValues:project.slides.map{($0.id,$0)})
        slideTrack=SlideTrackLayout(project:project,slides:moving)''')
edit(core+'FramePlan.swift','''        guard !moving.isEmpty else{return []}
        let sample''','''        guard !moving.isEmpty,baseSeconds.isFinite,interaction.isFinite else{return []}
        let sample''')
edit(core+'FramePlan.swift','''        let width=w*bounded(c.card.scale,0.1,1.6),height=width/(c.card.aspectWidth/max(0.01,c.card.aspectHeight))
        let stride=(vertical ? height:width)*(1+bounded(c.motion.path.gap,0,2.5)),axis=vertical ? h:w,cross=vertical ? w:h,radius=axis/2+stride
        let minimum=Int(ceil(axis/max(1,stride)))+5,count=max(moving.count,Int(ceil(Double(minimum)/Double(moving.count)))*moving.count),length=Double(count)*stride
        var cards:[CardPose]=[]
        for slot in 0..<count {
            let primary=positiveModulo(Double(slot)*stride-distance*stride+length/2,length)-length/2
            if abs(primary)>radius+stride*1.25{continue}
            let i=slot%moving.count,slide=moving[i],n=bounded(primary/max(1,radius),-1.4,1.4),a=abs(n),pt=point(n),step=0.0015''','''        let width=w*bounded(c.card.scale,0.1,1.6)
        let axis=vertical ? h:w,cross=vertical ? w:h,radius=axis/2+slideTrack.maximumExtent
        // At most 24 cards are drawn; retain a bounded two-window candidate set.
        let repetitions=max(1,(48+moving.count-1)/moving.count)
        let count=moving.count*repetitions,length=Double(repetitions)*slideTrack.cycleLength
        let displacement=slideTrack.displacement(visits:distance,repetitions:repetitions)
        var cards:[CardPose]=[]
        for slot in 0..<count {
            let i=slot%moving.count,slide=moving[i],height=slideTrack.heights[i]
            let primary=positiveModulo(slideTrack.position(slot:slot)-displacement+length/2,length)-length/2
            if abs(primary)>radius+slideTrack.extents[i]*1.25{continue}
            let n=bounded(primary/max(1,radius),-1.4,1.4),a=abs(n),pt=point(n),step=0.0015''')
edit(core+'FramePlan.swift','''            let ratio=slide.aspectRatio(canvas:project.canvas,original:project.assets[slide.assetID]!)
            var pose=styled(slide,slot:slot,index:i,width:width*scale*t.scale,height:width/ratio*scale*t.scale)''','''            var pose=styled(slide,slot:slot,index:i,width:width*scale*t.scale,height:height*scale*t.scale)''')
edit(core+'FramePlan.swift','''            let extent=(vertical ? height:width)*scale,intersection''','''            let extent=vertical ? pose.height:pose.width,intersection''')
edit(app+'SlideInspector.swift','''if policy == .ratio{$0.aspect = .some(session.project.canvas.ratio)}''','''if policy == .ratio && $0.aspect==nil{$0.aspect=CanvasSize.wideDeck.ratio}''')
edit(app+'SlideInspector.swift','''Text("Custom").tag("ratio");if Set(selected.map{$0.framePolicy.rawValue}).count>1{Text("Mixed").tag("mixed")}}''','''Text("Custom").tag("ratio");if Set(selected.map{$0.framePolicy.rawValue}).count>1{Text("Mixed").tag("mixed")}}.accessibilityIdentifier("drift.slide-frame")''')
edit(app+'SlideInspector.swift','''HStack{TextField("Width : height",text:$ratio).textFieldStyle(DriftFieldStyle()).onSubmit(applyRatio);Button("Set",action:applyRatio)}''','''HStack{TextField("Width : height",text:$ratio).textFieldStyle(DriftFieldStyle()).onSubmit(applyRatio).accessibilityIdentifier("drift.slide-ratio");Button("Set",action:applyRatio).accessibilityIdentifier("drift.set-slide-ratio")}
                    .onAppear{syncRatio()}.onChange(of:first.id){_ in syncRatio()}.onChange(of:first.aspect){_ in syncRatio()}''')
edit(app+'SlideInspector.swift','''    private func applyRatio(){''','''    private func syncRatio(){if let value=selected.first?.aspect{ratio="\\(value.numerator):\\(value.denominator)"}}
    private func applyRatio(){''')
edit(app+'SlideInspector.swift','''set:{v in change("Pin frame"){$0.framePolicy=FramePolicy(rawValue:v)!;if v=="ratio"{$0.aspect=session.project.canvas.ratio}}}''','''set:{v in guard let policy=FramePolicy(rawValue:v) else{return};let fallback=session.project.canvas.ratio;change("Pin frame"){$0.framePolicy=policy;if policy == .ratio && $0.aspect==nil{$0.aspect=fallback}}}''')
edit(app+'SlideInspector.swift','''Text("These are output pixels. Preview zoom and World changes do not alter them.").foregroundStyle(.secondary)''','''Text("Output pixels only. Slide frames keep their own dimensions; change them in Slide → Slide frame.").foregroundStyle(.secondary)
            Button("Use Instagram train"){
                session.change("Instagram train"){$0.useInstagramTrain()};dismiss()
            }.accessibilityIdentifier("drift.instagram-train")
            Text("Sets 1080 × 1920 output, all slide frames to 2576 × 1080, and a close straight vertical path. One Undo restores the previous setup. Media, crops and roles are kept.").driftType(.caption).foregroundStyle(.secondary)''')
edit(app+'SlideInspector.swift','''p.canvas=value;p.creative.card.aspectWidth=Double(w)/100;p.creative.card.aspectHeight=Double(h)/100''','''p.canvas=value''')
edit(app+'StudioView.swift','''.monospacedDigit().help("Canvas dimensions")''','''.monospacedDigit().help("Canvas dimensions").accessibilityIdentifier("drift.canvas-size")''')
edit(app+'StudioView.swift','''        case "MotionSettingsTransport":return''','''        case "CardSettings":return ["aspectWidth","aspectHeight"]
        case "MotionSettingsTransport":return''')
edit(app+'NativeApplicationProof.swift','''editor.project.canvas.width==2576 && editor.project.canvas.height==1080,"new document wide-deck default"''','''editor.project.canvas == .portrait && editor.project.creative.motion.transport.axis=="vertical","new document portrait output and vertical motion"''')
edit(app+'NativeApplicationProof.swift','''            assertions.append("Native window; 2576x1080; exact decimal ratio; six-format batch; media Undo/Redo")''','''            try require(editor.project.slides.allSatisfy{$0.framePolicy == .ratio && $0.aspect==CanvasSize.wideDeck.ratio},"imported slides retain independent wide-deck framing")
            // This exact read-during-edit used to crash when selecting Custom.
            editor.change("Custom frame crash regression"){p in
                p.slides[0].framePolicy = .ratio;p.slides[0].aspect=editor.project.canvas.ratio
            }
            try require(editor.issue==nil && editor.project.slides[0].aspect==CanvasSize.portrait.ratio,"custom frame transaction survives reentrant project read")
            editor.undo();try require(editor.project.slides==accepted.slides,"custom frame Undo restores exact imported framing")
            assertions.append("Native window; 1080x1920 output, 2576x1080 slides, vertical motion; custom-frame crash regression and Undo; exact decimal ratio; six-format batch")''')
edit(app+'NativeApplicationProof.swift','''editor.project.canvas==CanvasSize.wideDeck,"World cannot resize canvas"''','''editor.project.canvas==CanvasSize.portrait && editor.project.creative.motion.transport.axis=="vertical","World cannot resize or rotate the sequence"''')
print('Patched core, native, controls, defaults and app proof')
