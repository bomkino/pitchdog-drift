import AppKit
import Foundation
import WebKit

extension DriftAppDelegate {
    func installMenus() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu(title: "Drift")
        appMenuItem.submenu = appMenu
        appMenu.addItem(withTitle: "About Drift", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Drift", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Drift", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)
        let fileMenu = NSMenu(title: "File")
        fileMenuItem.submenu = fileMenu
        addCommandItem(to: fileMenu, title: "Add Slides…", action: #selector(addSlides(_:)), key: "o")
        addCommandItem(to: fileMenu, title: "Add Presenter Video…", action: #selector(addPresenter(_:)), key: "o", modifiers: [.command, .shift])
        addCommandItem(to: fileMenu, title: "Open Portable Project…", action: #selector(openProject(_:)), key: "o", modifiers: [.command, .option])
        fileMenu.addItem(.separator())
        addCommandItem(to: fileMenu, title: "Save Portable Project…", action: #selector(saveProject(_:)), key: "s")
        fileMenu.addItem(.separator())
        addCommandItem(to: fileMenu, title: "Export MP4 Master…", action: #selector(exportMP4(_:)), key: "e")
        addCommandItem(to: fileMenu, title: "Save PNG Still…", action: #selector(exportPNG(_:)), key: "e", modifiers: [.command, .shift])
        addCommandItem(to: fileMenu, title: "Export PNG Sequence…", action: #selector(exportFrames(_:)), key: "e", modifiers: [.command, .option])
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenuItem.submenu = editMenu
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let playbackMenuItem = NSMenuItem()
        mainMenu.addItem(playbackMenuItem)
        let playbackMenu = NSMenu(title: "Playback")
        playbackMenuItem.submenu = playbackMenu
        addCommandItem(to: playbackMenu, title: "Play or Pause", action: #selector(togglePlayback(_:)), key: "p")
        addCommandItem(to: playbackMenu, title: "Previous Slide", action: #selector(previousSlide(_:)), key: "[", modifiers: [.command])
        addCommandItem(to: playbackMenu, title: "Next Slide", action: #selector(nextSlide(_:)), key: "]", modifiers: [.command])
        playbackMenu.addItem(.separator())
        addCommandItem(to: playbackMenu, title: "Cancel Export", action: #selector(cancelExport(_:)), key: ".", modifiers: [.command])

        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        viewMenuItem.submenu = viewMenu
        addCommandItem(to: viewMenu, title: "Reload Studio", action: #selector(reload(_:)), key: "r")
        viewMenu.addItem(.separator())
        addCommandItem(to: viewMenu, title: "Zoom In", action: #selector(zoomIn(_:)), key: "+")
        addCommandItem(to: viewMenu, title: "Zoom Out", action: #selector(zoomOut(_:)), key: "-")
        addCommandItem(to: viewMenu, title: "Actual Size", action: #selector(resetZoom(_:)), key: "0")
        viewMenu.addItem(.separator())
        addCommandItem(to: viewMenu, title: "Toggle Full Frame", action: #selector(toggleFocus(_:)), key: "f", modifiers: [.command, .shift])
        let fullScreen = viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.command, .control]

        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenuItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(.separator())
        windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        NSApp.windowsMenu = windowMenu

        let helpMenuItem = NSMenuItem()
        mainMenu.addItem(helpMenuItem)
        let helpMenu = NSMenu(title: "Help")
        helpMenuItem.submenu = helpMenu
        let source = helpMenu.addItem(withTitle: "Drift Source and Documentation", action: #selector(openDocumentation(_:)), keyEquivalent: "")
        source.target = self
        NSApp.helpMenu = helpMenu

        NSApp.mainMenu = mainMenu
    }

    private func addCommandItem(
        to menu: NSMenu,
        title: String,
        action: Selector,
        key: String,
        modifiers: NSEvent.ModifierFlags = [.command]
    ) {
        let item = menu.addItem(withTitle: title, action: action, keyEquivalent: key)
        item.keyEquivalentModifierMask = modifiers
        item.target = self
    }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        switch menuItem.action {
        case #selector(cancelExport(_:)):
            return clientState.exporting
        case #selector(reload(_:)):
            return !clientState.busy
        case #selector(zoomIn(_:)), #selector(zoomOut(_:)), #selector(resetZoom(_:)):
            return webView != nil
        case #selector(addSlides(_:)), #selector(addPresenter(_:)), #selector(openProject(_:)),
             #selector(saveProject(_:)), #selector(exportMP4(_:)), #selector(exportPNG(_:)),
             #selector(exportFrames(_:)), #selector(togglePlayback(_:)), #selector(previousSlide(_:)),
             #selector(nextSlide(_:)), #selector(toggleFocus(_:)):
            return clientState.ready && !clientState.busy
        default:
            return true
        }
    }

    @objc private func addSlides(_ sender: Any?) { performClientCommand("add-slides") }
    @objc private func addPresenter(_ sender: Any?) { performClientCommand("add-presenter") }
    @objc private func openProject(_ sender: Any?) { performClientCommand("open-project") }
    @objc private func saveProject(_ sender: Any?) { performClientCommand("save-project") }
    @objc private func exportMP4(_ sender: Any?) { performClientCommand("export-mp4") }
    @objc private func exportPNG(_ sender: Any?) { performClientCommand("export-png") }
    @objc private func exportFrames(_ sender: Any?) { performClientCommand("export-frames") }
    @objc private func cancelExport(_ sender: Any?) { performClientCommand("cancel-export", allowWhileBusy: true) }
    @objc private func togglePlayback(_ sender: Any?) { performClientCommand("play-pause") }
    @objc private func previousSlide(_ sender: Any?) { performClientCommand("previous-slide") }
    @objc private func nextSlide(_ sender: Any?) { performClientCommand("next-slide") }
    @objc private func toggleFocus(_ sender: Any?) { performClientCommand("toggle-focus") }

    @objc private func reload(_ sender: Any?) {
        reloadApplication()
    }

    @objc private func zoomIn(_ sender: Any?) {
        guard let webView else { return }
        webView.setMagnification(min(webView.magnification + 0.1, 2.0), centeredAt: .zero)
    }

    @objc private func zoomOut(_ sender: Any?) {
        guard let webView else { return }
        webView.setMagnification(max(webView.magnification - 0.1, 0.5), centeredAt: .zero)
    }

    @objc private func resetZoom(_ sender: Any?) {
        webView?.setMagnification(1.0, centeredAt: .zero)
    }

    @objc private func openDocumentation(_ sender: Any?) {
        guard let url = URL(string: "https://github.com/bomkino/pitchdog-drift") else { return }
        NSWorkspace.shared.open(url)
    }

    func performClientCommand(_ command: String, allowWhileBusy: Bool = false) {
        guard let webView,
              clientState.ready,
              allowWhileBusy || !clientState.busy,
              let commandData = try? JSONSerialization.data(withJSONObject: command, options: [.fragmentsAllowed]),
              let commandJSON = String(data: commandData, encoding: .utf8) else {
            NSSound.beep()
            return
        }
        webView.evaluateJavaScript("void window.__driftNativeCommand?.(\(commandJSON));")
    }

}
