import Foundation

public func positiveModulo(_ x:Double,_ m:Double)->Double { m > 0 ? (x.truncatingRemainder(dividingBy:m)+m).truncatingRemainder(dividingBy:m):0 }
public func smooth5(_ x:Double)->Double { let t=bounded(x,0,1);return t*t*t*(t*(t*6-15)+10) }
private func smooth3(_ x:Double)->Double { let t=bounded(x,0,1);return t*t*(3-2*t) }
private let tau=Double.pi*2
private let degree=Double.pi/180

public struct Travel:Sendable,Equatable { public var distance:Double,velocity:Double,acceleration:Double }
public struct PassKnot:Sendable {
    public let index:Int,start:Double,end:Double,startVelocity:Double,endVelocity:Double
    public var duration:Double {end-start}
    public func sample(_ time:Double)->Travel {
        if time<=start{return Travel(distance:Double(index),velocity:startVelocity,acceleration:0)}
        if time>=end{return Travel(distance:Double(index+1),velocity:endVelocity,acceleration:0)}
        let u=(time-start)/duration,u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u
        let a=startVelocity*duration,b=endVelocity*duration,y0=Double(index),y1=y0+1
        let p=(1-10*u3+15*u4-6*u5)*y0+(u-6*u3+8*u4-3*u5)*a+(10*u3-15*u4+6*u5)*y1+(-4*u3+7*u4-3*u5)*b
        let v=(-30*u2+60*u3-30*u4)*y0+(1-18*u2+32*u3-15*u4)*a+(30*u2-60*u3+30*u4)*y1+(-12*u2+28*u3-15*u4)*b
        let acc=(-60*u+180*u2-120*u3)*y0+(-36*u+96*u2-60*u3)*a+(60*u-180*u2+120*u3)*y1+(-24*u+84*u2-60*u3)*b
        return Travel(distance:bounded(p,y0,y1),velocity:max(0,v/duration),acceleration:acc/(duration*duration))
    }
}
public struct BaseSegment:Sendable {
    public enum Phase:Sendable {case entry,body,exit}
    public let phase:Phase,start:Double,end:Double,bodyIndex:Int
}
public struct BaseSample:Sendable {
    public let time:Double,travel:Travel,segment:BaseSegment,progress:Double
}
/// The existing quintic pass interpolation, layer lifecycle, cadence and spatial
/// equations are kept analytical. A displayed frame never integrates timer ticks.
public struct BaseTimeline:Sendable {
    public let project:DriftProject
    public let passes:[PassKnot]
    public let segments:[BaseSegment]
    public let bodySeconds:Double,duration:Double
    public let baseFrames:Int64,bodyCount:Int,sourceCount:Int
    public init(project:DriftProject) throws {
        try project.validate();self.project=project
        sourceCount=project.movingSlides.count
        let d=project.direction
        let visiblePin=project.pin.map{pin in project.slides.contains{$0.id==pin.slideID && $0.included}} ?? false
        let visibleClosing=project.closing.map{cue in project.slides.contains{$0.id==cue.slideID && $0.included}} ?? false
        if sourceCount==0 && !visiblePin && visibleClosing && d.mode != .loop {
            let one=project.output.rate.seconds(frame:1)
            bodySeconds=one;duration=one;baseFrames=1;bodyCount=1
            passes=[PassKnot(index:0,start:0,end:one,startVelocity:0,endVelocity:0)]
            segments=[BaseSegment(phase:.body,start:0,end:one,bodyIndex:0)]
            return
        }
        let passCount=d.groups.reduce(0){$0+$1.passes}*d.sequenceRepeats
        try require(passCount<=10000,"Reduce pass groups: a sequence supports at most 10,000 passes.")
        var weights:[Double]=[]
        for _ in 0..<d.sequenceRepeats {for group in d.groups {weights += Array(repeating:group.relativeSecondsPerPass,count:group.passes)}}
        let weight=weights.reduce(0,+)
        let seconds=d.contentPaced && sourceCount>0 ? Double(sourceCount)*d.secondsPerSlide*weight:Double(d.bodyMilliseconds)/1000
        bodySeconds=max(0.25,seconds)
        var bounds:[Double]=[0],total=0.0
        for w in weights {total += w;bounds.append(bodySeconds*total/weight)}
        let velocities=weights.indices.map{1/(bounds[$0+1]-bounds[$0])}
        passes=weights.indices.map { i in
            let previous=i==0 ? velocities.last!:velocities[i-1],next=i==weights.count-1 ? velocities[0]:velocities[i+1]
            return PassKnot(index:i,start:bounds[i],end:bounds[i+1],startVelocity:min(previous,velocities[i]),endVelocity:min(next,velocities[i]))
        }
        bodyCount=d.mode == .repeatCount ? d.repeats:1
        let hasClosing=project.closing.map{c in project.slides.contains{$0.id==c.slideID && $0.included}} ?? false
        let entry=d.entry.enabled ? Double(d.entry.milliseconds)/1000:0
        let exit=d.exit.enabled ? Double(d.exit.milliseconds)/1000:0
        var result:[BaseSegment]=[],cursor=0.0
        for body in 0..<bodyCount {
            if entry>0 && (body==0 || d.repeatScope == .fullScene) {
                result.append(BaseSegment(phase:.entry,start:cursor,end:cursor+entry,bodyIndex:body));cursor += entry
            }
            result.append(BaseSegment(phase:.body,start:cursor,end:cursor+bodySeconds,bodyIndex:body));cursor += bodySeconds
            let final=body==bodyCount-1
            if exit>0 && (final || d.repeatScope == .fullScene) && !(final && hasClosing && d.mode != .loop) {
                result.append(BaseSegment(phase:.exit,start:cursor,end:cursor+exit,bodyIndex:body));cursor += exit
            }
        }
        segments=result;duration=cursor
        let frames=ceil(cursor*Double(project.output.rate.numerator)/Double(project.output.rate.denominator)-1e-9)
        try require(frames.isFinite && frames>=1 && frames<=10_000_000,"The directed sequence exceeds the supported frame budget.")
        baseFrames=Int64(frames)
    }
    private func segment(at time:Double)->BaseSegment {
        var lo=0,hi=segments.count-1
        while lo<hi {let m=(lo+hi)/2;if time<segments[m].end{hi=m}else{lo=m+1}}
        return segments[lo]
    }
    /// Smooth-speed envelope integrated analytically across any authored handles.
    private func tempo(_ phase:Double)->Travel {
        let points=project.direction.tempo,t=bounded(phase,0,1)
        var area=0.0,prefix=0.0,answer:Travel?
        for i in 0..<(points.count-1) {
            let a=points[i],b=points[i+1],span=b.time-a.time
            area += span*(a.speed+b.speed)/2
            if answer==nil && t<=b.time {
                let u=bounded((t-a.time)/span,0,1),diff=b.speed-a.speed
                let integral=u*u*u-0.5*u*u*u*u
                answer=Travel(distance:prefix+span*(a.speed*u+diff*integral),velocity:a.speed+diff*smooth3(u),acceleration:diff*6*u*(1-u)/span)
            }
            prefix += span*(a.speed+b.speed)/2
        }
        let a=answer ?? Travel(distance:area,velocity:points.last!.speed,acceleration:0)
        return Travel(distance:bounded(a.distance/area,0,1),velocity:a.velocity/area,acceleration:a.acceleration/area)
    }
    public func sample(seconds:Double)->BaseSample {
        var t=bounded(seconds,0,duration)
        if project.direction.grammar == .handcrafted {
            let fps=Double(project.creative.motion.cadence.poseCadence.replacingOccurrences(of:"fps",with:""))
            if let fps,t<duration-1e-9 {t=floor(t*fps+1e-9)/fps}
        }
        let s=segment(at:t),p=bounded((t-s.start)/(s.end-s.start),0,1)
        let clock=s.phase == .entry ? 0:s.phase == .exit ? 1:p
        let authored=AuthoredMotion.profile(clock,performance:project.creative.motion.performance,character:project.creative.motion.character,
            seamless:project.direction.mode == .loop || project.creative.motion.seamless.enabled)
        let timed=tempo(authored.distance)
        let envelope=Travel(distance:timed.distance,velocity:timed.velocity*authored.velocity,
            acceleration:timed.acceleration*authored.velocity*authored.velocity+timed.velocity*authored.acceleration)
        let bodyTime=envelope.distance*bodySeconds
        var lo=0,hi=passes.count-1
        while lo<hi {let m=(lo+hi)/2;if bodyTime<passes[m].end{hi=m}else{lo=m+1}}
        let pass=passes[lo].sample(bodyTime),sign=project.creative.motion.transport.direction
        let travelling=s.phase == .body && !project.direction.reduceAuthoredMotion
        let factor=Double(sourceCount)*sign
        let travel=Travel(distance:project.direction.reduceAuthoredMotion ? 0:(Double(s.bodyIndex*passes.count)+pass.distance)*factor,
            velocity:travelling ? pass.velocity*envelope.velocity*factor:0,
            acceleration:travelling ? (pass.acceleration*envelope.velocity*envelope.velocity+pass.velocity*envelope.acceleration/bodySeconds)*factor:0)
        return BaseSample(time:t,travel:travel,segment:s,progress:p)
    }
    public func firstAnchor(sourceIndex:Int)->Int64 {
        guard sourceCount>0 else{return 0}
        let target=Double(project.creative.motion.transport.direction>0 ? sourceIndex:(sourceCount-sourceIndex)%sourceCount)
        let first=segments.first{$0.phase == .body}!
        if target==0{return min(baseFrames-1,Int64(ceil(first.start*Double(project.output.rate.numerator)/Double(project.output.rate.denominator))))}
        var lo=first.start,hi=first.end
        for _ in 0..<52 {let mid=(lo+hi)/2;if abs(sample(seconds:mid).travel.distance)<target{lo=mid}else{hi=mid}}
        return min(baseFrames-1,Int64(ceil(hi*Double(project.output.rate.numerator)/Double(project.output.rate.denominator)-1e-9)))
    }
}
public struct LayerSample:Sendable {
    public var opacity=1.0,scale=1.0,translateY=0.0
    public init(){}
}
public struct CardPose:Sendable,Identifiable {
    public var id:String,slideID:String,slot:Int,sourceIndex:Int
    /// Stage-centred coordinates in pixels, Y up; angles in radians.
    public var x:Double,y:Double,z:Double,width:Double,height:Double
    public var rotationX:Double,rotationY:Double,rotationZ:Double
    public var opacity:Double,pathBend:Double,focus:Double
    public var projectionMix=0.0,pinned=false,presentationPriority=false
    public var protected=false
    public var fit:Fit = .fit,focalX=0.5,focalY=0.5
    public var radius=0.0,smoothing=0.0,borderWidth=0.0,borderOpacity=0.0
    public var borderColor="#ffffff",matteColor="#000000",matteOpacity=0.0
    public var shadowOpacity=0.0,shadowSoftness=0.0,shadowX=0.0,shadowY=0.0
    public var crop=Crop()
}
public struct DirectedFrame:Sendable {
    public let index:Int64,baseFrame:Int64
    public let outputSeconds:Double,baseSeconds:Double,velocity:Double,acceleration:Double,travelPhase:Double
    public let backgroundOpacity:Double
    public let cards:[CardPose]
    public let cue:ScheduledCue?
}
public struct FramePlan:Sendable {
    public let project:DriftProject,base:BaseTimeline,schedule:PresentationSchedule
    public let moving:[Slide]
    private let byID:[String:Slide]
    public init(project:DriftProject)throws {
        self.project=project;try project.validate();base=try BaseTimeline(project:project);moving=project.movingSlides
        byID=Dictionary(uniqueKeysWithValues:project.slides.map{($0.id,$0)})
        var cues:[CueTiming]=[]
        for c in project.spotlights {
            guard let slide=byID[c.slideID],slide.included else{continue}
            let anchor:Int64
            if let explicit=c.baseAnchorFrame {anchor=explicit}
            else if c.target == .pin || (project.pin?.slideID==slide.id && project.pin?.pinOnly==true) {
                guard let pin=project.pin else{continue};anchor=try project.output.rate.frames(milliseconds:pin.startBaseMilliseconds)
            }else if let i=moving.firstIndex(where:{$0.id==slide.id}){anchor=base.firstAnchor(sourceIndex:i)}else{continue}
            try require(anchor<base.baseFrames,"A Spotlight is outside the directed sequence. Move its anchor or extend the sequence.")
            cues.append(try CueTiming(id:c.id,slideID:c.slideID,baseFrame:anchor,holdMilliseconds:c.holdMilliseconds,transitionMilliseconds:c.transitionMilliseconds))
        }
        let closing: CueTiming?
        if let c=project.closing,byID[c.slideID]?.included==true {
            closing=try CueTiming(id:"closing",slideID:c.slideID,baseFrame:base.baseFrames-1,holdMilliseconds:c.holdMilliseconds,transitionMilliseconds:c.transitionMilliseconds)
        }else{closing=nil}
        let visiblePin=project.pin.map{pin in project.slides.contains{$0.id==pin.slideID && $0.included}} ?? false
        schedule=try PresentationSchedule(rate:project.output.rate,baseFrameCount:base.baseFrames,spotlights:cues,closing:closing,loop:project.direction.mode == .loop,
            closingOnly:moving.isEmpty && !visiblePin && closing != nil && project.direction.mode != .loop)
    }
    public var duration:Double{schedule.rate.seconds(frame:schedule.totalFrames)}
    private func cadence(_ raw:Travel)->Travel {
        guard project.direction.grammar != .continuousGlide else{return raw}
        let c=project.creative.motion.cadence,linger=bounded(project.creative.motion.performance.linger,0,1)
        let weights=[max(0,c.read)*(0.72+linger*0.72),max(0,c.anticipation),max(0.001,c.carry),max(0,c.impact),max(0,c.settle),max(0,c.land)*(0.72+linger*0.72)]
        let total=weights.reduce(0,+),start=(weights[0]+weights[1])/total,length=weights[2]/total
        let d=abs(raw.distance),cycle=floor(d),phase=d-cycle,u=bounded((phase-start)/length,0,1)
        let active=phase>start && phase<start+length
        let derivative=active ? 30*u*u*(u-1)*(u-1)/length:0
        let second=active ? 60*u*(2*u*u-3*u+1)/(length*length):0
        let sign=project.creative.motion.transport.direction
        return Travel(distance:sign*(cycle+smooth5(u)),velocity:sign*derivative*abs(raw.velocity),acceleration:sign*(second*raw.velocity*raw.velocity+derivative*sign*raw.acceleration))
    }
    public func travel(seconds:Double)->Travel {cadence(base.sample(seconds:seconds).travel)}
    private func layer(_ sample:BaseSample,index:Int?,travel:Double)->LayerSample {
        let transition:Transition
        let entering:Bool
        switch sample.segment.phase{case .body:return LayerSample();case .entry:transition=project.direction.entry;entering=true;case .exit:transition=project.direction.exit;entering=false}
        let timing=index==nil ? transition.background:transition.slides
        let order=index.map{transition.reverse ? max(0,moving.count-1-$0):$0} ?? 0
        let stagger=index==nil || project.direction.reduceAuthoredMotion ? 0:transition.stagger*(1-bounded(project.creative.motion.performance.overlap,0,1))*Double(order)/Double(max(1,moving.count-1))
        let local=bounded((sample.progress-timing.lead-stagger)/timing.span,0,1)
        let progress:Double
        switch transition.curve{case "ease-out":progress=1-pow(1-local,3);case "ease-in-out":progress=local<0.5 ? 4*local*local*local:1-pow(-2*local+2,3)/2;default:progress=local}
        var result=LayerSample();result.opacity=entering ? progress:1-progress
        let rest=project.direction.reduceAuthoredMotion ? 1:result.opacity
        switch transition.treatment{case "lift":result.translateY=(1-rest)*travel;result.scale=0.985+rest*0.015;case "projector":result.scale=0.965+rest*0.035;case "contact-cut":result.scale=0.992+rest*0.008;default:break}
        return result
    }
    private func point(_ n:Double)->(Double,Double) {
        let p=project.creative.motion.path,c=bounded(p.curvature,0,1),extent=project.creative.motion.transport.axis=="horizontal" ? Double(project.canvas.height):Double(project.canvas.width)
        let d=bounded(p.depth,0,1)*extent,s=extent*c*0.16,a=abs(n)
        switch p.id {
        case "straight":return(0,-d*0.22*n*n)
        case "arc":return(-s*0.56*n*n,-d*0.86*n*n)
        case "ribbon":return(sin(n*Double.pi*0.92)*s*0.74,-d*(0.18*a+0.82*n*n))
        case "cylinder":let angle=n*(0.9+c*1.55);return(sin(angle)*s,-d*(1-cos(angle))*1.12)
        case "tunnel":return(sin(n*Double.pi*1.18)*s*0.32,-d*pow(a,1.35))
        case "helix":let angle=n*Double.pi*(1.25+c*2.4);return(sin(angle)*s*0.88,-d*(0.32*a+0.68*(1-cos(angle))*0.5))
        case "orbit":let angle=n*Double.pi*(0.82+c*0.92);return(sin(angle)*s*1.08,-d*(1-cos(angle))*0.92)
        case "cascade":return((sin(n*Double.pi*1.45)+0.28*sin(n*Double.pi*4.35))*s*0.62,-d*(pow(a,1.16)+0.12*pow(sin(n*Double.pi*1.8),2)))
        case "figure-eight":let angle=n*Double.pi*(0.86+c*0.48);return(sin(angle)/(1+pow(cos(angle),2))*s*1.28,-d*((1-cos(angle*2))*0.42+a*0.2))
        case "switchback":return((sin(n*Double.pi*1.62)+0.27*sin(n*Double.pi*4.86))*s*0.76,-d*(pow(a,1.12)+0.1*(1-cos(n*Double.pi*3.1))))
        default:return(0,0)
        }
    }
    private func hash01(_ value:Int)->Double {
        var n=UInt32(truncatingIfNeeded:value);n=(n^(n>>16)) &* 0x45d9f3b;n=(n^(n>>16)) &* 0x45d9f3b;n ^= n>>16;return Double(n)/4_294_967_295
    }
    private func styled(_ slide:Slide,slot:Int,index:Int,width:Double,height:Double)->CardPose {
        let c=project.creative.card,l=project.creative.lighting
        var pose=CardPose(id:"\(slide.id)/\(slot)",slideID:slide.id,slot:slot,sourceIndex:index,x:0,y:0,z:0,width:width,height:height,rotationX:0,rotationY:0,rotationZ:0,opacity:1,pathBend:0,focus:1)
        pose.fit=slide.fit;pose.focalX=slide.focalX;pose.focalY=slide.focalY;pose.crop=slide.crop
        pose.radius=c.radius;pose.smoothing=c.smoothing;pose.borderWidth=c.borderWidth;pose.borderOpacity=c.borderOpacity;pose.borderColor=c.borderColor
        pose.shadowOpacity=l.enabled ? l.shadowOpacity*l.contactStrength:0;pose.shadowSoftness=l.shadowSoftness
        pose.shadowX = -cos(l.azimuth*degree)*l.shadowDistance*0.16;pose.shadowY=sin(l.azimuth*degree)*l.shadowDistance*0.16
        return pose
    }
    public func movingPoses(baseSeconds:Double,interaction:Double=0)->[CardPose] {
        guard !moving.isEmpty else{return []}
        let sample=base.sample(seconds:baseSeconds),track=cadence(sample.travel),distance=track.distance+interaction
        let c=project.creative,w=Double(project.canvas.width),h=Double(project.canvas.height),vertical=c.motion.transport.axis=="vertical"
        let width=w*bounded(c.card.scale,0.1,1.6),height=width/(c.card.aspectWidth/max(0.01,c.card.aspectHeight))
        let stride=(vertical ? height:width)*(1+bounded(c.motion.path.gap,0,2.5)),axis=vertical ? h:w,cross=vertical ? w:h,radius=axis/2+stride
        let minimum=Int(ceil(axis/max(1,stride)))+5,count=max(moving.count,Int(ceil(Double(minimum)/Double(moving.count)))*moving.count),length=Double(count)*stride
        var cards:[CardPose]=[]
        for slot in 0..<count {
            let primary=positiveModulo(Double(slot)*stride-distance*stride+length/2,length)-length/2
            if abs(primary)>radius+stride*1.25{continue}
            let i=slot%moving.count,slide=moving[i],n=bounded(primary/max(1,radius),-1.4,1.4),a=abs(n),pt=point(n),step=0.0015
            let before=point(n-step),after=point(n+step),prior=point(n-step*2),next=point(n+step*2)
            let dc=(after.0-before.0)/(step*2),dz=(after.1-before.1)/(step*2),len=sqrt(radius*radius+dc*dc+dz*dz)
            let tangent=(radius/len,dc/len,dz/len)
            let bend=bounded(hypot((next.0-2*pt.0+prior.0)/pow(step*2,2),(next.1-2*pt.1+prior.1)/pow(step*2,2))/max(1,radius*8),0,1)
            let amount=bounded(c.motion.performance.imperfection,0,1),take=max(1,Int(c.motion.performance.take.rounded()))
            let phase=positiveModulo(abs(distance)/Double(moving.count),1)*tau,offset=hash01(i*17+take*101)*tau,harmonic=Double(2+take%3)
            let organicCross=sin(phase*harmonic+offset)*cross*amount*0.012,organicZ=cos(phase*2+offset*1.31)*cross*amount*0.009
            let organicRoll=sin(phase*(harmonic+1)-offset*0.73)*amount*1.4*degree
            let banking=bounded(c.motion.path.banking,-45,45),sign=banking<0 ? -1.0:1.0,authority=bounded(abs(banking)/12,0,1)
            let limit=(4+abs(banking)*1.5)*degree,combined=abs(banking)*degree+limit*authority
            let roll=bounded(atan2(tangent.1,max(0.001,tangent.0)),-limit,limit)*authority*sign
            let pitch=bounded(atan2(-tangent.2,max(0.001,tangent.0)),-limit,limit)*authority
            var rz=roll+sin(n*Double.pi)*abs(banking)*degree*0.18*sign+organicRoll
            if ["helix","orbit"].contains(c.motion.path.id){rz += sin(n*Double.pi*1.15)*limit*0.34*authority}
            let focus=1-bounded(a,0,1),depthScale=bounded(1+(pt.1+organicZ)/max(1,radius)*0.34,0.62,1.08)
            let scale=bounded(depthScale*(1+c.motion.path.focusScale*focus)*(1+slide.scaleOffset),0.24,1.6)
            let t=layer(sample,index:i,travel:height*0.055)
            let ratio=slide.aspectRatio(canvas:project.canvas,original:project.assets[slide.assetID]!)
            var pose=styled(slide,slot:slot,index:i,width:width*scale*t.scale,height:width/ratio*scale*t.scale)
            pose.x=vertical ? pt.0+organicCross:primary;pose.y=(vertical ? -primary:pt.0+organicCross)-t.translateY;pose.z=pt.1+organicZ
            pose.rotationX=vertical ? bounded(pitch,-combined,combined):0;pose.rotationY=vertical ? 0:bounded(-pitch,-combined,combined);pose.rotationZ=bounded(rz,-combined,combined)
            let extent=(vertical ? height:width)*scale,intersection=max(0,min(axis/2,primary+extent/2)-max(-axis/2,primary-extent/2))
            let reveal=smooth3((bounded(intersection/max(1e-9,extent),0,1)-0.1)/(0.325-0.1))
            pose.opacity=bounded(1-c.motion.path.edgeFade*pow(a,1.6),0.08,1)*reveal*t.opacity
            pose.pathBend=bounded(bend+abs(tangent.2)*0.46+abs(tangent.1)*0.22,0,1);pose.focus=focus
            cards.append(pose)
        }
        // Match the current authored draw plan's finite nearest-card selection.
        if cards.count>24 {cards=Array(cards.sorted{hypot($0.x,$0.y)<hypot($1.x,$1.y)}.prefix(24))}
        return cards.sorted{$0.z==$1.z ? $0.slot<$1.slot:$0.z<$1.z}
    }
    public func pinPose(baseSeconds:Double)->CardPose? {
        guard let p=project.pin,let slide=byID[p.slideID],slide.included,let original=project.assets[slide.assetID],
              baseSeconds*1000>=Double(p.startBaseMilliseconds),p.endBaseMilliseconds==nil || baseSeconds*1000<Double(p.endBaseMilliseconds!) else{return nil}
        let w=Double(project.canvas.width),h=Double(project.canvas.height),inset=min(w,h)*p.safeInset
        let aspect=p.framePolicy == .matchCanvas ? w/h:p.framePolicy == .ratio ? p.aspect!.value:Double(original.width)/Double(original.height)
        var width=w*p.width,height=width/aspect
        let fit=min(1,(w-inset*2)/width,(h-inset*2)/height);width *= fit;height *= fit
        var pose=styled(slide,slot:-1,index:project.slides.firstIndex{$0.id==slide.id} ?? 0,width:width,height:height)
        pose.id="pin/\(slide.id)";pose.pinned=true;pose.protected=p.protected;pose.projectionMix=p.protected ? 1:0
        pose.x=bounded(p.x*w-w/2,-w/2+inset+width/2,w/2-inset-width/2)
        pose.y=bounded(h/2-p.y*h,-h/2+inset+height/2,h/2-inset-height/2)
        pose.fit=p.fit;pose.focalX=p.focalX;pose.focalY=p.focalY;pose.radius=p.radius;pose.smoothing=p.smoothing
        pose.borderWidth=p.borderWidth;pose.borderColor=p.borderColor;pose.borderOpacity=p.borderOpacity
        pose.shadowOpacity=p.shadowOpacity;pose.shadowSoftness=p.shadowSoftness;pose.shadowX=p.shadowOffsetX;pose.shadowY = -p.shadowOffsetY
        pose.matteColor=p.matteColor;pose.matteOpacity=p.matteOpacity;pose.opacity=p.opacity
        return pose
    }
    public func evaluate(frame:Int64,interaction:Double=0)throws->DirectedFrame {
        let sample=try schedule.sample(frame:frame),seconds=schedule.rate.seconds(frame:frame),baseSeconds=schedule.rate.seconds(frame:sample.baseFrame)
        let b=base.sample(seconds:baseSeconds),t=travel(seconds:baseSeconds)
        var cards=movingPoses(baseSeconds:baseSeconds,interaction:interaction)
        if let pin=pinPose(baseSeconds:baseSeconds){if project.pin!.aboveSlides{cards.append(pin)}else{cards.insert(pin,at:0)}}
        if let cue=sample.cue,let slide=byID[cue.slideID],let original=project.assets[slide.assetID] {
            let setting=project.spotlights.first{$0.id==cue.id}
            let wantPin = !cue.closing && (setting?.target == .pin || project.pin?.pinOnly==true && project.pin?.slideID==slide.id)
            let candidates=cards.indices.filter{cards[$0].slideID==slide.id && (cue.closing || cards[$0].pinned==wantPin)}
            let target=candidates.min{hypot(cards[$0].x,cards[$0].y)<hypot(cards[$1].x,cards[$1].y)}
            var pose:CardPose
            if let target {pose=cards.remove(at:target)}else{
                let aspect=slide.aspectRatio(canvas:project.canvas,original:original),width=Double(project.canvas.width)*project.creative.card.scale
                pose=styled(slide,slot:-2,index:0,width:width,height:width/aspect);pose.opacity=0
            }
            if cue.closing {
                let keep=project.pin?.keepDuringClosing==true
                cards=cards.filter{!($0.pinned && $0.slideID==slide.id)}.map { p in
                    var p=p;if !p.pinned || !keep {p.opacity *= 1-sample.cueWeight};return p
                }
            }
            let size=cue.closing ? project.closing!.size:(setting?.size ?? 0.85)
            let ratio=pose.width/pose.height,w=Double(project.canvas.width),h=Double(project.canvas.height),height=min(h*size,w*size/ratio),width=height*ratio,q=sample.cueWeight
            pose.x *= 1-q;pose.y *= 1-q;pose.z *= 1-q;pose.rotationX *= 1-q;pose.rotationY *= 1-q;pose.rotationZ *= 1-q
            pose.width += (width-pose.width)*q;pose.height += (height-pose.height)*q;pose.opacity += (1-pose.opacity)*q
            pose.projectionMix += (1-pose.projectionMix)*q;pose.pathBend *= 1-q;pose.focus += (1-pose.focus)*q;pose.presentationPriority=true
            cards.append(pose)
        }
        let previous=frame>0 ? try schedule.sample(frame:frame-1):nil
        let stationary=sample.cue != nil || previous?.baseFrame==sample.baseFrame
        return DirectedFrame(index:frame,baseFrame:sample.baseFrame,outputSeconds:seconds,baseSeconds:baseSeconds,
            velocity:stationary ? 0:bounded(t.velocity,-1,1),acceleration:stationary ? 0:bounded(t.acceleration,-1,1),
            travelPhase:moving.isEmpty ? 0:positiveModulo(abs(t.distance)/Double(moving.count),1)*tau*2,
            backgroundOpacity:layer(b,index:nil,travel:0).opacity,cards:cards,cue:sample.cue)
    }
}
