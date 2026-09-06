// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "DriftCore",
    platforms: [.macOS("13.3")],
    products: [.library(name: "DriftCore", targets: ["DriftCore"])],
    targets: [
        .target(name: "DriftCore"),
        .testTarget(name: "DriftCoreTests", dependencies: ["DriftCore"]),
    ]
)
