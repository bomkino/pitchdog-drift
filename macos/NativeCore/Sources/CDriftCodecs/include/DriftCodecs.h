#ifndef DRIFT_CODECS_H
#define DRIFT_CODECS_H
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct DriftCodec DriftCodec;
typedef struct DriftCancellation DriftCancellation;
/* Keep the cancellation token alive until opening/decoding has finished. */
DriftCancellation *drift_cancellation_create(void);
void drift_cancellation_cancel(DriftCancellation *);
void drift_cancellation_destroy(DriftCancellation *);
typedef struct {
    int width, height, animated, alpha, codec; /* 1=WebP, 2=VP8, 3=VP9 */
    int frame_count, embedded_loop_count, colour_matrix, colour_transfer, full_range;
    double first_timestamp, duration;
    const uint8_t *icc; size_t icc_size;
} DriftCodecInfo;
typedef struct {
    const uint8_t *rgba; int width, height, stride;
    double timestamp, duration;
} DriftCodecFrame;
/* Objects are worker-confined. Only cancel is thread safe. Frames remain valid
   until the next read/close; the caller must finish copying before advancing. */
DriftCodec *drift_codec_open(const char *path, char *error, size_t error_size);
DriftCodec *drift_codec_open_cancellable(const char *path, DriftCancellation *, char *error, size_t error_size);
int drift_codec_info(DriftCodec *, DriftCodecInfo *);
int drift_codec_read(DriftCodec *, double time, int final_frame, double trim_start,
                     double trim_end, DriftCodecFrame *, char *error, size_t error_size);
void drift_codec_cancel(DriftCodec *);
void drift_codec_close(DriftCodec *);
#ifdef __cplusplus
}
#endif
#endif
