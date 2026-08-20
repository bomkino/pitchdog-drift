import Foundation

extension NativeBridgeHost {
    /// Finder reveal follows the broker's last successfully committed file.
    /// That may be a media export or a portable project, never staging bytes.
    func revealLastCommittedFileInFinder() {
        revealLastExportInFinder()
    }
}
