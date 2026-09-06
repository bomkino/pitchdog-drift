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
    @State private var mode="all"
    @State private var startSeconds=0.0
    @State private var endSeconds=1.0
    @State private var error:String?
    @State private var flatten=false
    init(session:EditorSession,transport:Transport,documentName:String){self.session=session;self.transport=transport;self.documentName=documentName;_format=State(initialValue:session.project.output.format);_rate=State(initialValue:session.project.output.rate);_endSeconds=State(initialValue:transport.duration)}
    private var compatible:Bool{format != .mp4 || !session.project.transparent || flatten}
    private var frameRates:[OutputRate]{[try! OutputRate(24),try! OutputRate(25),try! OutputRate(30),try! OutputRate(50),try! OutputRate(60),try! OutputRate(24000,1001),try! OutputRate(30000,1001),try! OutputRate(60000,1001)]}
    var body:some View{
        VStack(alignment:.leading,spacing:18){
            Text("Export").font(.title2.weight(.semibold))
            Form{
                Picker("Format",selection:$format){Text("MP4 · H.264").tag(OutputFormat.mp4);Text("PNG · Current frame").tag(OutputFormat.png);Text("PNG sequence").tag(OutputFormat.pngSequence)}
                if format != .png{
                    Picker("Frame rate",selection:$rate){ForEach(frameRates,id:\.self){r in Text(String(format:"%.3g fps",Double(r.numerator)/Double(r.denominator))).tag(r)}}
                    Picker("Range",selection:$mode){Text("Whole sequence").tag("all");Text("Selected Spotlight / Closing").tag("cue");Text("Custom").tag("custom")}
                    if mode=="custom"{TextField("Start, seconds",value:$startSeconds,format:.number);TextField("End, seconds",value:$endSeconds,format:.number)}
                }
                LabeledContent("Size",value:"\(session.project.canvas.width) × \(session.project.canvas.height)")
                if format == .mp4 && session.project.transparent{Toggle("Use opaque background for this export",isOn:$flatten)}
                if format == .mp4{Toggle("Authored sound",isOn:Binding(get:{session.project.creative.sound.exportEnabled},set:{value in session.change("Export sound"){$0.creative.sound.exportEnabled=value}}))}
                Text(format == .mp4 ? "Rec.709 · source clips are silent":"sRGB · transparency preserved").foregroundStyle(.secondary)
            }.formStyle(.grouped)
            if let error{Text(error).foregroundStyle(.red).textSelection(.enabled)}
            HStack{Spacer();Button("Cancel"){dismiss()}.keyboardShortcut(.cancelAction);Button("Export…",action:export).keyboardShortcut(.defaultAction).disabled(!compatible || ExportCenter.shared.busy)}
        }.padding(24).frame(width:480)
    }
    private func export(){
        do{
            var project=session.project;project.output.format=format;project.output.rate=rate;if format == .mp4 && flatten{project.transparent=false}
            let snapshot=try RenderSnapshot(project:project,workspace:session.workspace),fps=Double(rate.numerator)/Double(rate.denominator)
            let frame=min(snapshot.plan.schedule.totalFrames-1,max(0,Int64(floor(transport.seconds*fps))))
            var range:ExportRange?
            if format != .png{
                if mode=="custom"{
                    guard startSeconds.isFinite,endSeconds.isFinite,startSeconds>=0,endSeconds<=snapshot.plan.duration else{throw NativeFailure.message("Enter a range inside the sequence.")}
                    range=try ExportRange(start:Int64(floor(startSeconds*fps)),end:Int64(ceil(endSeconds*fps-1e-8)),total:snapshot.plan.schedule.totalFrames)
                }else if mode=="cue"{
                    guard session.selection.count==1,let id=session.selection.first,let cue=snapshot.plan.schedule.cues.first(where:{$0.slideID==id}) else{throw NativeFailure.message("Select one slide with a Spotlight or Closing cue.")}
                    range=try ExportRange(start:cue.startFrame,end:cue.endFrame,total:snapshot.plan.schedule.totalFrames)
                }
            }
            let panel=NSSavePanel();panel.title="Export Drift";panel.canCreateDirectories=true
            let name=documentName.isEmpty ? "Drift":documentName
            panel.nameFieldStringValue=name+(format == .pngSequence ? " Frames":format == .mp4 ? ".mp4":".png")
            if format != .pngSequence{panel.allowedContentTypes=[format == .mp4 ? .mpeg4Movie:.png]}
            guard panel.runModal() == .OK,let url=panel.url else{return}
            if format == .pngSequence,FileManager.default.fileExists(atPath:url.path){throw NativeFailure.message("Choose a new folder. Existing PNG sequence folders are not replaced.")}
            ExportCenter.shared.start(snapshot:snapshot,destination:url,range:range,stillFrame:frame)
            session.change("Export settings"){$0.output.format=format;$0.output.rate=rate};dismiss()
        }catch{self.error=error.localizedDescription}
    }
}
