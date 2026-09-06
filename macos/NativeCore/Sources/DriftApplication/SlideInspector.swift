import SwiftUI
import AppKit
import DriftCore
import DriftNative

struct SlideInspector:View {
    @ObservedObject var session:EditorSession
    @ObservedObject var transport:Transport
    @State private var ratio="2576:1080"
    private var selected:[Slide]{session.project.slides.filter{session.selection.contains($0.id)}}
    private func edit(_ name:String,_ change:(inout Slide)throws->Void){let ids=Set(selected.map(\.id)),ticket=session.ticket(targets:ids);session.change(name,ticket:ticket){p in for i in p.slides.indices where ids.contains(p.slides[i].id){try change(&p.slides[i])}}}
    private func number(_ title:String,_ key:KeyPath<Slide,Double>,_ set:WritableKeyPath<Slide,Double>)->some View{
        let values=selected.map{$0[keyPath:key]},ids=Set(selected.map(\.id)),ticket=session.ticket(targets:Set(selected.map(\.id)))
        return NumberEdit(title,value:values.first ?? 0,mixed:Set(values).count>1){v in session.change(title,ticket:ticket){p in for i in p.slides.indices where ids.contains(p.slides[i].id){p.slides[i][keyPath:set]=v}}}
    }
    var body:some View{
        if let first=selected.first{
            Text(selected.count==1 ? "SELECTED SLIDE":"\(selected.count) SELECTED SLIDES").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            if selected.count==1,let original=session.project.assets[first.assetID]{Text(original.name).font(.headline).textSelection(.enabled);Text("\(original.width) × \(original.height) · \(original.subtype.uppercased())").font(.caption).foregroundStyle(.secondary)}
            HStack{Toggle("Included",isOn:Binding(get:{selected.allSatisfy(\.included)},set:{v in edit("Include slides"){$0.included=v}}));if Set(selected.map(\.included)).count>1{Text("Mixed").foregroundStyle(.secondary)}}
            Toggle("In moving sequence",isOn:Binding(get:{selected.allSatisfy(\.inSequence)},set:{v in edit("Sequence membership"){$0.inSequence=v}}))
            Picker("Slide frame",selection:Binding(get:{Set(selected.map{ $0.framePolicy.rawValue }).count==1 ? first.framePolicy.rawValue:"mixed"},set:{v in
                guard let policy=FramePolicy(rawValue:v) else{return};edit("Slide frame"){$0.framePolicy=policy;if policy == .ratio{$0.aspect = .some(session.project.canvas.ratio)}}
            })){Text("Match canvas").tag("matchCanvas");Text("Source").tag("source");Text("Custom").tag("ratio");if Set(selected.map{$0.framePolicy.rawValue}).count>1{Text("Mixed").tag("mixed")}}
            if first.framePolicy == .ratio{
                HStack{TextField("Width : height",text:$ratio).textFieldStyle(.roundedBorder).onSubmit(applyRatio);Button("Set",action:applyRatio)}
                Text("Exact ratio: \(first.aspect?.numerator ?? 1):\(first.aspect?.denominator ?? 1)").font(.caption).foregroundStyle(.secondary)
            }
            Picker("Content",selection:Binding(get:{Set(selected.map{$0.fit.rawValue}).count==1 ? first.fit.rawValue:"mixed"},set:{v in if let fit=Fit(rawValue:v){edit("Fit media"){$0.fit=fit}}})){Text("Fit").tag("fit");Text("Fill").tag("fill");if Set(selected.map{$0.fit.rawValue}).count>1{Text("Mixed").tag("mixed")}}
            number("Focal X",\.focalX,\.focalX);number("Focal Y",\.focalY,\.focalY);number("Size offset",\.scaleOffset,\.scaleOffset)
            DisclosureGroup("Crop"){
                number("X",\.crop.x,\.crop.x);number("Y",\.crop.y,\.crop.y);number("Width",\.crop.width,\.crop.width);number("Height",\.crop.height,\.crop.height)
                Button("Reset framing"){edit("Reset framing"){$0.crop=Crop();$0.focalX=0.5;$0.focalY=0.5;$0.scaleOffset=0}}
            }
            if selected.contains(where:{session.project.assets[$0.assetID]?.kind != .image}){
                Divider();Text("SOURCE PLAYBACK").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Toggle("Play source",isOn:Binding(get:{selected.allSatisfy{$0.playback.plays}},set:{v in edit("Source playback"){$0.playback.plays=v}}))
                Toggle("Loop source",isOn:Binding(get:{selected.allSatisfy{$0.playback.loop}},set:{v in edit("Source loop"){$0.playback.loop=v}}))
                number("Speed",\.playback.rate,\.playback.rate)
                NumberEdit("In, seconds",value:Double(first.playback.trimInNanoseconds)/1e9){v in edit("Source trim in"){$0.playback.trimInNanoseconds=Int64((v*1e9).rounded())}}
                NumberEdit("Out, seconds",value:Double(first.playback.trimOutNanoseconds ?? session.project.assets[first.assetID]?.durationNanoseconds ?? 0)/1e9){v in edit("Source trim out"){$0.playback.trimOutNanoseconds=Int64((v*1e9).rounded())}}
                Button("Reset trim"){edit("Reset trim"){$0.playback.trimInNanoseconds=0;$0.playback.trimOutNanoseconds=nil}}
                if selected.count==1,let original=session.project.assets[first.assetID]{SourceClipView(original:original,workspace:session.workspace,playback:first.playback,transport:transport)}
            }
            Divider();Text("PRESENTATION").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            if selected.count==1{Toggle("Pin",isOn:Binding(get:{session.project.pin?.slideID==first.id},set:{v in session.setPin(v ? first.id:nil)}))}
            Toggle("Spotlight",isOn:Binding(get:{selected.allSatisfy{slide in session.project.spotlights.contains{$0.slideID==slide.id}}},set:{v in session.setSpotlight(Set(selected.map(\.id)),enabled:v)}))
            if selected.count==1{Toggle("Closing",isOn:Binding(get:{session.project.closing?.slideID==first.id},set:{v in session.setClosing(v ? first.id:nil)}))}
            if let pin=session.project.pin,selected.count==1,pin.slideID==first.id{PinInspector(session:session,pin:pin)}
            if selected.count==1,let cue=session.project.spotlights.first(where:{$0.slideID==first.id}){CueInspector(session:session,transport:transport,slideID:first.id,closing:false,cueID:cue.id)}
            if selected.count==1,session.project.closing?.slideID==first.id{CueInspector(session:session,transport:transport,slideID:first.id,closing:true,cueID:"closing")}
        }else{Text("Select a slide to frame its media and direct its presentation.").foregroundStyle(.secondary)}
    }
    private func applyRatio(){do{let value=try ExactRatio(pair:ratio);edit("Exact slide ratio"){$0.framePolicy = .ratio;$0.aspect=value}}catch{session.issue=error.localizedDescription}}
}
struct PinInspector:View {
    @ObservedObject var session:EditorSession
    let pin:Pin
    @State private var ratio="2576:1080"
    private func change(_ label:String,_ edit:(inout Pin)->Void){session.change(label){p in guard var value=p.pin,value.slideID==pin.slideID else{return};edit(&value);p.pin=value}}
    private func number(_ title:String,_ key:WritableKeyPath<Pin,Double>)->some View{NumberEdit(title,value:pin[keyPath:key]){v in change(title){$0[keyPath:key]=v}}}
    private func toggle(_ title:String,_ key:WritableKeyPath<Pin,Bool>)->some View{Toggle(title,isOn:Binding(get:{pin[keyPath:key]},set:{v in change(title){$0[keyPath:key]=v}}))}
    var body:some View{
        DisclosureGroup("Pin placement"){
            toggle("Pin only",\.pinOnly)
            number("X",\.x);number("Y",\.y);number("Width",\.width)
            Picker("Frame",selection:Binding(get:{pin.framePolicy.rawValue},set:{v in change("Pin frame"){$0.framePolicy=FramePolicy(rawValue:v)!;if v=="ratio"{$0.aspect=session.project.canvas.ratio}}})){Text("Source").tag("source");Text("Canvas").tag("matchCanvas");Text("Custom").tag("ratio")}
            if pin.framePolicy == .ratio{HStack{TextField("Exact ratio",text:$ratio);Button("Set"){do{let value=try ExactRatio(pair:ratio);change("Pin ratio"){$0.aspect=value}}catch{session.issue=error.localizedDescription}}}}
            Picker("Content",selection:Binding(get:{pin.fit.rawValue},set:{v in change("Pin fit"){$0.fit=Fit(rawValue:v)!}})){Text("Fit").tag("fit");Text("Fill").tag("fill")}
            number("Focal X",\.focalX);number("Focal Y",\.focalY);number("Safe inset",\.safeInset)
            NumberEdit("Start, base seconds",value:Double(pin.startBaseMilliseconds)/1000){v in change("Pin start"){$0.startBaseMilliseconds=Int64((v*1000).rounded())}}
            NumberEdit("End, base seconds",value:Double(pin.endBaseMilliseconds ?? Int64((session.snapshot.plan.base.duration*1000).rounded()))/1000){v in change("Pin end"){$0.endBaseMilliseconds=Int64((v*1000).rounded())}}
            Button("Use full duration"){change("Pin duration"){$0.startBaseMilliseconds=0;$0.endBaseMilliseconds=nil}}
        }
        DisclosureGroup("Pin treatment"){
            toggle("Protect from world optics",\.protected);toggle("Above slides",\.aboveSlides);toggle("Keep in closing",\.keepDuringClosing)
            number("Opacity",\.opacity);number("Corners",\.radius);number("Corner smoothing",\.smoothing);number("Border width",\.borderWidth);number("Border opacity",\.borderOpacity)
            hex("Border colour",\.borderColor);number("Shadow opacity",\.shadowOpacity);number("Shadow softness",\.shadowSoftness);number("Shadow X",\.shadowOffsetX);number("Shadow Y",\.shadowOffsetY)
            hex("Matte colour",\.matteColor);number("Matte opacity",\.matteOpacity)
        }
    }
    private func hex(_ label:String,_ key:WritableKeyPath<Pin,String>)->some View{TextField(label,text:Binding(get:{pin[keyPath:key]},set:{value in if (try? RGBA.validateHex(value)) != nil{change(label){$0[keyPath:key]=value}}})).textFieldStyle(.roundedBorder)}
}
struct CueInspector:View {
    @ObservedObject var session:EditorSession
    @ObservedObject var transport:Transport
    let slideID:String,closing:Bool,cueID:String
    private var hold:Int64{closing ? session.project.closing?.holdMilliseconds ?? 3000:session.project.spotlights.first{$0.id==cueID}?.holdMilliseconds ?? 3000}
    private var transition:Int64{closing ? session.project.closing?.transitionMilliseconds ?? 450:session.project.spotlights.first{$0.id==cueID}?.transitionMilliseconds ?? 450}
    private var size:Double{closing ? session.project.closing?.size ?? 0.85:session.project.spotlights.first{$0.id==cueID}?.size ?? 0.85}
    private func change(_ key:String,_ value:Double){session.change(closing ? "Closing":"Spotlight"){p in
        if closing, p.closing?.slideID==slideID{if key=="hold"{p.closing?.holdMilliseconds=Int64((value*1000).rounded())};if key=="transition"{p.closing?.transitionMilliseconds=Int64((value*1000).rounded())};if key=="size"{p.closing?.size=value}}
        else if let i=p.spotlights.firstIndex(where:{$0.id==cueID}){if key=="hold"{p.spotlights[i].holdMilliseconds=Int64((value*1000).rounded())};if key=="transition"{p.spotlights[i].transitionMilliseconds=Int64((value*1000).rounded())};if key=="size"{p.spotlights[i].size=value}}
    }}
    var body:some View{
        VStack(alignment:.leading,spacing:10){
            Text(closing ? "Closing":"Spotlight").fontWeight(.semibold)
            NumberEdit("Hold, seconds",value:Double(hold)/1000){change("hold",$0)}
            NumberEdit("Transition, seconds",value:Double(transition)/1000){change("transition",$0)}
            NumberEdit("Size",value:size){change("size",$0)}
            if closing && session.project.direction.mode == .loop{Text("Closing is inactive in Loop mode.").font(.caption).foregroundStyle(.secondary)}
            else{Button(closing ? "Preview Closing":"Preview Spotlight"){transport.previewCue(cueID)}}
            if !closing,let cue=session.project.spotlights.first(where:{$0.id==cueID}){
                if session.project.pin?.slideID==slideID,session.project.pin?.pinOnly==false{
                    Picker("Target",selection:Binding(get:{cue.target.rawValue},set:{v in session.change("Spotlight target"){p in if let i=p.spotlights.firstIndex(where:{$0.id==cueID}){p.spotlights[i].target=CueTarget(rawValue:v)!}}})){Text("Travelling slide").tag("movingVisit");Text("Pin").tag("pin")}
                }
                Button("Anchor at playhead"){let base=(try? session.snapshot.plan.schedule.sample(frame:transport.frame).baseFrame) ?? 0;session.change("Spotlight anchor"){p in if let i=p.spotlights.firstIndex(where:{$0.id==cueID}){p.spotlights[i].baseAnchorFrame=base}}}
                Button("Use first readable visit"){session.change("Spotlight anchor"){p in if let i=p.spotlights.firstIndex(where:{$0.id==cueID}){p.spotlights[i].baseAnchorFrame=nil}}}
            }
        }.padding(.vertical,6)
    }
}
struct CanvasEditor:View {
    @ObservedObject var session:EditorSession
    @Environment(\.dismiss) private var dismiss
    @State private var pair=""
    @State private var error:String?
    var body:some View{
        VStack(alignment:.leading,spacing:18){Text("Canvas").font(.title2.weight(.semibold))
            HStack{ForEach([("Wide deck","2576 × 1080"),("16:9","1920 × 1080"),("Portrait","1080 × 1920"),("Square","1080 × 1080")],id:\.0){name,value in Button(name){pair=value}}}
            TextField("Width × height, pixels",text:$pair).font(.title3.monospacedDigit()).textFieldStyle(.roundedBorder).onSubmit(apply)
            Text("These are output pixels. Preview zoom and World changes do not alter them.").foregroundStyle(.secondary)
            if let error{Text(error).foregroundStyle(.red)}
            HStack{Spacer();Button("Cancel"){dismiss()}.keyboardShortcut(.cancelAction);Button("Apply",action:apply).keyboardShortcut(.defaultAction)}
        }.padding(24).frame(width:520).onAppear{pair="\(session.project.canvas.width) × \(session.project.canvas.height)"}
    }
    private func apply(){do{
        let parts=pair.components(separatedBy:CharacterSet(charactersIn:"xX×:"));guard parts.count==2,let w=Int(parts[0].trimmingCharacters(in:.whitespaces)),let h=Int(parts[1].trimmingCharacters(in:.whitespaces)) else{throw NativeFailure.message("Enter whole output pixels, such as 2576 × 1080. Decimal ratios belong to Slide frame.")}
        let value=try CanvasSize(width:w,height:h);session.change("Canvas dimensions"){p in p.canvas=value;p.creative.card.aspectWidth=Double(w)/100;p.creative.card.aspectHeight=Double(h)/100};dismiss()
    }catch{self.error=error.localizedDescription}}
}
struct TimelineView:View {
    @ObservedObject var session:EditorSession
    @ObservedObject var transport:Transport
    @State private var jump=""
    var body:some View{
        VStack(spacing:10){
            GeometryReader{geometry in
                ZStack(alignment:.leading){
                    Slider(value:Binding(get:{Double(transport.frame)},set:{transport.seek(Int64($0.rounded()))}),in:0...Double(max(1,transport.totalFrames-1)))
                    ForEach(session.snapshot.plan.schedule.cues,id:\.id){cue in
                        Button{transport.seek(cue.holdStartFrame)}label:{Image(systemName:cue.closing ? "flag.fill":"diamond.fill").font(.system(size:9))}.buttonStyle(.plain).offset(x:max(0,min(geometry.size.width-10,geometry.size.width*Double(cue.startFrame)/Double(transport.totalFrames))),y:-12).help(cue.closing ? "Closing":"Spotlight")
                    }
                }
            }.frame(height:24)
            HStack(spacing:12){
                Button{transport.nextCue(true)}label:{Image(systemName:"backward.end")}.help("Previous cue")
                Button{transport.step(-1)}label:{Image(systemName:"backward.frame")}.help("Previous frame")
                Button{transport.toggle()}label:{Image(systemName:transport.playing ? "pause.fill":"play.fill").frame(width:24)}.help("Play / Pause")
                Button{transport.step(1)}label:{Image(systemName:"forward.frame")}.help("Next frame")
                Button{transport.nextCue(false)}label:{Image(systemName:"forward.end")}.help("Next cue")
                Text(transport.label).monospacedDigit().frame(minWidth:104)
                Spacer()
                TextField("Frame",text:$jump).textFieldStyle(.roundedBorder).frame(width:75).onSubmit{if let value=Int64(jump){transport.seek(value)}}.help("Jump to exact output frame")
                Text("/ \(transport.totalFrames)").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                Menu("Preview") {Button("Full quality"){transport.quality=1};Button("Balanced"){transport.quality=0.75};Button("Fast"){transport.quality=0.5}}
            }.controlSize(.large)
        }
    }
}
struct BatchReview:View {
    @ObservedObject var session:EditorSession
    let batch:StagedBatch
    var body:some View{VStack(alignment:.leading,spacing:16){
        Text("Some media could not be added").font(.title2.weight(.semibold))
        ScrollView{ForEach(batch.failures){failure in VStack(alignment:.leading){Text(failure.name).fontWeight(.medium);Text(failure.reason).foregroundStyle(.secondary)}.padding(.vertical,6).frame(maxWidth:.infinity,alignment:.leading)}}.frame(maxHeight:300)
        HStack{Text("\(batch.originals.count) valid files");Spacer();Button("Cancel"){session.cancelImport()}.keyboardShortcut(.cancelAction);Button("Add valid items"){session.acceptBatch()}.disabled(batch.originals.isEmpty).keyboardShortcut(.defaultAction)}
    }.padding(24).frame(width:560)}
}
