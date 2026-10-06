// swift-tools-version: 6.0
//
// pitch.dog Studio v2 — one repository, three Mac apps.
//
//   RenderCore   GPU context, colour science, finishing, readback, video writing
//   BackdropKit  generative background engine (Metal, analytic, loopable)
//   StageKit     card renderer, scene engine, depth, light and export
//   StudioKit    shared design language, controls and window chrome
//   Updates      in-app updates from GitHub releases (Sparkle)
//
//   Backdrop     standalone background studio
//   Drift        slides into cinematic reels
//   Galileo      media into motion galleries
//   studio-lab   headless renders for visual review and tests
//
import PackageDescription

let settings: [SwiftSetting] = [
    .swiftLanguageMode(.v5),
]

// The apps load Sparkle from Contents/Frameworks, where build-apps.sh puts it.
let appLinker: [LinkerSetting] = [
    .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"]),
]

let package = Package(
    name: "Studio",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "RenderCore", targets: ["RenderCore"]),
        .library(name: "BackdropKit", targets: ["BackdropKit"]),
        .library(name: "StageKit", targets: ["StageKit"]),
        .library(name: "StudioKit", targets: ["StudioKit"]),
        .executable(name: "Backdrop", targets: ["BackdropApp"]),
        .executable(name: "Drift", targets: ["DriftApp"]),
        .executable(name: "Galileo", targets: ["GalileoApp"]),
        .executable(name: "studio-lab", targets: ["StudioLab"]),
    ],
    dependencies: [
        // In-app updates from GitHub releases (Updates module).
        .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.0"),
    ],
    targets: [
        .target(name: "RenderCore", swiftSettings: settings),
        .target(name: "BackdropKit", dependencies: ["RenderCore"], swiftSettings: settings),
        .target(name: "StageKit", dependencies: ["RenderCore", "BackdropKit"], swiftSettings: settings),
        .target(name: "StudioKit", dependencies: ["RenderCore", "BackdropKit", "StageKit"], swiftSettings: settings),
        .target(name: "Updates", dependencies: [.product(name: "Sparkle", package: "Sparkle")], swiftSettings: settings),
        .executableTarget(name: "BackdropApp", dependencies: ["StudioKit", "Updates"], swiftSettings: settings, linkerSettings: appLinker),
        .executableTarget(name: "DriftApp", dependencies: ["StudioKit", "Updates"], swiftSettings: settings, linkerSettings: appLinker),
        .executableTarget(name: "GalileoApp", dependencies: ["StudioKit", "Updates"], swiftSettings: settings, linkerSettings: appLinker),
        .executableTarget(name: "StudioLab", dependencies: ["StudioKit"], swiftSettings: settings),
    ]
)
