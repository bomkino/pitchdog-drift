import AppKit
import SwiftUI
import DriftCore
import DriftNative

enum RecoveryStore {
    static func directory()throws->URL{
        let base=try FileManager.default.url(for:.applicationSupportDirectory,in:.userDomainMask,appropriateFor:nil,create:true).appendingPathComponent("Drift/Native Workspaces",isDirectory:true)
        try FileManager.default.createDirectory(at:base,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700]);return base
    }
    static func workspace()throws->MediaWorkspace{try MediaWorkspace(root:directory().appendingPathComponent(UUID().uuidString,isDirectory:true))}
    static func recoveries()throws->[URL]{try FileManager.default.contentsOfDirectory(at:directory(),includingPropertiesForKeys:[.isDirectoryKey],options:.skipsHiddenFiles).filter{FileManager.default.fileExists(atPath:$0.appendingPathComponent("recovery.json").path)}}
}
@objc(DriftNativeDocument) @MainActor final class DriftDocument:NSDocument {
    nonisolated static let typeName="dog.pitch.drift.native-document"
    nonisolated private let storage=DocumentStorage()
    nonisolated let writeProbe=NativeWriteProbe()
    private(set) var editor:EditorSession?
    private(set) var transport:Transport?
    private(set) var initializationError:(any Error)?
    private var loading:(DriftProject,MediaWorkspace,Bool)?
    private var busySaving=false
    // NSDocumentController may initialize/read on its opening queue. No UI or
    // main-actor audio state is constructed until the document reaches a window.
    private lazy var sound=PreviewSound()
    override init(){super.init()}
    func bindOpenedFile(_ url:URL?,type:String,modified:Date?,recovered:Bool){
        fileURL=url;fileType=type;fileModificationDate=modified
        if recovered,let value=loading{loading=(value.0,value.1,false)}
    }
    nonisolated override var isDocumentEdited:Bool{storage.isDirty}
    // RecoveryWriter owns private autosave; only Save/Save As replaces the named file.
    nonisolated override class var autosavesInPlace:Bool{false}
    nonisolated override var autosavingFileType:String?{nil}
    nonisolated override class func canConcurrentlyReadDocuments(ofType typeName:String)->Bool{true}
    nonisolated override func canAsynchronouslyWrite(to url:URL,ofType typeName:String,for saveOperation:NSDocument.SaveOperationType)->Bool{true}
    nonisolated override func read(from url:URL,ofType typeName:String)throws{
        let read=try storage.beginRead()
        let (project,workspace)=try ProjectIO.read(url,workspace:RecoveryStore.workspace())
        let adopt:@MainActor ()throws->Void = {[self] in
            try storage.finishRead(read)
            if let editor{try editor.load(project,workspace:workspace,saved:true);transport?.update(editor.snapshot.plan);storage.set(editor.snapshot,editor.ticket(),dirty:editor.dirty)}
            else{loading=(project,workspace,true)}
        }
        if Thread.isMainThread{try MainActor.assumeIsolated(adopt)}else{try DispatchQueue.main.sync{try MainActor.assumeIsolated(adopt)}}
    }
    nonisolated override func write(to url:URL,ofType typeName:String)throws{
        let (snapshot,ticket)=try storage.writeSnapshot()
        if !Thread.isMainThread{unblockUserInteraction()}
        try ProjectIO.write(snapshot,to:url,beforePublish:{try self.writeProbe.inspect();try self.storage.accepts(ticket)})
    }
    override func save(to url:URL,ofType typeName:String,for saveOperation:NSDocument.SaveOperationType,completionHandler:@escaping ((any Error)?)->Void){
        guard editor?.lookAudition==nil else{completionHandler(NativeFailure.message("Apply or cancel the Look audition before saving."));return}
        guard !busySaving else{completionHandler(NativeFailure.message("Wait for the current save to finish."));return}
        do{editor?.endGesture();try storage.begin();busySaving=true}catch{completionHandler(error);return}
        super.save(to:url,ofType:typeName,for:saveOperation){[weak self] error in
            Task{@MainActor in
                guard let self else{completionHandler(error);return}
                let saved=self.storage.finish();self.busySaving=false
                if error==nil,saveOperation != .autosaveElsewhereOperation,let saved{self.editor?.saved(saved.0.project,ticket:saved.1)}
                completionHandler(error)
            }
        }
    }
    convenience init(recoveryRoot:URL)throws{
        self.init();let bytes=try Data(contentsOf:recoveryRoot.appendingPathComponent("recovery.json")),project=try DriftProject.decode(bytes),workspace=try MediaWorkspace(root:recoveryRoot)
        // Recover as an untitled document: never bind an interrupted session to an
        // old original file without the user's new Save decision.
        loading=(project,workspace,false)
    }
    override func makeWindowControllers(){
        guard windowControllers.isEmpty else{return}
        if fileType==nil{fileType=Self.typeName}
        initializationError=nil
        do{
            let value:(DriftProject,MediaWorkspace,Bool)
            if let loading{value=loading;self.loading=nil}else{value=(try DriftProject(creative:CreativeCatalog.load().defaults),try RecoveryStore.workspace(),true)}
            let session=try EditorSession(project:value.0,workspace:value.1,saved:value.2),transport=Transport(plan:session.snapshot.plan)
            self.editor=session;self.transport=transport;storage.set(session.snapshot,session.ticket(),dirty:session.dirty)
            sound.onError={[weak session] message in session?.issue="Sound: \(message)"}
            transport.didTick={[weak self,weak session,weak transport] _,_ in guard let self,let session,let transport else{return};self.sound.update(snapshot:session.snapshot,revision:session.revision,transport:transport)}
            session.didEdit={[weak self,weak session,weak transport] in guard let self,let session else{return}
                self.storage.set(session.snapshot,session.ticket(),dirty:session.dirty);transport?.update(session.snapshot.plan)
                self.updateChangeCount(session.dirty ? .changeDone:.changeCleared)
                self.windowControllers.forEach{$0.window?.isDocumentEdited=session.dirty}
            }
            let controller=StudioWindowController(document:self,session:session,transport:transport);addWindowController(controller)
            if !value.2{updateChangeCount(.changeDone)}
        }catch{
            initializationError=error
            NSLog("Drift could not open its document window: %@",error.localizedDescription)
            if !CommandLine.arguments.contains("--native-self-test"){presentError(error)}
        }
    }
    override func close(){storage.close();sound.stop();transport?.pause();editor?.close(discardRecovery:true);super.close()}
    @objc func addMedia(_ sender:Any?){
        guard let editor,!editor.importing,let window=windowControllers.first?.window else{return};let ticket=editor.ticket()
        let panel=NSOpenPanel();panel.title="Add media";panel.allowsMultipleSelection=true;panel.canChooseDirectories=false
        panel.allowedContentTypes=MediaTypes.all
        panel.beginSheetModal(for:window){[weak editor] response in
            guard response == .OK else{return};Task{@MainActor in editor?.importURLs(panel.urls,ticket:ticket)}
        }
    }
    func replace(_ id:String,locate:Bool){
        guard let editor,let slide=editor.project.slides.first(where:{$0.id==id}),let source=editor.project.assets[slide.assetID],let window=windowControllers.first?.window else{return}
        let ticket=editor.ticket(targets:[id]),panel=NSOpenPanel();panel.title=locate ? "Locate original":"Replace media";panel.allowedContentTypes=MediaTypes.all;panel.canChooseDirectories=false
        panel.beginSheetModal(for:window){[weak editor] response in guard response == .OK,let url=panel.url else{return};Task{@MainActor in editor?.importURLs([url],ticket:ticket,replacing:id,expectedFingerprint:locate ? source.sha256:nil)}}
    }
}
final class StudioWindowController:NSWindowController {
    let session:EditorSession,transport:Transport
    init(document:DriftDocument,session:EditorSession,transport:Transport){
        self.session=session;self.transport=transport
        let window=NSWindow(contentRect:NSRect(x:0,y:0,width:1360,height:850),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        super.init(window:window);window.title="Drift";window.minSize=NSSize(width:1100,height:680);window.center();window.tabbingMode = .disallowed
        window.contentView=NSHostingView(rootView:StudioView(session:session,transport:transport,document:document))
        window.setFrameAutosaveName("Drift Native Studio")
    }
    required init?(coder:NSCoder){fatalError("Programmatic window")}
    @objc func undo(_ sender:Any?){session.undo()}
    @objc func redo(_ sender:Any?){session.redo()}
    @objc func togglePlayback(_ sender:Any?){transport.toggle()}
    @objc func addMedia(_ sender:Any?){(document as? DriftDocument)?.addMedia(sender)}
}
import UniformTypeIdentifiers
enum MediaTypes {
    static let all:[UTType]=[.png,.jpeg,.tiff,.mpeg4Movie,.quickTimeMovie]+["webp","webm","avif","heic","heif","m4v"].compactMap{UTType(filenameExtension:$0)}
}
@MainActor final class ApplicationDelegate:NSObject,NSApplicationDelegate,NSMenuDelegate {
    private var quitting=false
    func applicationDidFinishLaunching(_ notification:Notification){
        makeMenus()
        if CommandLine.arguments.contains("--native-self-test"){Task{await NativeApplicationProof.run()};return}
        do{
            let recoveries=try RecoveryStore.recoveries()
            for root in recoveries{
                let alert=NSAlert();alert.messageText="Recover an interrupted Drift document?";alert.informativeText="The saved original was not replaced. Recovery opens a separate untitled document.";alert.addButton(withTitle:"Recover");alert.addButton(withTitle:"Discard recovery")
                if alert.runModal() == .alertFirstButtonReturn{let doc=try DriftDocument(recoveryRoot:root);NSDocumentController.shared.addDocument(doc);doc.makeWindowControllers();doc.showWindows()}
                else{try FileManager.default.removeItem(at:root)}
            }
        }catch{NSApp.presentError(error)}
        if NSDocumentController.shared.documents.isEmpty{NSDocumentController.shared.newDocument(nil)}
        NSApp.activate(ignoringOtherApps:true)
    }
    func applicationShouldOpenUntitledFile(_ sender:NSApplication)->Bool{!CommandLine.arguments.contains("--native-self-test")}
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply{
        if quitting{return .terminateNow}
        if ExportCenter.shared.busy{
            let alert=NSAlert();alert.messageText="An export is still running.";alert.informativeText="Keep working, or cancel it before quitting.";alert.addButton(withTitle:"Keep working");alert.addButton(withTitle:"Cancel export and quit")
            if alert.runModal() != .alertSecondButtonReturn{return .terminateCancel};ExportCenter.shared.cancel()
        }
        NSDocumentController.shared.closeAllDocuments(withDelegate:self,didCloseAllSelector:#selector(closedAll(_:didCloseAll:contextInfo:)),contextInfo:nil)
        return .terminateLater
    }
    @objc private func closedAll(_ controller:NSDocumentController,didCloseAll:Bool,contextInfo:UnsafeMutableRawPointer?){
        guard didCloseAll else{NSApp.reply(toApplicationShouldTerminate:false);return}
        Task{@MainActor in
            while ExportCenter.shared.busy{try? await Task.sleep(nanoseconds:25_000_000)}
            quitting=true;NSApp.reply(toApplicationShouldTerminate:true)
        }
    }
    func menuNeedsUpdate(_ menu:NSMenu){
        guard menu.title=="Open Recent" else{return};menu.removeAllItems()
        for url in NSDocumentController.shared.recentDocumentURLs{let item=NSMenuItem(title:url.lastPathComponent,action:#selector(openRecent(_:)),keyEquivalent:"");item.target=self;item.representedObject=url;menu.addItem(item)}
        menu.addItem(.separator());menu.addItem(NSMenuItem(title:"Clear Menu",action:#selector(NSDocumentController.clearRecentDocuments(_:)),keyEquivalent:""))
    }
    @objc private func openRecent(_ sender:NSMenuItem){guard let url=sender.representedObject as? URL else{return};NSDocumentController.shared.openDocument(withContentsOf:url,display:true){_,_,error in if let error{NSApp.presentError(error)}}}
    private func makeMenus(){
        let main=NSMenu();NSApp.mainMenu=main
        func menu(_ title:String)->NSMenu{let item=NSMenuItem();item.title=title;let submenu=NSMenu(title:title);item.submenu=submenu;main.addItem(item);return submenu}
        func item(_ menu:NSMenu,_ title:String,_ action:Selector?,_ key:String="",_ modifiers:NSEvent.ModifierFlags = .command){let i=NSMenuItem(title:title,action:action,keyEquivalent:key);i.keyEquivalentModifierMask=modifiers;menu.addItem(i)}
        let app=menu("Drift");item(app,"About Drift",#selector(NSApplication.orderFrontStandardAboutPanel(_:)));app.addItem(.separator());item(app,"Hide Drift",#selector(NSApplication.hide(_:)),"h");app.addItem(.separator());item(app,"Quit Drift",#selector(NSApplication.terminate(_:)),"q")
        let file=menu("File");item(file,"New",#selector(NSDocumentController.newDocument(_:)),"n");item(file,"Open…",#selector(NSDocumentController.openDocument(_:)),"o");let recent=NSMenu(title:"Open Recent"),recentItem=NSMenuItem(title:"Open Recent",action:nil,keyEquivalent:"");recentItem.submenu=recent;recent.delegate=self;file.addItem(recentItem)
        file.addItem(.separator());item(file,"Add Media…",#selector(StudioWindowController.addMedia(_:)),"i");item(file,"Save",#selector(NSDocument.save(_:)),"s");item(file,"Save As…",#selector(NSDocument.saveAs(_:)),"s",[.command,.shift]);item(file,"Revert to Saved…",#selector(NSDocument.revertToSaved(_:)));file.addItem(.separator());item(file,"Close",#selector(NSWindow.performClose(_:)),"w")
        let edit=menu("Edit");item(edit,"Undo",Selector(("undo:")),"z");item(edit,"Redo",Selector(("redo:")),"z",[.command,.shift]);edit.addItem(.separator());item(edit,"Cut",#selector(NSText.cut(_:)),"x");item(edit,"Copy",#selector(NSText.copy(_:)),"c");item(edit,"Paste",#selector(NSText.paste(_:)),"v");item(edit,"Select All",#selector(NSText.selectAll(_:)),"a")
        let window=menu("Window");NSApp.windowsMenu=window;item(window,"Minimize",#selector(NSWindow.performMiniaturize(_:)),"m");item(window,"Zoom",#selector(NSWindow.performZoom(_:)));item(window,"Bring All to Front",#selector(NSApplication.arrangeInFront(_:)))
    }
}
