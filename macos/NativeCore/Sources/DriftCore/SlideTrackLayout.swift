import Foundation

/// One geometry authority for spacing, visits and visibility. Distances remain
/// authored in slide visits; the variable-width track maps them to output pixels.
/// Built once per immutable frame plan, not once per preview/export frame.
struct SlideTrackLayout:Sendable {
    let heights:[Double],extents:[Double],centers:[Double],advances:[Double]
    let cycleLength:Double,maximumExtent:Double
    init(project:DriftProject,slides:[Slide]) {
        let width=Double(project.canvas.width)*bounded(project.creative.card.scale,0.1,1.6)
        let vertical=project.creative.motion.transport.axis=="vertical"
        let heights=slides.map{width/$0.aspectRatio(canvas:project.canvas,original:project.assets[$0.assetID]!)}
        let extents=slides.indices.map{(vertical ? heights[$0]:width)*bounded(1+slides[$0].scaleOffset,0.24,1.6)}
        let gap=1+bounded(project.creative.motion.path.gap,0,2.5)
        let advances=slides.indices.map{(extents[$0]+extents[($0+1)%slides.count])*0.5*gap}
        var positions:[Double]=[],cursor=0.0
        for advance in advances{positions.append(cursor);cursor += advance}
        self.heights=heights;self.extents=extents;self.advances=advances
        centers=positions;cycleLength=cursor;maximumExtent=extents.max() ?? 0
    }
    func position(slot:Int)->Double {
        guard !centers.isEmpty else{return 0}
        return Double(slot/centers.count)*cycleLength+centers[slot%centers.count]
    }
    /// Reduce the phase before converting to Int, including reverse travel and
    /// long-running loops. No allocation grows with output time or tiny ratios.
    func displacement(visits:Double,repetitions:Int)->Double {
        guard !centers.isEmpty,visits.isFinite else{return 0}
        let phase=positiveModulo(visits,Double(centers.count*repetitions))
        let slot=Int(floor(phase))
        return position(slot:slot)+(phase-Double(slot))*advances[slot%centers.count]
    }
}
