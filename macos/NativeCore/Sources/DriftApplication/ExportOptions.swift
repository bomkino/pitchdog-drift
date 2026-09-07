import AppKit
import SwiftUI
import UniformTypeIdentifiers
import DriftCore
import DriftNative

struct ExportOptions:View {
    @ObservedObject var session:EditorSession
    let transport:Transport,documentName:String
    @Environment(\.dismiss) private var dismiss
    @State private var format:OutputFormat
    @State private var rate:OutputRate
    @State private var ticket:EditTicket
    @State private var sound:Bool
    @State private var cueID:String
    @State private var mode="all"
    @State private var startSeconds=0.0
    @State private var endSeconds=1.0
    @State private var error:String?
    @State private var flatten=false
    init(session:EditorSession,transport:Transport,documentName:String){
        self.session=session;self.transport=transport;self.documentName=documentName
        _format=State(initialValue:session.project.output.format);_rate=State(initialValue:session.project.output.rate)
        _ticket=State(initialValue:session.ticket());_sound=State(initialValue:session.project.creative.sound.exportEnabled)
        _endSeconds=State(initialValue:transport.duration)
        let selected=session.snapshot.plan.schedule.cues.filter{session.selection.contains($0.slideID)}
        _cueID=State(initialValue:selected.count==1 ? selected[0].id:"")
    }
    private var compatible:Bool{format != .mp4 || !session.project.transparent || flatten}
    private var frameRates:[OutputRate]{[try! OutputRate(24),try! OutputRate(25),try! OutputRate(30),try! OutputRate(50),try! OutputRate(60),try! OutputRate(24000,1001),try! OutputRate(30000,1001),try! OutputRate(60000,1001)]}
    private func cueName(_ cue:ScheduledCue)->String{
        let slide=session.project.slides.first{$0.id==cue.slideID}
        let name=slide.flatMap{session.project.assets[$0.assetID]?.name} ?? "Slide"
        return "\(cue.closing ? "Closing":"Spotlight") · \(name) · \(String(format:"%.2f s",session.project.output.rate.seconds(frame:cue.startFrame)))"
    }
    var body:some View{
        VStack(alignment:.leading,spacing:18){
            Text("Export").font(.title2.weight(.semibold))
            Form{
                Picker("Format",selection:$format){Text("MP4 · H.264").tag(OutputFormat.mp4);Text("PNG · Current frame").tag(OutputFormat.png);Text("PNG sequence").tag(OutputFormat.pngSequence)}
                if format != .png{
                    Picker("Frame rate",selection:$rate){ForEach(frameRates,id:\.self){r in Text(String(format:"%.3g fps",Double(r.numerator)/Double(r.denominator))).tag(r)}}
                    Picker("Range",selection:$mode){Text("Whole sequence").tag("all");Text("Spotlight / Closing").tag("cue");Text("Custom").tag("custom")}
                    if mode=="cue"{
                        Picker("Cue",selection:$cueID){
                            Text("Choose a cue").tag("")
                            ForEach(session.snapshot.plan.schedule.cues,id:\.id){cue in Text(cueName(cue)).tag(cue.id)}
                        }
                    }
                    if mode=="custom"{TextField("Start, seconds",value:$startSeconds,format:.number);TextField("End, seconds",value:$endSeconds,format:.number)}
                }
                LabeledContent("Size",value:"\(session.project.canvas.width) × \(session.project.canvas.height)")
                if format == .mp4 && session.project.transparent{Toggle("Use opaque background for this export",isOn:$flatten)}
                if format == .mp4{Toggle("Authored sound",isOn:$sound)}
                Text(format == .mp4 ? "Rec.709 · source clips are silent":"sRGB · transparency preserved").foregroundStyle(.secondary)
            }.formStyle(.grouped)
            if let error{Text(error).foregroundStyle(.red).textSelection(.enabled)}
            HStack{Spacer();Button("Cancel"){dismiss()}.keyboardShortcut(.cancelAction);Button("Export…",action:export).keyboardShortcut(.defaultAction).disabled(!compatible || ExportCenter.shared.busy)}
        }.padding(24).frame(width:480)
    }
    private func export(){
        do{
            guard session.accepts(ticket) else{throw NativeFailure.message("This export sheet belongs to an earlier document. Reopen Export.")}
            var project=session.project;project.output.format=format;project.output.rate=rate;project.creative.sound.exportEnabled=sound
            if format == .mp4 && flatten{project.transparent=false}
            let snapshot=try RenderSnapshot(project:project,workspace:session.workspace),fps=Double(rate.numerator)/Double(rate.denominator)
            let frame=min(snapshot.plan.schedule.totalFrames-1,max(0,Int64(floor(transport.seconds*fps))))
            var range:ExportRange?
            if format != .png{
                if mode=="custom"{
                    guard startSeconds.isFinite,endSeconds.isFinite,startSeconds>=0,endSeconds<=snapshot.plan.duration else{throw NativeFailure.message("Enter a range inside the sequence.")}
                    range=try ExportRange(start:Int64(floor(startSeconds*fps)),end:Int64(ceil(endSeconds*fps-1e-8)),total:snapshot.plan.schedule.totalFrames)
                }else if mode=="cue"{
                    guard let cue=snapshot.plan.schedule.cues.first(where:{$0.id==cueID}) else{throw NativeFailure.message("Choose the exact Spotlight or Closing cue to export.")}
                    range=try ExportRange(start:cue.startFrame,end:cue.endFrame,total:snapshot.plan.schedule.totalFrames)
                }
            }
            let panel=NSSavePanel();panel.title="Export Drift";panel.canCreateDirectories=true
            let name=documentName.isEmpty ? "Drift":documentName
            panel.nameFieldStringValue=name+(format == .pngSequence ? " Frames":format == .mp4 ? ".mp4":".png")
            if format != .pngSequence{panel.allowedContentTypes=[format == .mp4 ? .mpeg4Movie:.png]}
            guard panel.runModal() == .OK,let url=panel.url else{return}
            guard session.accepts(ticket) else{throw NativeFailure.message("The document closed or changed while choosing a destination. Nothing was exported.")}
            if format == .pngSequence,FileManager.default.fileExists(atPath:url.path){throw NativeFailure.message("Choose a new folder. Existing PNG sequence folders are not replaced.")}
            try ExportCenter.shared.start(snapshot:snapshot,destination:url,range:range,stillFrame:frame,ownerID:session.id,ownerName:name)
            session.change("Export settings",ticket:ticket){$0.output.format=format;$0.output.rate=rate;$0.creative.sound.exportEnabled=sound};dismiss()
        }catch{self.error=error.localizedDescription}
    }
}
