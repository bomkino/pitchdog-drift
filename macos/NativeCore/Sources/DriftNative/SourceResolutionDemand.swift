import Foundation

/// Coalesce all visible occurrences before source decoding; draw order must not
/// choose the quality of a later, larger occurrence of the same artwork.
struct SourceResolutionDemand {
    private(set) var dimensions:[String:Int]=[:]
    mutating func include(id:String,width:Double,height:Double,scale:Double){
        let demand=max(64,Int(ceil(max(width,height)*scale*1.25)))
        dimensions[id]=max(dimensions[id] ?? 0,demand)
    }
}
