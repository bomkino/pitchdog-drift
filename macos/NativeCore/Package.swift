// swift-tools-version: 6.0
import PackageDescription
import Foundation
let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
let sdk=ProcessInfo.processInfo.environment["DRIFT_CODEC_SDK"] ?? root.appendingPathComponent("build/native-codecs").path
var dependencies:[Package.Dependency]=[]
var targets:[Target]=[
    .target(name:"DriftCore",resources:[.process("Resources")]),
    .testTarget(name:"DriftCoreTests",dependencies:["DriftCore"])
]
var products:[Product]=[.library(name:"DriftCore",targets:["DriftCore"])]
#if os(macOS)
if ProcessInfo.processInfo.environment["DRIFT_CORE_ONLY"] != "1" {
targets += [
    .target(name:"CDriftArchive",publicHeadersPath:"include",cSettings:[.unsafeFlags(["-I",sdk+"/include"])],linkerSettings:[.unsafeFlags([sdk+"/lib/libarchive.a"]),.linkedLibrary("z")]),
    .target(name:"CDriftCodecs",publicHeadersPath:"include",cxxSettings:[.unsafeFlags(["-I",sdk+"/include"])],linkerSettings:[.unsafeFlags(["-L",sdk+"/lib"]),.linkedLibrary("webpdemux"),.linkedLibrary("webp"),.linkedLibrary("sharpyuv"),.linkedLibrary("webm"),.linkedLibrary("vpx")]),
    .target(name:"DriftNative",dependencies:["DriftCore","CDriftArchive","CDriftCodecs"],linkerSettings:[.linkedFramework("Metal"),.linkedFramework("MetalKit"),.linkedFramework("AVFoundation"),.linkedFramework("CoreImage"),.linkedFramework("ImageIO"),.linkedFramework("AudioToolbox")]),
    .testTarget(name:"DriftNativeTests",dependencies:["DriftNative","DriftCore"])
]
if ProcessInfo.processInfo.environment["DRIFT_BUILD_APP"] == "1" {
    var applicationDependencies:[Target.Dependency]=["DriftNative","DriftCore"]
    // Core-only graphs never resolve UI. Local overrides remain development pilots.
    var studioPackageIdentity="pitchdog-studio-ui"
    if let path=ProcessInfo.processInfo.environment["PITCHDOG_STUDIO_UI_PATH"], !path.isEmpty {
        dependencies.append(.package(name:"PitchdogStudioUI",path:path))
        studioPackageIdentity="PitchdogStudioUI"
    } else {
        dependencies.append(.package(url:"https://github.com/bomkino/pitchdog-studio-ui.git",revision:"8f296630180ea4dbc77fe65a9c86e88a5b9bb9c0"))
    }
    applicationDependencies.append(.product(name:"PitchdogStudioUI",package:studioPackageIdentity))
    targets += [.executableTarget(name:"DriftApplication",dependencies:applicationDependencies,linkerSettings:[.linkedFramework("AppKit"),.linkedFramework("SwiftUI")])]
    products += [.executable(name:"Drift",targets:["DriftApplication"])]
}
}
#endif
let package=Package(name:"DriftCore",platforms:[.macOS("13.3")],products:products,dependencies:dependencies,targets:targets,cxxLanguageStandard:.cxx17)
