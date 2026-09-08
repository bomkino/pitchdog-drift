import AppKit
// Instantiate before AppKit asks for the shared document controller.
let documents=DriftDocumentController()
let app=NSApplication.shared
let delegate=ApplicationDelegate()
app.delegate=delegate
app.setActivationPolicy(.regular)
do { try DriftType.load(); app.run() }
catch { app.presentError(error) }
