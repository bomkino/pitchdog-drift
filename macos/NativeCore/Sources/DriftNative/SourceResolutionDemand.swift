import Foundation
import DriftCore

/// Coalesce visible occurrences before decoding, using projected artwork pixels
/// and the fraction of original pixels actually consumed by Fit/Fill and crop.
struct SourceResolutionDemand {
    private(set) var dimensions:[String:Int]=[:]
    mutating func include(id:String,width:Double,height:Double,scale:Double){
        let pixels=max(width,height)*scale*1.25
        let demand=pixels.isFinite ? Int(ceil(bounded(pixels,64,8192))):8192
        dimensions[id]=max(dimensions[id] ?? 0,demand)
    }
    mutating func include(pose:CardPose,original:Original,canvas:CanvasSize,scale:Double){
        let camera=Double(canvas.height)/(2*tan(35*Double.pi/360))
        var xs:[Double]=[],ys:[Double]=[]
        for (x,y) in [(-0.5,-0.5),(0.5,-0.5),(0.5,0.5),(-0.5,0.5)]{
            let a=pose.rotationX,b=pose.rotationY,c=pose.rotationZ
            let vx=x*pose.width,vy=y*pose.height*cos(a),vz=y*pose.height*sin(a)
            let xx=vx*cos(b)+vz*sin(b),zz = -vx*sin(b)+vz*cos(b)
            let px=xx*cos(c)-vy*sin(c)+pose.x,py=xx*sin(c)+vy*cos(c)+pose.y
            let q=bounded(pose.projectionMix,0,1),perspective=camera/max(camera/16,camera-(zz+pose.z))
            let zoom=perspective*(1-q)+q
            xs.append(px*zoom);ys.append(py*zoom)
        }
        let projectedWidth=max(1,(xs.max() ?? 0)-(xs.min() ?? 0)),projectedHeight=max(1,(ys.max() ?? 0)-(ys.min() ?? 0))
        let horizontal=projectedWidth/(Double(original.width)*max(0.000001,pose.crop.width))
        let vertical=projectedHeight/(Double(original.height)*max(0.000001,pose.crop.height))
        let density=pose.fit == .fit ? min(horizontal,vertical):max(horizontal,vertical)
        include(id:pose.slideID,width:Double(original.width)*density,height:Double(original.height)*density,scale:scale)
    }
}
