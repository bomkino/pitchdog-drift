import AppKit
import Foundation
import DriftNative

/// AppKit invokes the document factory on its concurrent opening queue. Swift
/// documents must nevertheless be initialized on the main actor. Split these
/// boundaries rather than forcing an entire archive read onto the UI thread.
@MainActor final class DriftDocumentController:NSDocumentController {
    nonisolated override func makeDocument(withContentsOf url:URL,ofType typeName:String)throws->NSDocument{
        try makeNativeDocument(for:url,contentsOf:url,type:typeName)
    }
    nonisolated override func makeDocument(for url:URL?,withContentsOf contentsURL:URL,ofType typeName:String)throws->NSDocument{
        try makeNativeDocument(for:url,contentsOf:contentsURL,type:typeName)
    }
    nonisolated private func onMain<T:Sendable>(_ work:@MainActor ()throws->T)rethrows->T{
        if Thread.isMainThread{return try MainActor.assumeIsolated(work)}
        return try DispatchQueue.main.sync{try MainActor.assumeIsolated(work)}
    }
    nonisolated private func makeNativeDocument(for url:URL?,contentsOf contentsURL:URL,type:String)throws->NSDocument{
        guard type==DriftDocument.typeName else{throw NativeFailure.message("This is not a native Drift document.")}
        let document=onMain{DriftDocument()}
        // This is the normal factory's read/metadata contract. Registration,
        // recent-file tracking and window creation remain NSDocumentController's.
        try document.read(from:contentsURL,ofType:type)
        let modified=try url?.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate
        onMain{document.bindOpenedFile(url,type:type,modified:modified,recovered:url?.standardizedFileURL != contentsURL.standardizedFileURL)}
        return document
    }
}
