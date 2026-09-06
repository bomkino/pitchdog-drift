import AppKit
import SwiftUI
import DriftCore
import DriftNative

func human(_ key:String)->String {
    let spaced=key.replacingOccurrences(of:"([a-z0-9])([A-Z])",with:"$1 $2",options:.regularExpression).replacingOccurrences(of:"-",with:" ")
    return spaced.prefix(1).uppercased()+spaced.dropFirst()
}
struct StudioView:View {
    @ObservedObject var session:EditorSession
    @ObservedObject var transport:Transport
    let document:DriftDocument
    @State private var canvasEditor=false
    @State private var exportSheet=false
    @State private var showInspector=true
    @State private var search=""
    @State private var scope="Look"
    @ObservedObject private var exports=ExportCenter.shared
    var body:some View {
        VStack(spacing:0){
            HStack(spacing:14){
                Button{document.addMedia(nil)}label:{Label("Add media",systemImage:"plus")}.disabled(session.importing)
                Button{session.undo()}label:{Image(systemName:"arrow.uturn.backward")}.help("Undo").disabled(!session.journal.canUndo)
                Button{session.redo()}label:{Image(systemName:"arrow.uturn.forward")}.help("Redo").disabled(!session.journal.canRedo)
                Spacer()
                Button("\(session.project.canvas.width) × \(session.project.canvas.height)"){canvasEditor=true}.monospacedDigit().help("Canvas dimensions")
                Menu{
                    Button("Fit"){transport.zoom=0}
                    ForEach([0.25,0.5,1.0,2.0],id:\.self){value in Button("\(Int(value*100))%"){transport.zoom=value}}
                }label:{Text(transport.zoom==0 ? "Fit":"\(Int(transport.zoom*100))%")}.frame(width:70)
                Button{showInspector.toggle()}label:{Image(systemName:"sidebar.right")}.help("Show inspector")
                Button("Export…"){transport.pause();exportSheet=true}.keyboardShortcut("e",modifiers:[.command,.shift]).disabled(exports.busy || session.project.includedSlides.isEmpty)
            }.controlSize(.large).padding(.horizontal,18).padding(.vertical,12)
            Divider()
            HSplitView{
                library.frame(minWidth:200,idealWidth:240,maxWidth:320)
                VStack(spacing:0){
                    NativeCanvas(session:session,transport:transport).padding(22).background(Color(nsColor:.underPageBackgroundColor))
                    Divider();TimelineView(session:session,transport:transport).padding(14)
                }.frame(minWidth:400,maxWidth:.infinity,maxHeight:.infinity)
                if showInspector{inspector.frame(minWidth:290,idealWidth:320,maxWidth:400)}
            }
            if session.importing{
                Divider();HStack{ProgressView().controlSize(.small);Text(session.importStatus);Spacer();Button("Cancel import"){session.cancelImport()}}.padding(12)
            }
            if exports.busy || exports.receipt != nil || exports.error != nil{
                Divider();HStack(spacing:12){
                    if exports.busy{ProgressView(value:exports.progress).frame(width:130);Text(exports.status);Spacer();Button("Cancel"){exports.cancel()}}
                    else if let receipt=exports.receipt{Text("Exported \(receipt.name)");Spacer();Button("Reveal in Finder"){exports.reveal()};Button("Dismiss"){exports.clear()}}
                    else if let error=exports.error{Text(error).foregroundStyle(.red).textSelection(.enabled);Spacer();Button("Dismiss"){exports.clear()}}
                }.padding(12)
            }
            if let issue=session.issue{
                Divider();HStack(alignment:.top){Image(systemName:"exclamationmark.triangle");Text(issue).textSelection(.enabled).frame(maxWidth:.infinity,alignment:.leading);Button("Dismiss"){session.issue=nil}}.padding(12).foregroundStyle(.red)
            }
        }.background(Color(nsColor:.windowBackgroundColor)).font(.system(size:13))
        .sheet(isPresented:$canvasEditor){CanvasEditor(session:session)}
        .sheet(isPresented:$exportSheet){ExportOptions(session:session,transport:transport,documentName:document.displayName)}
        .sheet(item:$session.pendingBatch){batch in BatchReview(session:session,batch:batch)}
        .onDrop(of:["public.file-url"],isTargeted:nil,perform:drop)
    }
    private var library:some View {
        VStack(alignment:.leading,spacing:8){
            HStack{Text("MEDIA").font(.caption.weight(.semibold));Spacer();Text("\(session.project.slides.count)").foregroundStyle(.secondary)}.padding(.horizontal,14).padding(.top,16)
            TextField("Find media",text:$search).textFieldStyle(.roundedBorder).padding(.horizontal,12)
            List(selection:$session.selection){
                ForEach(session.project.slides.filter{slide in search.isEmpty || session.project.assets[slide.assetID]?.name.localizedCaseInsensitiveContains(search)==true}){slide in
                    if let original=session.project.assets[slide.assetID]{
                        HStack(spacing:8){
                            Poster(original:original,workspace:session.workspace).frame(width:64,height:42)
                            VStack(alignment:.leading,spacing:4){
                                Text(original.name).lineLimit(2).font(.system(size:12,weight:.medium))
                                HStack(spacing:5){
                                    if !slide.included{Text("Excluded")}
                                    if session.project.pin?.slideID==slide.id{Image(systemName:"pin.fill").help("Pin")}
                                    if session.project.spotlights.contains(where:{$0.slideID==slide.id}){Image(systemName:"viewfinder").help("Spotlight")}
                                    if session.project.closing?.slideID==slide.id{Image(systemName:"flag.checkered").help("Closing")}
                                    if original.kind != .image{Text(String(format:"%.1f s",Double(original.durationNanoseconds)/1e9))}
                                }.font(.caption2).foregroundStyle(.secondary)
                            }
                        }.opacity(slide.included ? 1:0.5).padding(.vertical,5).tag(slide.id)
                        .contextMenu{slideMenu(slide,original)}
                        .onDrag{NSItemProvider(object:slide.id as NSString)}
                        .onDrop(of:["public.utf8-plain-text"],isTargeted:nil){providers in reorder(providers,before:slide.id)}
                        .accessibilityLabel("\(original.name)\(slide.included ? "":", excluded")")
                    }
                }
            }.listStyle(.sidebar)
            HStack{
                Button{session.duplicateSelection()}label:{Image(systemName:"plus.square.on.square")}.help("Duplicate selection")
                Button{moveSelection(-1)}label:{Image(systemName:"arrow.up")}.help("Move selection up")
                Button{moveSelection(1)}label:{Image(systemName:"arrow.down")}.help("Move selection down")
                Spacer();Button(role:.destructive){session.removeSelection()}label:{Image(systemName:"trash")}.help("Remove selected slides")
            }.disabled(session.selection.isEmpty).padding(12)
        }
    }
    @ViewBuilder private func slideMenu(_ slide:Slide,_ original:Original)->some View {
        Button(slide.included ? "Exclude":"Include"){let ids=session.selection.contains(slide.id) ? session.selection:[slide.id];session.change("Include media"){p in for i in p.slides.indices where ids.contains(p.slides[i].id){p.slides[i].included = !slide.included}}}
        Button("Replace media…"){document.replace(slide.id,locate:false)}
        Button("Locate original…"){document.replace(slide.id,locate:true)}
        Divider()
        Button(session.project.pin?.slideID==slide.id ? "Unpin":"Pin"){session.setPin(session.project.pin?.slideID==slide.id ? nil:slide.id)}
        Button(session.project.spotlights.contains(where:{$0.slideID==slide.id}) ? "Remove Spotlight":"Spotlight"){session.setSpotlight([slide.id],enabled:!session.project.spotlights.contains(where:{$0.slideID==slide.id}))}
        Button(session.project.closing?.slideID==slide.id ? "Remove Closing":"Use as Closing"){session.setClosing(session.project.closing?.slideID==slide.id ? nil:slide.id)}
        Divider();Button("Duplicate"){session.selection=[slide.id];session.duplicateSelection()};Button("Remove",role:.destructive){session.selection=[slide.id];session.removeSelection()}
    }
    private func moveSelection(_ direction:Int){let ids=session.selection;session.change("Reorder slides"){p in
        if direction<0{for index in p.slides.indices.dropFirst() where ids.contains(p.slides[index].id) && !ids.contains(p.slides[index-1].id){p.slides.swapAt(index,index-1)}}
        else if p.slides.count>1{for index in (0..<(p.slides.count-1)).reversed() where ids.contains(p.slides[index].id) && !ids.contains(p.slides[index+1].id){p.slides.swapAt(index,index+1)}}
    }}
    private func reorder(_ providers:[NSItemProvider],before target:String)->Bool{
        guard let provider=providers.first else{return false};let ticket=session.ticket(targets:[target])
        _=provider.loadObject(ofClass:NSString.self){object,_ in guard let id=object as? String else{return};Task{@MainActor in guard session.accepts(ticket),let from=session.project.slides.firstIndex(where:{$0.id==id}),let to=session.project.slides.firstIndex(where:{$0.id==target}) else{return};session.reorder(IndexSet(integer:from),to:to)}};return true
    }
    private func drop(_ providers:[NSItemProvider])->Bool{
        let files=providers.filter{$0.hasItemConformingToTypeIdentifier("public.file-url")};guard !files.isEmpty,!session.importing else{return false}
        let ticket=session.ticket()
        Task{@MainActor in
            var urls:[URL]=[]
            for provider in files{
                let url:URL?=await withCheckedContinuation{continuation in provider.loadItem(forTypeIdentifier:"public.file-url",options:nil){item,_ in
                    let value=(item as? URL) ?? (item as? Data).flatMap{URL(dataRepresentation:$0,relativeTo:nil)};continuation.resume(returning:value)
                }}
                guard session.accepts(ticket) else{return};if let url{urls.append(url)}
            }
            session.importURLs(urls,ticket:ticket)
        };return true
    }
    private var inspector:some View {
        VStack(spacing:0){
            Picker("Inspector",selection:$scope){Text("Look").tag("Look");Text("Motion").tag("Motion");Text("Slide").tag("Slide")}.pickerStyle(.segmented).padding(14)
            ScrollView{
                VStack(alignment:.leading,spacing:18){
                    if scope=="Look"{LookInspector(session:session)}
                    else if scope=="Motion"{MotionInspector(session:session)}
                    else{SlideInspector(session:session,transport:transport)}
                }.padding(16).frame(maxWidth:.infinity,alignment:.leading)
            }
        }
    }
}

