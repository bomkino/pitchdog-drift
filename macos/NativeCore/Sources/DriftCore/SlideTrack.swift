import Foundation

/// Immutable, per-slide layout. The output canvas never substitutes for a
/// slide's source/custom frame. Distances remain in slide visits for cue timing.
struct SlideTrack:Sendable {
    struct Footprint:Sendable { let width:Double,height:Double,extent:Double }
    let footprints:[Footprint]
    let centers:[Double]
    let steps:[Double]
    let length:Double
    let maximumExtent:Double

    init(project:DriftProject,slides:[Slide]) {
        let width=Double(project.canvas.width)*bounded(project.creative.card.scale,0.1,1.6)
        let vertical=project.creative.motion.transport.axis=="vertical"
        footprints=slides.map { slide in
            let ratio=slide.aspectRatio(canvas:project.canvas,original:project.assets[slide.assetID]!)
            let scale=bounded(1+slide.scaleOffset,0.24,1.6)
            let w=width*scale,h=width/ratio*scale
            return Footprint(width:w,height:h,extent:vertical ? h:w)
        }
        maximumExtent=footprints.map(\.extent).max() ?? 0
        let gap=bounded(project.creative.motion.path.gap,0,2.5)
        var positions:[Double]=[],pitches:[Double]=[],cursor=0.0
        for i in footprints.indices {
            positions.append(cursor)
            let next=(i+1)%footprints.count
            // Gap is relative to the mean of the two adjacent slide extents.
            // A one-pixel pitch floor bounds pathological sub-pixel ratios.
            let pitch=max(1,(footprints[i].extent+footprints[next].extent)*0.5)*(1+gap)
            pitches.append(pitch);cursor += pitch
        }
        centers=positions;steps=pitches;length=cursor
    }

    func copies(covering axis:Double)->Int {
        guard !footprints.isEmpty,length>0 else{return 0}
        // The renderer admits only 24 nearest cards. Never create millions of
        // virtual copies for an extreme custom ratio just to discard them.
        let limit=max(1,(24+footprints.count-1)/footprints.count)+1
        return max(1,Int(min(Double(limit),ceil((axis+5*maximumExtent)/length))))
    }

    func position(at distance:Double,copies:Int)->Double {
        guard !footprints.isEmpty,copies>0,distance.isFinite else{return 0}
        let phase=positiveModulo(distance,Double(footprints.count*copies))
        let visit=Int(floor(phase)),index=visit%footprints.count
        return Double(visit/footprints.count)*length+centers[index]+(phase-Double(visit))*steps[index]
    }
}
