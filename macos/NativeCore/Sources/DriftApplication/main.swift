import AppKit
let app=NSApplication.shared
let delegate=ApplicationDelegate()
app.delegate=delegate
app.setActivationPolicy(.regular)
app.run()
