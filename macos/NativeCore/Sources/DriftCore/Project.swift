import Foundation

extension DriftCoreError: LocalizedError {
    public var errorDescription: String? {
        switch self { case .invalid(let message): return message; case .overflow: return "The value exceeds Drift's supported range." }
    }
}
struct AnyField: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init?(stringValue: String) { self.stringValue=stringValue }
    init?(intValue: Int) { return nil }
}
func requireKeys(_ decoder: any Decoder, allowed: Set<String>, optional: Set<String> = []) throws {
    let values=try decoder.container(keyedBy: AnyField.self)
    let found=Set(values.allKeys.map(\.stringValue))
    guard found.isSubset(of: allowed), allowed.subtracting(optional).isSubset(of: found) else {
        throw DriftCoreError.invalid("The document contains missing or unsupported fields at \(decoder.codingPath.map(\.stringValue).joined(separator: ".")).")
    }
}
public func bounded(_ value: Double, _ low: Double, _ high: Double) -> Double { min(high,max(low,value)) }
func require(_ condition: Bool, _ message: String) throws { if !condition {throw DriftCoreError.invalid(message)} }
func number(_ value: Double, _ bounds: ClosedRange<Double>, _ name: String) throws {
    try require(value.isFinite && bounds.contains(value), "\(name) is outside its supported range.")
}
func identity(_ text: String) -> Bool {
    !text.isEmpty && text.utf8.count <= 128 && text.utf8.allSatisfy { (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0==45 || $0==95 }
}
public struct CreativeValues: Codable, Equatable, Sendable {
    public var motion: MotionSettings
    public var card: CardSettings
    public var material: MaterialSettings
    public var lighting: LightingSettings
    public var atmosphere: AtmosphereSettings
    public var lens: LensSettings
    public var sound: SoundSettings
    public func validate() throws {
        try motion.validate();try card.validate();try material.validate();try lighting.validate()
        try atmosphere.validate();try lens.validate();try sound.validate()
        try number(card.aspectWidth,0.01...100,"Slide aspect width");try number(card.aspectHeight,0.01...100,"Slide aspect height")
        try number(card.scale,0.1...1.6,"Slide size");try number(card.radius,0...500,"Corners")
        try number(card.smoothing,0...1,"Corner smoothing");try number(card.borderWidth,0...64,"Border")
        try number(card.borderOpacity,0...1,"Border opacity")
        try require(["straight","arc","ribbon","cylinder","tunnel","helix","orbit","cascade","figure-eight","switchback"].contains(motion.path.id),"The spatial path is unsupported.")
        try number(motion.path.gap,0...2.5,"Spacing");try number(motion.path.curvature,0...1,"Path curvature")
        try number(motion.path.depth,0...1,"Depth");try number(motion.path.banking,-45...45,"Banking")
        try number(motion.path.focusScale,0...1,"Focus size");try number(motion.path.edgeFade,0...1,"Edge fade")
        try number(motion.transport.slidesPerSecond,0...8,"Slide speed")
        for value in [motion.performance.weight,motion.performance.linger,motion.performance.release,motion.performance.runway,motion.performance.overlap,motion.performance.imperfection,motion.character.amount] {try number(value,0...1,"Motion character")}
        for value in [material.flex,material.roughness,material.sheen,material.finish.registration,material.finish.localSoftness,material.finish.localSmear,material.finish.microtexture] {try number(value,0...1,"Material")}
        for value in [lighting.artworkProtection,lighting.heroProtection,lighting.shadowOpacity,lighting.contactStrength,lighting.backgroundSpill,lighting.goboStrength,lighting.breath] {try number(value,0...1,"Lighting")}
        for value in [atmosphere.intensity,atmosphere.motion,atmosphere.grain,atmosphere.vignette,lens.presence,lens.focus,lens.directionalSmear,lens.chromaticSeparation,lens.bloom,lens.halation,lens.flare,lens.gateWeave,lens.cameraGrain,lens.vignette,sound.density,sound.texture,sound.masterLevel,sound.motionLevel,sound.interfaceLevel] {try number(value,0...1,"Look or sound amount")}
        try number(material.thickness,0...128,"Material thickness");try number(lighting.spillFocus,0.1...2,"Spill focus");try number(lens.curvature,-1...1,"Lens curvature")
        for colour in [card.borderColor,lighting.keyColor,lighting.fillColor,lighting.shadowColor,atmosphere.colourA,atmosphere.colourB,atmosphere.accent] {try RGBA.validateHex(colour)}
    }
}
public struct RGBA: Codable, Equatable, Sendable {
    public var r: Double;public var g: Double;public var b: Double;public var a: Double
    public init(_ r: Double,_ g: Double,_ b: Double,_ a: Double=1) {self.r=r;self.g=g;self.b=b;self.a=a}
    public init(hex: String) throws {
        try Self.validateHex(hex);let value=UInt32(hex.dropFirst(),radix:16)!
        self.init(Double((value>>16)&255)/255,Double((value>>8)&255)/255,Double(value&255)/255)
    }
    public static func validateHex(_ value: String) throws {
        try require(value.count==7 && value.first=="#" && UInt32(value.dropFirst(),radix:16) != nil,"Use a six-digit RGB colour.")
    }
}
public enum MediaKind: String, Codable, Sendable {case image,video,animatedImage}
public enum FramePolicy: String, Codable, Sendable {case matchCanvas,source,ratio}
public enum Fit: String, Codable, Sendable {case fit,fill}
public struct Crop: Codable, Equatable, Sendable {
    public var x=0.0,y=0.0,width=1.0,height=1.0
    public init() {}
    public func validate() throws {
        for v in [x,y,width,height] {try number(v,0...1,"Crop")}
        try require(width>0 && height>0 && x+width<=1.00000001 && y+height<=1.00000001,"Crop must stay within the original.")
    }
}
public struct Original: Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let path: String
    public let sha256: String
    public let byteLength: Int64
    public let kind: MediaKind
    public let subtype: String
    public let width: Int
    public let height: Int
    public let durationNanoseconds: Int64
    public let hasAlpha: Bool
    public let colourSpace: String
    public init(name: String,sha256: String,byteLength: Int64,kind: MediaKind,subtype: String,width: Int,height: Int,durationNanoseconds: Int64=0,hasAlpha: Bool=false,colourSpace: String="sRGB") throws {
        id=sha256;self.name=name;self.sha256=sha256;self.byteLength=byteLength;self.kind=kind;self.subtype=subtype
        self.width=width;self.height=height;self.durationNanoseconds=durationNanoseconds;self.hasAlpha=hasAlpha;self.colourSpace=colourSpace
        path="assets/\(sha256).\(subtype)";try validate()
    }
    public func validate() throws {
        try require(id==sha256 && sha256.count==64 && sha256.utf8.allSatisfy{(48...57).contains($0)||(97...102).contains($0)},"Invalid original identity.")
        try require(!name.isEmpty && name.utf8.count<=1024 && !name.contains("\0"),"Invalid original display name.")
        try require(["png","jpg","jpeg","webp","avif","heic","heif","tiff","tif","mp4","mov","m4v","webm"].contains(subtype),"Unsupported original format.")
        try require(path=="assets/\(sha256).\(subtype)","Invalid original path.")
        try require(byteLength>0 && byteLength<=MediaLimits.maximumOriginalBytes,"An original exceeds the storage limit.")
        try require(width>0 && height>0 && width<=32768 && height<=32768 && Int64(width)*Int64(height)<=MediaLimits.maximumSourcePixels,"The source image is too large to decode safely.")
        try require(durationNanoseconds>=0 && durationNanoseconds<=86_400_000_000_000,"Invalid source duration.")
        try require(kind == .image || durationNanoseconds>0,"A timed source needs a readable duration.")
        try require(["sRGB","Rec.709","Display P3"].contains(colourSpace),"The source colour space needs an explicit supported conversion.")
    }
}
public enum MediaLimits {
    // Disk capacity is independent from the decoded working-set limit. Enabling a
    // public capacity claim additionally requires the large-project runtime gate.
    public static let maximumOriginalBytes:Int64=512*1024*1024
    public static let maximumProjectBytes:Int64=4*1024*1024*1024
    public static let maximumSourcePixels:Int64=67_108_864
    public static let maximumTimedPixels:Int64=33_177_600
    public static let maximumSlides=512
    public static let maximumManifestBytes=8*1024*1024
}
public struct SourcePlayback: Codable, Equatable, Sendable {
    public var plays=true,loop=true
    public var trimInNanoseconds:Int64=0
    public var trimOutNanoseconds:Int64?=nil
    public var rate=1.0
    public init() {}
    public func validate(original: Original) throws {
        try number(rate,0.1...4,"Source rate")
        if original.kind == .image {return}
        let end=trimOutNanoseconds ?? original.durationNanoseconds
        try require(trimInNanoseconds>=0 && trimInNanoseconds<end && end<=original.durationNanoseconds,"The source trim is outside readable media.")
    }
    public func request(outputSeconds: Double,original: Original) throws -> SourceRequest {
        try require(outputSeconds.isFinite && outputSeconds>=0,"Invalid source clock.")
        try validate(original:original)
        if original.kind == .image {return .time(0)}
        let end=trimOutNanoseconds ?? original.durationNanoseconds
        if !plays {return .time(trimInNanoseconds)}
        let span=Double(end-trimInNanoseconds)
        let elapsed=outputSeconds*rate*1_000_000_000
        if !loop && elapsed>=span {return .lastBefore(end)}
        let offset=loop ? elapsed.truncatingRemainder(dividingBy:span):elapsed
        return .time(trimInNanoseconds+Int64(floor(offset)))
    }
}
public enum SourceRequest: Equatable, Sendable {case time(Int64),lastBefore(Int64)}
public struct Slide: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var assetID: String
    public var included=true,inSequence=true
    public var framePolicy:FramePolicy = .matchCanvas
    public var aspect:ExactRatio?=nil
    public var fit:Fit = .fit
    public var crop=Crop()
    public var focalX=0.5,focalY=0.5,scaleOffset=0.0
    public var playback=SourcePlayback()
    public init(assetID: String,id: String=UUID().uuidString) {self.id=id;self.assetID=assetID}
    public func aspectRatio(canvas: CanvasSize,original: Original) -> Double {
        switch framePolicy {case .matchCanvas:return canvas.ratio.value;case .source:return Double(original.width)/Double(original.height);case .ratio:return aspect?.value ?? canvas.ratio.value}
    }
    public func validate(original: Original) throws {
        try require(identity(id) && assetID==original.id,"Invalid slide identity or media reference.")
        try require(framePolicy != .ratio || aspect != nil,"Custom framing needs an exact ratio.")
        try crop.validate();try number(focalX,0...1,"Focal X");try number(focalY,0...1,"Focal Y");try number(scaleOffset,-0.75...0.75,"Slide scale")
        try playback.validate(original:original)
    }
}
public struct Pin: Codable, Equatable, Sendable {
    public var slideID:String
    public var pinOnly=true
    public var x=0.8,y=0.78,width=0.32
    public var framePolicy:FramePolicy = .source
    public var aspect:ExactRatio?=nil
    public var fit:Fit = .fit
    public var focalX=0.5,focalY=0.5
    public var radius=28.0,smoothing=0.6,borderWidth=0.0,borderOpacity=0.0
    public var borderColor="#f4ead8"
    public var shadowOpacity=0.22,shadowSoftness=36.0,shadowOffsetX=0.0,shadowOffsetY=12.0
    public var matteColor="#000000",matteOpacity=0.0,opacity=1.0
    public var protected=true,aboveSlides=true,keepDuringClosing=false
    public var safeInset=0.04
    public var startBaseMilliseconds:Int64=0,endBaseMilliseconds:Int64?=nil
    public init(slideID: String) {self.slideID=slideID}
    public func validate() throws {
        try require(identity(slideID),"Pin references an invalid slide.")
        for v in [x,y,focalX,focalY,smoothing,borderOpacity,shadowOpacity,matteOpacity,opacity] {try number(v,0...1,"Pin placement or treatment")}
        try number(width,0.05...1,"Pin size");try number(safeInset,0...0.4,"Pin safe inset")
        try number(radius,0...500,"Pin corners");try number(borderWidth,0...64,"Pin border");try number(shadowSoftness,0...500,"Pin shadow")
        try number(shadowOffsetX,-500...500,"Pin shadow X");try number(shadowOffsetY,-500...500,"Pin shadow Y")
        try require(startBaseMilliseconds>=0 && (endBaseMilliseconds==nil || endBaseMilliseconds!>startBaseMilliseconds),"Pin end must follow its start.")
        try require(framePolicy != .ratio || aspect != nil,"Custom Pin framing needs a ratio.")
        try RGBA.validateHex(borderColor);try RGBA.validateHex(matteColor)
    }
}
public enum CueTarget:String,Codable,Sendable {case movingVisit,pin}
public struct Spotlight: Codable, Equatable, Sendable, Identifiable {
    public var id:String,slideID:String
    public var target:CueTarget = .movingVisit
    public var baseAnchorFrame:Int64?=nil
    public var holdMilliseconds:Int64=3000,transitionMilliseconds:Int64=450
    public var size=0.85
    public init(slideID:String,id:String=UUID().uuidString){self.slideID=slideID;self.id=id}
    public func validate() throws {
        _=try CueTiming(id:id,slideID:slideID,baseFrame:baseAnchorFrame ?? 0,holdMilliseconds:holdMilliseconds,transitionMilliseconds:transitionMilliseconds)
        try number(size,0.25...0.95,"Spotlight size")
    }
}
public struct Closing: Codable, Equatable, Sendable {
    public var slideID:String
    public var holdMilliseconds:Int64=3000,transitionMilliseconds:Int64=450
    public var size=0.85
    public init(slideID:String){self.slideID=slideID}
    public func validate()throws{_=try CueTiming(id:"closing",slideID:slideID,baseFrame:0,holdMilliseconds:holdMilliseconds,transitionMilliseconds:transitionMilliseconds);try number(size,0.25...0.95,"Closing size")}
}
public struct LayerTiming: Codable, Equatable, Sendable {
    public var lead=0.0,span=1.0
    public init(){}
    public init(lead:Double,span:Double){self.lead=lead;self.span=span}
}
public struct Transition: Codable, Equatable, Sendable {
    public var enabled=false
    public var milliseconds:Int64=450
    public var treatment="lift",curve="ease-out"
    public var background=LayerTiming(),slides=LayerTiming()
    public var stagger=0.0,reverse=false
    public init(){}
    public func validate()throws{
        try require((0...60_000).contains(milliseconds),"Invalid transition duration.")
        try require(["lift","projector","contact-cut","fade"].contains(treatment) && ["linear","ease-out","ease-in-out"].contains(curve),"Unsupported transition.")
        for timing in [background,slides] {try number(timing.lead,0...1,"Transition lead");try number(timing.span,0.001...1,"Transition span");try require(timing.lead+timing.span<=1.000001,"Transition layer extends outside its interval.")}
        try number(stagger,0...0.95,"Slide stagger")
    }
}
public struct TempoPoint: Codable, Equatable, Sendable {public var time:Double,speed:Double;public init(_ time:Double,_ speed:Double){self.time=time;self.speed=speed}}
public struct PassGroup: Codable, Equatable, Sendable, Identifiable {
    public var id:String,label:String,passes:Int,relativeSecondsPerPass:Double
    public init(id:String=UUID().uuidString,label:String="Read",passes:Int=1,relativeSecondsPerPass:Double=1){self.id=id;self.label=label;self.passes=passes;self.relativeSecondsPerPass=relativeSecondsPerPass}
}
public enum PlayMode:String,Codable,Sendable {case once,repeatCount,loop}
public enum RepeatScope:String,Codable,Sendable {case body,fullScene}
public enum MovementGrammar:String,Codable,Sendable {case continuousGlide,readableHolds,handcrafted}
public struct Direction: Codable, Equatable, Sendable {
    public var mode:PlayMode = .once
    public var repeats=1
    public var repeatScope:RepeatScope = .body
    public var groups=[PassGroup(id:"read",label:"Read",passes:1,relativeSecondsPerPass:1)]
    public var sequenceRepeats=1
    public var contentPaced=true
    public var secondsPerSlide=0.9
    public var bodyMilliseconds:Int64=10_000
    public var entry=Transition(),exit=Transition()
    public var tempo=[TempoPoint(0,1),TempoPoint(1,1)]
    public var grammar:MovementGrammar = .continuousGlide
    public var reduceAuthoredMotion=false
    public init(){}
    public func validate()throws{
        try require((1...1000).contains(repeats) && (1...1000).contains(sequenceRepeats) && (1...32).contains(groups.count),"Invalid pass count.")
        try require(Set(groups.map(\.id)).count==groups.count,"Duplicate pass-group identities.")
        for g in groups{try require(identity(g.id) && (1...1000).contains(g.passes) && g.label.utf8.count<=100,"Invalid pass group.");try number(g.relativeSecondsPerPass,0.01...100,"Relative pass duration")}
        try require((250...3_600_000).contains(bodyMilliseconds),"Body duration must be 0.25–3600 seconds.");try number(secondsPerSlide,0.05...60,"Read time")
        try entry.validate();try exit.validate()
        try require((2...32).contains(tempo.count) && tempo.first?.time==0 && tempo.last?.time==1,"A tempo curve needs start and end points.")
        var previous = -1.0
        for p in tempo{try number(p.time,0...1,"Tempo position");try number(p.speed,0...10,"Tempo speed");try require(p.time>previous,"Tempo positions must increase.");previous=p.time}
        try require(tempo.contains{$0.speed>0},"Tempo cannot be zero everywhere.")
    }
}
public enum OutputFormat:String,Codable,Sendable {case mp4,png,pngSequence}
public struct Output:Codable,Equatable,Sendable {
    public var rate=try! OutputRate()
    public var format:OutputFormat = .mp4
    public var bitrate=16_000_000
    public init(){}
}
public struct DriftProject:Codable,Equatable,Sendable {
    public static let formatIdentifier="dog.pitch.drift.native"
    public var format=Self.formatIdentifier
    public var schemaVersion=1,renderVersion=1
    public var id:String,name:String
    public var createdAt:String,modifiedAt:String
    public var seed:Int64=17
    public var canvas=CanvasSize.wideDeck
    public var transparent=false
    public var assets:[String:Original]=[:]
    public var slides:[Slide]=[]
    public var pin:Pin?=nil
    public var spotlights:[Spotlight]=[]
    public var closing:Closing?=nil
    public var creative:CreativeValues
    public var direction=Direction()
    public var output=Output()
    public var worldID="editorial-drift",worldPressure="restrained",worldScene = -1,worldRecut=0
    public var lockedDomains:[String]=[]
    public init(name:String="Untitled",creative:CreativeValues) throws {
        id=UUID().uuidString;self.name=name;createdAt=ISO8601DateFormatter().string(from:Date());modifiedAt=createdAt;self.creative=creative;try validate()
    }
    public var movingSlides:[Slide]{slides.filter{$0.included && $0.inSequence && !(pin?.pinOnly==true && pin?.slideID==$0.id)}}
    public var includedSlides:[Slide]{slides.filter(\.included)}
    public func original(for slide:Slide)throws->Original{guard let v=assets[slide.assetID] else{throw DriftCoreError.invalid("The original for this slide is missing.")};return v}
    public func validate() throws {
        try require(format==Self.formatIdentifier && schemaVersion==1 && renderVersion==1,"This project format is not supported. The file was not changed.")
        try require(identity(id) && !name.isEmpty && name.utf8.count<=512,"Invalid document identity.")
        try require(seed>=0 && seed<=4_294_967_295 && worldRecut>=0 && worldRecut<=1_000_000,"Invalid deterministic seed.")
        try require(slides.count<=MediaLimits.maximumSlides && assets.count<=MediaLimits.maximumSlides,"Too many media items.")
        try require(Set(slides.map(\.id)).count==slides.count,"Duplicate slide identities.")
        var bytes:Int64=0
        for (key,a) in assets{try a.validate();try require(key==a.id,"Original key and identity disagree.");bytes=try checkedAdd(bytes,a.byteLength)}
        try require(bytes<=MediaLimits.maximumProjectBytes,"The project exceeds the unique original-media budget.")
        for s in slides{try s.validate(original:original(for:s))}
        let ids=Set(slides.map(\.id))
        if let pin{try pin.validate();try require(ids.contains(pin.slideID),"The Pin slide is missing.")}
        try require(spotlights.count<=MediaLimits.maximumSlides && Set(spotlights.map(\.id)).count==spotlights.count,"Duplicate or excessive Spotlight cues.")
        for cue in spotlights{try cue.validate();try require(ids.contains(cue.slideID),"A Spotlight slide is missing.");try require(cue.target != .pin || pin?.slideID==cue.slideID,"The Spotlight's pinned instance is missing.")}
        if let closing{try closing.validate();try require(ids.contains(closing.slideID),"The closing slide is missing.")}
        try require(Set(lockedDomains).isSubset(of:["motion","card","material","lighting","atmosphere","lens"]),"Unknown locked creative domain.")
        try creative.validate();try direction.validate()
        try require((1_000_000...100_000_000).contains(output.bitrate),"The output bitrate is unsupported.")
    }
    public func encoded()throws->Data{try validate();let e=JSONEncoder();e.outputFormatting=[.sortedKeys,.withoutEscapingSlashes];return try e.encode(self)}
    public static func decode(_ data:Data)throws->Self{
        try require(data.count<=MediaLimits.maximumManifestBytes,"The project manifest is too large.")
        guard let fields=try JSONSerialization.jsonObject(with:data) as? [String:Any] else {throw DriftCoreError.invalid("A project manifest must be an object.")}
        let allowed:Set<String>=["format","schemaVersion","renderVersion","id","name","createdAt","modifiedAt","seed","canvas","transparent","assets","slides","pin","spotlights","closing","creative","direction","output","worldID","worldPressure","worldScene","worldRecut","lockedDomains"]
        try require(Set(fields.keys).isSubset(of:allowed),"The project contains unsupported fields.")
        let value=try JSONDecoder().decode(Self.self,from:data);try value.validate();return value
    }
    public func contentIdentity()throws->Data{var copy=self;copy.createdAt="";copy.modifiedAt="";copy.lockedDomains.sort();return try copy.encoded()}
    public mutating func removeSlides(_ ids:Set<String>){
        slides.removeAll{ids.contains($0.id)}
        if let p=pin,ids.contains(p.slideID){pin=nil}
        spotlights.removeAll{ids.contains($0.slideID)}
        if let c=closing,ids.contains(c.slideID){closing=nil}
        let used=Set(slides.map(\.assetID));assets=assets.filter{used.contains($0.key)}
    }
}
public struct WorldTemplate:Codable,Sendable,Identifiable {public var id:String,worldID:String,label:String,pressure:String,scene:Int,values:CreativeValues}
public struct RecipeTemplate:Codable,Sendable,Identifiable {public var id:String,category:String,recipeID:String,label:String,values:CreativeValues}
public struct BackgroundComposition:Decodable,Sendable {public let id:String;public let name:String?}
public struct BackgroundStudy:Decodable,Sendable,Identifiable {
    public let id:String,name:String,family:String,paletteId:String
    public let composition:Int,variation:Double,background:BackgroundParameters
}
public struct BackgroundParameters:Decodable,Sendable {public let style:String,colorA:String,colorB:String,accent:String,intensity:Double,motion:Double,grain:Double,vignette:Double,seed:Double}
public enum FieldOption:Decodable,Sendable {case string(String),number(Double)
    public init(from decoder:any Decoder)throws{let c=try decoder.singleValueContainer();if let s=try? c.decode(String.self){self = .string(s)}else{self = .number(try c.decode(Double.self))}}
    public var text:String{switch self{case .string(let s):return s;case .number(let n):return String(n)}}
}
public struct CreativeField:Decodable,Sendable {public let key:String,type:String,options:[FieldOption]}
public struct CreativeStructure:Decodable,Sendable {public let name:String,fields:[CreativeField]}
public struct CreativeCatalog:Decodable,Sendable {
    public let sourceSeed:Double
    public let fields:[CreativeStructure]
    public let backgrounds:[BackgroundStudy]
    public let backgroundCompositions:[String:[BackgroundComposition]]
    public var defaults:CreativeValues
    public var worlds:[WorldTemplate]
    public var recipes:[RecipeTemplate]
    public static func load() throws -> Self {
        guard let url=Bundle.main.url(forResource:"CreativeCatalog",withExtension:"json") ?? Bundle.module.url(forResource:"CreativeCatalog",withExtension:"json") else {throw DriftCoreError.invalid("The native creative catalog is missing.")}
        let catalog=try JSONDecoder().decode(Self.self,from:Data(contentsOf:url));try catalog.defaults.validate()
        for world in catalog.worlds{try world.values.validate()};for recipe in catalog.recipes{try recipe.values.validate()}
        return catalog
    }
}

