#include "DriftCodecs.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>
static void require(bool value,const char *message){if(!value){std::fprintf(stderr,"FAIL: %s\n",message);std::exit(1);}}
int main(int argc,char **argv){
    require(argc==5,"Provide still WebP, animated WebP, VP8 and VP9 fixtures.");
    for(int i=1;i<argc;i++){
        char error[512]{};auto token=drift_cancellation_create();require(token!=nullptr,"Cancellation token");
        auto raw=drift_codec_open_cancellable(argv[i],token,error,sizeof(error));if(!raw){std::fprintf(stderr,"%s: %s\n",argv[i],error);return 1;}
        std::unique_ptr<DriftCodec,decltype(&drift_codec_close)> codec(raw,drift_codec_close);
        DriftCodecInfo info{};require(drift_codec_info(raw,&info),"Metadata");
        require(info.width==160&&info.height==90,"Exact dimensions");require(info.codec==(i<=2?1:i-1),"Detected actual codec");
        std::vector<uint8_t> first,middle;
        for(int step=0;step<3;step++){
            const double time=step==1?.75:.25;DriftCodecFrame frame{};
            require(drift_codec_read(raw,time,0,0,1,&frame,error,sizeof(error)),error);
            const auto bytes=static_cast<size_t>(frame.stride)*frame.height;
            require(frame.rgba&&bytes==160*90*4,"Decoded pixel layout");
            if(i>1)require(frame.timestamp<=time&&frame.timestamp+frame.duration>time,"Covering presentation interval");
            std::vector<uint8_t> pixels(frame.rgba,frame.rgba+bytes);
            if(step==0)first=pixels;else if(step==1)middle=pixels;else require(pixels==first,"Backward seek returns the same actual pixels");
        }
        if(i>1){require(first!=middle,"Moving fixture changes decoded pixels");require(std::abs(info.duration-1)<.001,"Authored one-second duration");}
        else require(info.alpha==1,"Still WebP retains declared alpha");
        if(i==1){bool partial=false;for(size_t n=3;n<first.size();n+=4)partial|=first[n]>0&&first[n]<255;require(partial,"Decoded WebP has real partial alpha");}
        if(i>1){DriftCodecFrame last{};require(drift_codec_read(raw,0,1,.33,.72,&last,error,sizeof(error)),error);require(last.timestamp<.72&&last.timestamp+last.duration>.33,"Last frame intersects trim");}
        drift_cancellation_cancel(token);DriftCodecFrame cancelled{};require(!drift_codec_read(raw,.25,0,0,1,&cancelled,error,sizeof(error)),"Cancellation reaches decoder");
        codec.reset();require(drift_codec_open_cancellable(argv[i],token,error,sizeof(error))==nullptr,"Cancellation reaches open before parsing");drift_cancellation_destroy(token);
        std::printf("PASS %s: codec=%d %dx%d frames=%d alpha=%d\n",argv[i],info.codec,info.width,info.height,info.frame_count,info.alpha);
    }
    std::puts("Native media pixel, timing, alpha, seek and cancellation assertions passed.");
}
