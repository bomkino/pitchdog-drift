import Foundation

/// Duration-preserving native counterparts of the authored performance/character
/// profiles in src/core/timeline/{master,performance}. No numerical integration.
public enum AuthoredMotion {
    public static func profile(_ phase:Double,performance:MotionSettingsPerformance,character:MotionSettingsCharacter,seamless:Bool)->Travel{
        let p=bounded(phase,0,1),tau=Double.pi*2,amount=bounded(character.amount,0,1)
        var offset=0.0,first=0.0,second=0.0
        switch character.id{
        case "weighted":offset = -0.18/tau*sin(tau*p);first = -0.18*cos(tau*p);second=0.18*tau*sin(tau*p)
        case "spring":offset=0.24/(2*tau)*(1-cos(2*tau*p));first=0.24*sin(2*tau*p);second=0.48*tau*cos(2*tau*p)
        case "drift":offset=0.28/tau*sin(tau*p);first=0.28*cos(tau*p);second = -0.28*tau*sin(tau*p)
        default:break
        }
        let x=bounded(p+offset*amount,0,1),dx=1+first*amount,ddx=second*amount
        if seamless{return Travel(distance:x,velocity:dx,acceleration:ddx)}
        let runway=bounded(performance.runway,0,1)
        var entry=runway*(0.035+bounded(performance.weight,0,1)*0.18)
        var exit=runway*(0.035+bounded(performance.release,0,1)*0.22)
        if entry+exit>0.82{let factor=0.82/(entry+exit);entry*=factor;exit*=factor}
        let area=1-(entry+exit)*0.5
        let position:Double,velocity:Double,acceleration:Double
        if entry>0 && x<entry{
            let u=x/entry;position=entry*(u*u*u-0.5*pow(u,4))/area
            velocity=u*u*(3-2*u)/area;acceleration=6*u*(1-u)/(entry*area)
        }else if exit>0 && x>1-exit{
            let u=(x-(1-exit))/exit
            position=(area-exit*0.5+exit*(u-u*u*u+0.5*pow(u,4)))/area
            velocity=(1-u*u*(3-2*u))/area;acceleration = -6*u*(1-u)/(exit*area)
        }else{position=(x-entry*0.5)/area;velocity=1/area;acceleration=0}
        return Travel(distance:bounded(position,0,1),velocity:velocity*dx,acceleration:acceleration*dx*dx+velocity*ddx)
    }
}