public extension DriftProject {
    mutating func applyWorld(_ template:WorldTemplate,catalog:CreativeCatalog,recut:Int?=nil){
        let locks=Set(lockedDomains);var values=template.values
        values.card.aspectWidth=creative.card.aspectWidth;values.card.aspectHeight=creative.card.aspectHeight;values.card.defaultFit=creative.card.defaultFit
        let take=recut ?? worldRecut
        values.motion.performance.take=1+Double((seed+Int64(take)*17)%999)
        values.atmosphere.recut=Double(take)
        values.atmosphere.seedOffset=positiveModulo(values.atmosphere.seedOffset-catalog.sourceSeed+Double(seed)+Double(take)*37,100)
        if !locks.contains("motion"){creative.motion=values.motion}
        if !locks.contains("card"){creative.card=values.card}
        if !locks.contains("material"){creative.material=values.material}
        if !locks.contains("lighting"){creative.lighting=values.lighting}
        if !locks.contains("atmosphere"){creative.atmosphere=values.atmosphere}
        if !locks.contains("lens"){creative.lens=values.lens}
        worldID=template.worldID;worldPressure=template.pressure;worldScene=template.scene;worldRecut=take
    }
    mutating func applyRecipe(_ recipe:RecipeTemplate){
        let v=recipe.values
        switch recipe.category{
        case "path":creative.motion.path=v.motion.path
        case "cadence":creative.motion.cadence=v.motion.cadence
        case "performance":creative.motion.performance=v.motion.performance
        case "character":creative.motion.character=v.motion.character
        case "material":creative.material=v.material
        case "finish":creative.material.finish=v.material.finish
        case "lighting":creative.lighting=v.lighting
        case "lens":creative.lens=v.lens
        default:break
        }
    }
    mutating func applyBackground(_ study:BackgroundStudy,catalog:CreativeCatalog){
        let b=study.background;creative.atmosphere.enabled=true;creative.atmosphere.family=study.family
        creative.atmosphere.composition=catalog.backgroundCompositions[study.family]?[study.composition].id ?? "pure-field"
        creative.atmosphere.paletteId=study.paletteId;creative.atmosphere.seedOffset=study.variation
        creative.atmosphere.colourA=b.colorA;creative.atmosphere.colourB=b.colorB;creative.atmosphere.accent=b.accent
        creative.atmosphere.intensity=b.intensity;creative.atmosphere.motion=b.motion;creative.atmosphere.grain=b.grain;creative.atmosphere.vignette=b.vignette
    }
}
