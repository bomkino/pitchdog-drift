#ifndef DRIFT_ARCHIVE_H
#define DRIFT_ARCHIVE_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct DriftArchive DriftArchive;
DriftArchive *drift_archive_reader(const char *path,char *error,size_t capacity);
DriftArchive *drift_archive_writer(const char *path,char *error,size_t capacity);
/* next returns 1 for a regular entry, 0 for EOF, -1 for an error. No extraction API is exposed. */
int drift_archive_next(DriftArchive *,char *name,size_t capacity,int64_t *size,char *error,size_t error_capacity);
int64_t drift_archive_read(DriftArchive *,void *bytes,size_t count,char *error,size_t capacity);
int drift_archive_begin(DriftArchive *,const char *name,int64_t size,char *error,size_t capacity);
int64_t drift_archive_write(DriftArchive *,const void *bytes,size_t count,char *error,size_t capacity);
int drift_archive_finish(DriftArchive *,char *error,size_t capacity);
void drift_archive_free(DriftArchive *);
#ifdef __cplusplus
}
#endif
#endif
