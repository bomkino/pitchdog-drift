#include "DriftCodecs.h"
#include <webp/decode.h>
#include <webp/demux.h>
#include <mkvparser/mkvparser.h>
#include <vpx/vpx_decoder.h>
#include <vpx/vp8dx.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <memory>
#include <stdexcept>
#include <string>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

struct DriftCancellation { std::atomic<bool> cancelled{false}; };

namespace {
constexpr int64_t max_file=512LL*1024*1024, max_pixels=33177600;
void fail(const char *text){throw std::runtime_error(text);}
void message(char *out,size_t n,const char *text){if(out&&n){std::snprintf(out,n,"%s",text);}}
struct OwnedFile {
    int fd=-1;int64_t size=0;uint8_t *mapped=nullptr;
    explicit OwnedFile(const char *path){
        fd=::open(path,O_RDONLY|O_CLOEXEC|O_NOFOLLOW);if(fd<0)fail("Cannot open this original file.");
        struct stat s{};
        if(fstat(fd,&s)!=0||!S_ISREG(s.st_mode)||s.st_size<=0||s.st_size>max_file){::close(fd);fd=-1;fail("The source must be a regular file within the 512 MiB limit.");}
        size=s.st_size;
    }
    ~OwnedFile(){if(mapped)munmap(mapped,static_cast<size_t>(size));if(fd>=0)::close(fd);}
    const uint8_t *map(){if(!mapped){void *p=mmap(nullptr,static_cast<size_t>(size),PROT_READ,MAP_PRIVATE,fd,0);if(p==MAP_FAILED)fail("Cannot map the original media.");mapped=static_cast<uint8_t*>(p);}return mapped;}
};
struct Reader:public mkvparser::IMkvReader {
    OwnedFile &file;std::atomic<bool> &cancelled;DriftCancellation *external;uint64_t calls=0;
    explicit Reader(OwnedFile &f,std::atomic<bool> &c,DriftCancellation *e):file(f),cancelled(c),external(e){}
    bool stopped()const{return cancelled.load()||(external&&external->cancelled.load());}
    int Read(long long pos,long length,unsigned char *data)override{
        if(stopped()||pos<0||length<0||length>32*1024*1024||pos>file.size||length>file.size-pos||++calls>5000000)return -1;
        size_t offset=0;while(offset<static_cast<size_t>(length)){
            if(stopped())return -1;
            ssize_t got=pread(file.fd,data+offset,static_cast<size_t>(length)-offset,pos+offset);
            if(got<=0)return -1;offset+=static_cast<size_t>(got);
        }return 0;
    }
    int Length(long long *total,long long *available)override{if(total)*total=file.size;if(available)*available=file.size;return 0;}
};
struct Packet{mkvparser::Block::Frame data;double pts=0,end=0;bool key=false;};
int byte(double x){return std::max(0,std::min(255,static_cast<int>(std::lround(x))));}
void dimensions(int64_t w,int64_t h){if(w<=0||h<=0||w>16384||h>16384||w>max_pixels/h)fail("This decoded source exceeds the 33-megapixel codec working-set limit.");}
// Inspect only actual EBML child elements. Never search arbitrary payload bytes
// for a tag: that could mistake compressed video for unsupported alpha metadata.
bool alpha_video(Reader &reader,long long start,long long end,int depth=0){
    if(depth>3)return false;
    long long pos=start;
    for(int count=0;pos<end&&count<256;count++){
        long long id=0,size=0;long status=mkvparser::ParseElementHeader(&reader,pos,end,id,size);
        if(status!=0||size<0||pos>end||size>end-pos)fail("Malformed WebM track metadata.");
        if(id==0x53c0){return mkvparser::UnserializeUInt(&reader,pos,size)!=0;}
        if((id==0xae||id==0xe0)&&alpha_video(reader,pos,pos+size,depth+1))return true;
        pos+=size;
    }if(pos<end)fail("Too many WebM track metadata elements.");return false;
}
}
struct DriftCodec {
    OwnedFile file;std::atomic<bool> cancelled{false};Reader reader;
    DriftCodecInfo info{};
    WebPDemuxer *demux=nullptr;WebPAnimDecoder *animation=nullptr;
    std::unique_ptr<mkvparser::Segment> segment;
    const mkvparser::VideoTrack *track=nullptr;
    std::vector<Packet> packets;std::vector<uint8_t> encoded,pixels;
    // Positive presentation intervals only; disposal/blending frames with zero
    // duration still decode, but cannot be chosen as a displayed hold frame.
    struct WebPInterval {double start,end;};
    std::vector<WebPInterval> webp_intervals;
    vpx_codec_ctx_t vpx{};bool vpx_live=false;
    size_t next_packet=0;int webp_frame=0;
    double current_start=-1,current_end=-1;
    uint8_t *webp_pixels=nullptr;bool webp_static_owned=false;
    explicit DriftCodec(const char *path,DriftCancellation *token=nullptr):file(path),reader(file,cancelled,token){}
    ~DriftCodec(){if(vpx_live)vpx_codec_destroy(&vpx);if(animation)WebPAnimDecoderDelete(animation);if(demux)WebPDemuxDelete(demux);if(webp_static_owned)WebPFree(webp_pixels);}
    void check(){if(reader.stopped())fail("Media decoding cancelled.");}
    void init_webp(){
        WebPData data{file.map(),static_cast<size_t>(file.size)};demux=WebPDemux(&data);
        if(!demux)fail("Malformed WebP container.");
        info.codec=1;info.width=static_cast<int>(WebPDemuxGetI(demux,WEBP_FF_CANVAS_WIDTH));info.height=static_cast<int>(WebPDemuxGetI(demux,WEBP_FF_CANVAS_HEIGHT));dimensions(info.width,info.height);
        const auto flags=WebPDemuxGetI(demux,WEBP_FF_FORMAT_FLAGS);info.alpha=(flags&ALPHA_FLAG)!=0;info.animated=(flags&ANIMATION_FLAG)!=0;
        info.frame_count=static_cast<int>(WebPDemuxGetI(demux,WEBP_FF_FRAME_COUNT));info.embedded_loop_count=static_cast<int>(WebPDemuxGetI(demux,WEBP_FF_LOOP_COUNT));
        if(info.frame_count<1||info.frame_count>120000)fail("WebP has an unsupported frame count.");
        WebPChunkIterator chunk{};if(WebPDemuxGetChunk(demux,"ICCP",1,&chunk)){
            if(chunk.chunk.size>4*1024*1024){WebPDemuxReleaseChunkIterator(&chunk);fail("The WebP colour profile is too large.");}
            info.icc=chunk.chunk.bytes;info.icc_size=chunk.chunk.size;WebPDemuxReleaseChunkIterator(&chunk);
        }
        if(info.animated){
            WebPIterator it{};if(!WebPDemuxGetFrame(demux,1,&it))fail("WebP has no readable frames.");
            int64_t ms=0;do{check();if(it.duration<0){WebPDemuxReleaseIterator(&it);fail("Invalid WebP frame duration.");}const int64_t before=ms;ms+=it.duration;if(ms>86400000){WebPDemuxReleaseIterator(&it);fail("WebP duration exceeds one day.");}if(ms>before)webp_intervals.push_back({static_cast<double>(before)/1000,static_cast<double>(ms)/1000});}while(WebPDemuxNextFrame(&it));WebPDemuxReleaseIterator(&it);
            if(ms<=0)fail("Animated WebP has no positive presentation duration.");info.duration=static_cast<double>(ms)/1000;
            WebPAnimDecoderOptions options{};if(!WebPAnimDecoderOptionsInit(&options))fail("WebP decoder ABI mismatch.");options.color_mode=MODE_RGBA;options.use_threads=0;
            animation=WebPAnimDecoderNew(&data,&options);if(!animation)fail("WebP animation decoder could not start.");
        }
    }
    void init_webm(){
        mkvparser::EBMLHeader header;long long pos=0;
        if(header.Parse(&reader,pos)!=0||!header.m_docType||std::strcmp(header.m_docType,"webm"))fail("This is not a supported WebM container.");
        mkvparser::Segment *raw=nullptr;if(mkvparser::Segment::CreateInstance(&reader,pos,raw)!=0||!raw)fail("Invalid WebM segment.");segment.reset(raw);
        if(segment->Load()!=0)fail("WebM indexing failed or exceeded the read budget.");
        auto tracks=segment->GetTracks();if(!tracks||tracks->GetTracksCount()>64)fail("WebM has invalid tracks.");
        for(unsigned long i=0;i<tracks->GetTracksCount();i++){const auto *t=tracks->GetTrackByIndex(i);if(t&&t->GetType()==mkvparser::Track::kVideo){if(track)fail("Choose a WebM containing one video track.");track=static_cast<const mkvparser::VideoTrack*>(t);}}
        if(!track||!track->GetCodecId())fail("WebM has no video track.");
        if(track->GetContentEncodingCount()!=0)fail("Encrypted or compressed WebM tracks are unsupported.");
        if(alpha_video(reader,track->m_element_start,track->m_element_start+track->m_element_size))fail("Transparent WebM is not supported; use animated WebP for alpha.");
        std::string codec=track->GetCodecId();info.codec=codec=="V_VP8"?2:codec=="V_VP9"?3:0;
        if(!info.codec)fail("WebM supports VP8 and VP9 here; this track uses another codec.");
        dimensions(track->GetWidth(),track->GetHeight());info.width=static_cast<int>(track->GetWidth());info.height=static_cast<int>(track->GetHeight());
        if(track->GetStereoMode()!=0)fail("Stereoscopic WebM is unsupported.");
        if((track->GetDisplayWidth()>0&&track->GetDisplayWidth()!=info.width)||(track->GetDisplayHeight()>0&&track->GetDisplayHeight()!=info.height))fail("Non-square-pixel WebM is unsupported; the source was not changed.");
        if(auto colour=track->GetColour()){
            info.colour_matrix=static_cast<int>(colour->matrix_coefficients);info.colour_transfer=static_cast<int>(colour->transfer_characteristics);info.full_range=colour->range==2;
            if((colour->bits_per_channel!=mkvparser::Colour::kValueNotPresent&&colour->bits_per_channel>8)||colour->transfer_characteristics==16||colour->transfer_characteristics==18)fail("High-bit-depth and HDR WebM are not supported in this release.");
        }
        const mkvparser::BlockEntry *entry=nullptr;
        if(track->GetFirst(entry)!=0)fail("WebM has no readable video packets.");
        const double defaultDuration=static_cast<double>(track->GetDefaultDuration())/1e9;
        while(entry&&!entry->EOS()){
            check();if(packets.size()>=250000)fail("WebM exceeds the bounded packet-index limit.");const auto *block=entry->GetBlock();
            if(!block||block->GetFrameCount()!=1)fail("Laced WebM video blocks are unsupported.");
            const double pts=static_cast<double>(block->GetTime(entry->GetCluster()))/1e9;
            if(!std::isfinite(pts)||pts<0||(!packets.empty()&&pts<=packets.back().pts))fail("WebM video timestamps must increase in presentation order.");
            auto data=block->GetFrame(0);if(data.len<=0||data.len>32*1024*1024)fail("A WebM packet exceeds the decode budget.");
            double duration=defaultDuration;
            if(entry->GetKind()==mkvparser::BlockEntry::kBlockGroup){auto group=static_cast<const mkvparser::BlockGroup*>(entry);if(group->GetDurationTimeCode()>0)duration=static_cast<double>(group->GetDurationTimeCode())*segment->GetInfo()->GetTimeCodeScale()/1e9;}
            packets.push_back(Packet{data,pts,duration>0?pts+duration:0,block->IsKey()});
            const mkvparser::BlockEntry *next=nullptr;if(track->GetNext(entry,next)<0)fail("WebM packet traversal failed.");entry=next;
        }
        if(packets.empty()||!packets.front().key)fail("WebM must begin with a decodable keyframe.");
        const double declared=static_cast<double>(segment->GetDuration())/1e9;
        for(size_t i=0;i+1<packets.size();i++)packets[i].end=packets[i+1].pts;
        auto &last=packets.back();if(declared>last.pts&&std::isfinite(declared))last.end=last.end>last.pts?std::min(last.end,declared):declared;
        if(last.end<=last.pts||last.end>86400||!std::isfinite(last.end))fail("WebM has no reliable final-frame duration.");
        info.first_timestamp=packets.front().pts;info.duration=last.end;info.frame_count=static_cast<int>(packets.size());
        reset_vpx(0);pixels.resize(static_cast<size_t>(info.width)*info.height*4);
    }
    void reset_vpx(size_t packet){
        if(vpx_live){vpx_codec_destroy(&vpx);vpx_live=false;}vpx_codec_dec_cfg_t cfg{};cfg.threads=2;cfg.w=info.width;cfg.h=info.height;
        if(vpx_codec_dec_init(&vpx,info.codec==2?vpx_codec_vp8_dx():vpx_codec_vp9_dx(),&cfg,0)!=VPX_CODEC_OK)fail("Cannot initialize the VP8/VP9 decoder.");
        vpx_live=true;next_packet=packet;current_start=current_end=-1;
    }
    void webm_frame(size_t index){
        check();const Packet &p=packets[index];encoded.resize(static_cast<size_t>(p.data.len));
        if(p.data.Read(&reader,encoded.data())!=0)fail("Cannot read a WebM video packet.");
        vpx_codec_stream_info_t stream{};stream.sz=sizeof(stream);
        const auto peek=vpx_codec_peek_stream_info(info.codec==2?vpx_codec_vp8_dx():vpx_codec_vp9_dx(),encoded.data(),static_cast<unsigned int>(encoded.size()),&stream);
        if(peek==VPX_CODEC_OK&&stream.w&&stream.h){dimensions(stream.w,stream.h);if(stream.w!=static_cast<unsigned>(info.width)||stream.h!=static_cast<unsigned>(info.height))fail("Coded dimensions changed beyond the admitted source.");}
        if(vpx_codec_decode(&vpx,encoded.data(),static_cast<unsigned int>(encoded.size()),nullptr,0)!=VPX_CODEC_OK)fail("The VP8/VP9 video packet is damaged.");
        vpx_codec_iter_t iter=nullptr;vpx_image_t *image=vpx_codec_get_frame(&vpx,&iter);
        if(!image)fail("A WebM timestamp does not produce a visible decoded frame.");
        if(image->bit_depth!=8||(image->fmt&VPX_IMG_FMT_HIGHBITDEPTH)||image->d_w!=static_cast<unsigned>(info.width)||image->d_h!=static_cast<unsigned>(info.height))fail("Unsupported video bit depth or changing coded dimensions.");
        if(image->x_chroma_shift>1||image->y_chroma_shift>1)fail("Unsupported WebM chroma sampling.");
        double kr=.2126,kb=.0722;int matrix=info.colour_matrix;
        if(matrix<=0||matrix==2){if(image->cs==VPX_CS_BT_601||image->cs==VPX_CS_SMPTE_170)matrix=6;else if(image->cs==VPX_CS_BT_2020)matrix=9;else matrix=1;}
        if(matrix==5||matrix==6){kr=.299;kb=.114;}else if(matrix==9){kr=.2627;kb=.0593;}else if(matrix!=1)fail("This WebM colour matrix is not supported.");
        const bool full=info.full_range||image->range==VPX_CR_FULL_RANGE;
        for(int y=0;y<info.height;y++){if((y&31)==0)check();for(int x=0;x<info.width;x++){
            const double yy=image->planes[VPX_PLANE_Y][y*image->stride[VPX_PLANE_Y]+x];
            const int cx=x>>image->x_chroma_shift,cy=y>>image->y_chroma_shift;
            const double cb=image->planes[VPX_PLANE_U][cy*image->stride[VPX_PLANE_U]+cx]-128,cr=image->planes[VPX_PLANE_V][cy*image->stride[VPX_PLANE_V]+cx]-128;
            const double l=full?yy:(yy-16)*255/219,u=cb*(full?1:255.0/224),v=cr*(full?1:255.0/224);
            auto *rgba=pixels.data()+(static_cast<size_t>(y)*info.width+x)*4;
            rgba[0]=static_cast<uint8_t>(byte(l+2*(1-kr)*v));rgba[2]=static_cast<uint8_t>(byte(l+2*(1-kb)*u));rgba[1]=static_cast<uint8_t>(byte(l-2*kb*(1-kb)/(1-kr-kb)*u-2*kr*(1-kr)/(1-kr-kb)*v));rgba[3]=255;
        }}
        current_start=p.pts;current_end=p.end;next_packet=index+1;
    }
    DriftCodecFrame read(double time,bool final,double start,double end){
        check();if(!std::isfinite(time)||!std::isfinite(start)||!std::isfinite(end)||start<0||end<start)fail("Invalid source sample request.");
        if(info.codec==1&&!info.animated){if(!webp_pixels){webp_pixels=WebPDecodeRGBA(file.map(),static_cast<size_t>(file.size),&info.width,&info.height);webp_static_owned=true;if(!webp_pixels)fail("WebP pixels could not be decoded.");}return DriftCodecFrame{webp_pixels,info.width,info.height,info.width*4,0,0};}
        if(info.codec==1){
            double target=time;
            if(final){auto it=std::lower_bound(webp_intervals.begin(),webp_intervals.end(),end,[](const WebPInterval &p,double value){return p.start<value;});
                if(it==webp_intervals.begin())fail("No WebP frame intersects the trim.");--it;
                if(it->end<=start)fail("No WebP frame intersects the trim.");target=it->start;}
            if(target<current_start){WebPAnimDecoderReset(animation);current_start=current_end=-1;webp_frame=0;}
            while(current_end<=target){check();int timestamp=0;double before=webp_frame?current_end:0;
                if(!WebPAnimDecoderHasMoreFrames(animation)||!WebPAnimDecoderGetNext(animation,&webp_pixels,&timestamp))fail("WebP animation ended before the requested frame.");
                webp_frame++;current_start=before;current_end=static_cast<double>(timestamp)/1000;
            }
            if(target<current_start)fail("No WebP frame covers the requested source time.");
            return DriftCodecFrame{webp_pixels,info.width,info.height,info.width*4,current_start,current_end-current_start};
        }
        size_t wanted=0;
        if(final){auto it=std::lower_bound(packets.begin(),packets.end(),end,[](const Packet&p,double value){return p.pts<value;});
            if(it==packets.begin())fail("No WebM frame intersects the trim.");--it;
            if(it->end<=start)fail("No WebM frame intersects the trim.");wanted=static_cast<size_t>(it-packets.begin());}
        else{auto it=std::upper_bound(packets.begin(),packets.end(),time,[](double v,const Packet&p){return v<p.pts;});if(it==packets.begin())wanted=0;else wanted=static_cast<size_t>((it-packets.begin())-1);
            if(time<packets[wanted].pts-1e-8||time>=packets[wanted].end)fail("No WebM frame covers the requested source time.");}
        const double target=packets[wanted].pts;
        if(current_start==target)return DriftCodecFrame{pixels.data(),info.width,info.height,info.width*4,current_start,current_end-current_start};
        if(wanted<next_packet||wanted>next_packet+120){size_t key=wanted;while(key>0&&!packets[key].key)--key;reset_vpx(key);}
        while(next_packet<=wanted)webm_frame(next_packet);
        return DriftCodecFrame{pixels.data(),info.width,info.height,info.width*4,current_start,current_end-current_start};
    }
};
extern "C" DriftCodec *drift_codec_open_cancellable(const char *path,DriftCancellation *token,char *error,size_t n){try{
    if(!path||(token&&token->cancelled.load()))fail("Media opening cancelled or path unavailable.");
    auto result=std::make_unique<DriftCodec>(path,token);uint8_t header[12]{};if(result->reader.Read(0,12,header)!=0)fail("The media header is truncated.");
    if(!std::memcmp(header,"RIFF",4)&&!std::memcmp(header+8,"WEBP",4))result->init_webp();
    else if(header[0]==0x1a&&header[1]==0x45&&header[2]==0xdf&&header[3]==0xa3)result->init_webm();
    else fail("The source is neither WebP nor WebM.");
    return result.release();
}catch(const std::exception&e){message(error,n,e.what());return nullptr;}catch(...){message(error,n,"Native media parser failed.");return nullptr;}}
extern "C" int drift_codec_info(DriftCodec *c,DriftCodecInfo *out){if(!c||!out)return 0;*out=c->info;return 1;}
extern "C" int drift_codec_read(DriftCodec *c,double time,int final,double start,double end,DriftCodecFrame *out,char *error,size_t n){try{if(!c||!out)fail("Decoder is unavailable.");c->reader.calls=0;*out=c->read(time,final!=0,start,end);return 1;}catch(const std::exception&e){message(error,n,e.what());return 0;}catch(...){message(error,n,"Native frame decoding failed.");return 0;}}
extern "C" void drift_codec_cancel(DriftCodec *c){if(c)c->cancelled.store(true);}
extern "C" void drift_codec_close(DriftCodec *c){delete c;}

extern "C" DriftCodec *drift_codec_open(const char *path,char *error,size_t n){return drift_codec_open_cancellable(path,nullptr,error,n);}
extern "C" DriftCancellation *drift_cancellation_create(void){try{return new DriftCancellation();}catch(...){return nullptr;}}
extern "C" void drift_cancellation_cancel(DriftCancellation *token){if(token)token->cancelled.store(true);}
extern "C" void drift_cancellation_destroy(DriftCancellation *token){delete token;}