struct NumberEdit:View {
    let title:String,value:Double,mixed:Bool,integer:Bool
    let commit:(Double)->Void
    @State private var text=""
    @State private var capturedCommit:((Double)->Void)?
    @State private var invalid=false
    @FocusState private var focus:Bool
    init(_ title:String,value:Double,mixed:Bool=false,integer:Bool=false,commit:@escaping(Double)->Void){self.title=title;self.value=value;self.mixed=mixed;self.integer=integer;self.commit=commit}
    private func formatted()->String{mixed ? "":integer ? String(Int64(value.rounded())):String(format:"%.5f",value).replacingOccurrences(of:"0+$",with:"",options:.regularExpression).replacingOccurrences(of:"\\.$",with:"",options:.regularExpression)}
    var body:some View{
        HStack{Text(title).lineLimit(2);Spacer();TextField(mixed ? "Mixed":"",text:$text).multilineTextAlignment(.trailing).textFieldStyle(.roundedBorder).frame(width:96).focused($focus).foregroundStyle(invalid ? Color.red:Color.primary).help(invalid ? "Enter a finite number within the supported range.":title).onSubmit(finish)}
        .onAppear{text=formatted()}.onChange(of:value){_ in if !focus{text=formatted()}}
        .onChange(of:mixed){_ in if !focus{text=formatted()}}
        .onChange(of:focus){value in if value{capturedCommit=commit}else{finish();capturedCommit=nil}}
    }
    private func finish(){guard let number=Double(text),number.isFinite,abs(number)<=1_000_000_000 else{invalid=true;return};invalid=false;(capturedCommit ?? commit)(integer ? number.rounded():number)}
}
struct JsonField:View {
    @ObservedObject var session:EditorSession
    let field:CreativeField,path:[String]
    var slideIDs:Set<String>?=nil
    private var value:Any?{session.jsonValue(path,slideID:slideIDs?.sorted().first)}
    private func update(_ value:Any){let ids=slideIDs,ticket=session.ticket(targets:ids ?? []);session.changeJSON(human(field.key),path:path,value:value,ticket:ticket,slideIDs:ids)}
    var body:some View {
        if field.type=="Bool"{Toggle(human(field.key),isOn:Binding(get:{value as? Bool ?? false},set:update))}
        else if !field.options.isEmpty{
            Picker(human(field.key),selection:Binding(get:{field.type=="Double" ? String((value as? NSNumber)?.doubleValue ?? 0):String(describing:value ?? "")},set:{text in
                if field.type=="Double",let number=Double(text){update(number)}else{update(text)}
            })){ForEach(field.options.indices,id:\.self){i in Text(human(field.options[i].text)).tag(field.options[i].text)}}
        }else if field.type=="Double"{NumberEdit(human(field.key),value:(value as? NSNumber)?.doubleValue ?? 0){update($0)}}
        else if field.type=="String",(value as? String)?.hasPrefix("#")==true{
            HStack{Text(human(field.key));Spacer();ColorPicker("",selection:Binding(get:{Color(hex:value as? String ?? "#000000")},set:{color in if let c=NSColor(color).usingColorSpace(.sRGB){update(String(format:"#%02x%02x%02x",Int((c.redComponent*255).rounded()),Int((c.greenComponent*255).rounded()),Int((c.blueComponent*255).rounded())))}}),supportsOpacity:false).labelsHidden()}
        }
    }
}
private extension Color {
    init(hex:String){let value=(try? RGBA(hex:hex)) ?? RGBA(0,0,0);self.init(.sRGB,red:value.r,green:value.g,blue:value.b,opacity:value.a)}
}
struct CreativeGroup:View {
    @ObservedObject var session:EditorSession
    let type:String,path:[String]
    var body:some View{
        if let definition=session.catalog.fields.first(where:{$0.name==type}){
            ForEach(definition.fields,id:\.key){field in
                if session.catalog.fields.contains(where:{$0.name==field.type}){
                    DisclosureGroup(human(field.key)){AnyView(CreativeGroup(session:session,type:field.type,path:path+[field.key]).padding(.vertical,6))}
                }else{JsonField(session:session,field:field,path:path+[field.key])}
            }
        }
    }
}
struct LookInspector:View {
    @ObservedObject var session:EditorSession
    private var worlds:[WorldTemplate]{session.catalog.worlds.filter{$0.pressure=="restrained" && $0.scene == -1}}
    private func apply(_ world:String?=nil,_ pressure:String?=nil,_ scene:Int?=nil,_ recut:Int?=nil){
        let p=session.project,world=world ?? p.worldID,pressure=pressure ?? p.worldPressure,scene=scene ?? p.worldScene
        if let template=session.catalog.worlds.first(where:{$0.worldID==world && $0.pressure==pressure && $0.scene==scene}){session.change("World"){$0.applyWorld(template,catalog:session.catalog,recut:recut)}}
    }
    var body:some View{
        Text("LOOK").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        Picker("World",selection:Binding(get:{session.project.worldID},set:{apply($0)})){ForEach(worlds){world in Text(world.label).tag(world.worldID)}}
        Picker("Pressure",selection:Binding(get:{session.project.worldPressure},set:{apply(nil,$0)})){Text("Restrained").tag("restrained");Text("Directed").tag("directed");Text("Fever").tag("fever")}
        Picker("Arrangement",selection:Binding(get:{session.project.worldScene},set:{apply(nil,nil,$0)})){Text("Wide").tag(-1);Text("Portrait I").tag(0);Text("Portrait II").tag(1)}
        Button("Recut"){apply(nil,nil,nil,session.project.worldRecut+1)}
        DisclosureGroup("Keep when changing World"){
            ForEach(["motion","card","material","lighting","atmosphere","lens"],id:\.self){key in Toggle(human(key),isOn:Binding(get:{session.project.lockedDomains.contains(key)},set:{on in session.change("Lock \(key)"){p in p.lockedDomains.removeAll{$0==key};if on{p.lockedDomains.append(key)}}}))}
        }
        Divider()
        RecipePicker(session:session,category:"material",title:"Material")
        RecipePicker(session:session,category:"finish",title:"Finish")
        RecipePicker(session:session,category:"lighting",title:"Lighting")
        RecipePicker(session:session,category:"lens",title:"Optics")
        Menu("Background studies") {ForEach(session.catalog.backgrounds){b in Button(b.name){session.change("Background"){$0.applyBackground(b,catalog:session.catalog)}}}}
        Toggle("Transparent canvas",isOn:Binding(get:{session.project.transparent},set:{v in session.change("Canvas transparency"){$0.transparent=v}}))
        ForEach([("Card","card","CardSettings"),("Material","material","MaterialSettings"),("Lighting","lighting","LightingSettings"),("Background","atmosphere","AtmosphereSettings"),("Optics","lens","LensSettings"),("Sound","sound","SoundSettings")],id:\.0){name,key,type in
            DisclosureGroup(name){CreativeGroup(session:session,type:type,path:["creative",key]).padding(.vertical,8)}
        }
    }
}
struct RecipePicker:View {
    @ObservedObject var session:EditorSession
    let category:String,title:String
    var body:some View{Menu(title){ForEach(session.catalog.recipes.filter{$0.category==category}){recipe in Button(recipe.label){session.change(title){$0.applyRecipe(recipe)}}}}}
}
struct MotionInspector:View {
    @ObservedObject var session:EditorSession
    var body:some View{
        Text("DIRECT").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        Picker("Axis",selection:Binding(get:{session.project.creative.motion.transport.axis},set:{axis in session.change("Axis"){$0.creative.motion.transport.axis=axis}})){Text("Horizontal").tag("horizontal");Text("Vertical").tag("vertical")}
        Toggle("Reverse",isOn:Binding(get:{session.project.creative.motion.transport.direction<0},set:{v in session.change("Direction"){$0.creative.motion.transport.direction=v ? -1:1}}))
        RecipePicker(session:session,category:"path",title:"Path")
        Picker("Movement",selection:Binding(get:{session.project.direction.grammar.rawValue},set:{v in session.change("Movement"){$0.direction.grammar=MovementGrammar(rawValue:v)!}})){Text("Continuous glide").tag("continuousGlide");Text("Readable holds").tag("readableHolds");Text("Handcrafted").tag("handcrafted")}
        RecipePicker(session:session,category:"cadence",title:"Cadence")
        RecipePicker(session:session,category:"performance",title:"Performance")
        RecipePicker(session:session,category:"character",title:"Interaction character")
        Toggle("Reading-paced duration",isOn:Binding(get:{session.project.direction.contentPaced},set:{v in session.change("Duration mode"){$0.direction.contentPaced=v}}))
        if session.project.direction.contentPaced{NumberEdit("Seconds per slide",value:session.project.direction.secondsPerSlide){v in session.change("Reading pace"){$0.direction.secondsPerSlide=v}}}
        else{NumberEdit("Body duration, s",value:Double(session.project.direction.bodyMilliseconds)/1000){v in session.change("Body duration"){$0.direction.bodyMilliseconds=Int64((v*1000).rounded())}}}
        Text(String(format:"Sequence %.3f s · %lld frames",session.snapshot.plan.duration,session.snapshot.plan.schedule.totalFrames)).font(.caption).foregroundStyle(.secondary)
        Picker("Playback",selection:Binding(get:{session.project.direction.mode.rawValue},set:{v in session.change("Playback mode"){$0.direction.mode=PlayMode(rawValue:v)!}})){Text("Once").tag("once");Text("Repeat count").tag("repeatCount");Text("Loop").tag("loop")}
        if session.project.direction.mode == .repeatCount{
            NumberEdit("Repeats",value:Double(session.project.direction.repeats),integer:true){v in session.change("Repeats"){$0.direction.repeats=Int(v)}}
            Picker("Repeat",selection:Binding(get:{session.project.direction.repeatScope.rawValue},set:{v in session.change("Repeat scope"){$0.direction.repeatScope=RepeatScope(rawValue:v)!}})){Text("Body").tag("body");Text("Full scene").tag("fullScene")}
        }
        DisclosureGroup("Pass groups"){
            ForEach(session.project.direction.groups){group in
                VStack(alignment:.leading){Text(group.label).fontWeight(.medium)
                    NumberEdit("Passes",value:Double(group.passes),integer:true){v in session.change("Pass count"){p in if let i=p.direction.groups.firstIndex(where:{$0.id==group.id}){p.direction.groups[i].passes=Int(v)}}}
                    NumberEdit("Relative duration",value:group.relativeSecondsPerPass){v in session.change("Pass tempo"){p in if let i=p.direction.groups.firstIndex(where:{$0.id==group.id}){p.direction.groups[i].relativeSecondsPerPass=v}}}
                    Button("Remove group",role:.destructive){session.change("Remove pass group"){$0.direction.groups.removeAll{$0.id==group.id}}}.disabled(session.project.direction.groups.count<=1)
                }.padding(.vertical,6)
            }
            Button("Add pass group"){session.change("Add pass group"){$0.direction.groups.append(PassGroup(id:UUID().uuidString,label:"Pass \($0.direction.groups.count+1)",passes:1,relativeSecondsPerPass:1))}}
            NumberEdit("Sequence repeats",value:Double(session.project.direction.sequenceRepeats),integer:true){v in session.change("Sequence repeats"){$0.direction.sequenceRepeats=Int(v)}}
        }
        DisclosureGroup("Tempo curve"){
            ForEach(session.project.direction.tempo.indices,id:\.self){i in HStack{
                NumberEdit("At",value:session.project.direction.tempo[i].time){v in session.change("Tempo position"){$0.direction.tempo[i].time=v}}
                NumberEdit("Speed",value:session.project.direction.tempo[i].speed){v in session.change("Tempo speed"){$0.direction.tempo[i].speed=v}}
            }}
            Button("Add middle point"){session.change("Tempo point"){p in if !p.direction.tempo.contains(where:{$0.time==0.5}){p.direction.tempo.append(TempoPoint(0.5,1));p.direction.tempo.sort{$0.time<$1.time}}}}
            Button("Reset tempo"){session.change("Reset tempo"){$0.direction.tempo=[TempoPoint(0,1),TempoPoint(1,1)]}}
        }
        TransitionEditor(session:session,entry:true);TransitionEditor(session:session,entry:false)
        Toggle("Reduce authored motion",isOn:Binding(get:{session.project.direction.reduceAuthoredMotion},set:{v in session.change("Authored motion"){$0.direction.reduceAuthoredMotion=v}}))
        DisclosureGroup("Path and surface response"){CreativeGroup(session:session,type:"MotionSettings",path:["creative","motion"])}
    }
}
struct TransitionEditor:View {
    @ObservedObject var session:EditorSession
    let entry:Bool
    private var value:DriftCore.Transition{entry ? session.project.direction.entry:session.project.direction.exit}
    private func change(_ edit:(inout DriftCore.Transition)->Void){session.change(entry ? "Entry":"Exit"){p in if entry{edit(&p.direction.entry)}else{edit(&p.direction.exit)}}}
    var body:some View{
        DisclosureGroup(entry ? "Entry":"Exit"){
            Toggle("Enabled",isOn:Binding(get:{value.enabled},set:{v in change{$0.enabled=v}}))
            NumberEdit("Duration, s",value:Double(value.milliseconds)/1000){v in change{$0.milliseconds=Int64((v*1000).rounded())}}
            Picker("Treatment",selection:Binding(get:{value.treatment},set:{v in change{$0.treatment=v}})){ForEach(["fade","lift","projector","contact-cut"],id:\.self){Text(human($0)).tag($0)}}
            Picker("Curve",selection:Binding(get:{value.curve},set:{v in change{$0.curve=v}})){ForEach(["linear","ease-out","ease-in-out"],id:\.self){Text(human($0)).tag($0)}}
            NumberEdit("Stagger",value:value.stagger){v in change{$0.stagger=v}}
            Toggle("Reverse stagger",isOn:Binding(get:{value.reverse},set:{v in change{$0.reverse=v}}))
            NumberEdit("Background lead",value:value.background.lead){v in change{$0.background.lead=v}}
            NumberEdit("Background span",value:value.background.span){v in change{$0.background.span=v}}
            NumberEdit("Slides lead",value:value.slides.lead){v in change{$0.slides.lead=v}}
            NumberEdit("Slides span",value:value.slides.span){v in change{$0.slides.span=v}}
            if !entry,session.project.closing != nil{Text("Closing replaces the final exit.").font(.caption).foregroundStyle(.secondary)}
        }
    }
}
