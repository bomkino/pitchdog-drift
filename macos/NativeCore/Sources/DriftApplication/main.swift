import AppKit
// Instantiate before AppKit asks for the shared document controller.
let documents=DriftDocumentController()
let app=NSApplication.shared
let delegate=ApplicationDelegate()
app.delegate=delegate
app.setActivationPolicy(.regular)
app.run()
