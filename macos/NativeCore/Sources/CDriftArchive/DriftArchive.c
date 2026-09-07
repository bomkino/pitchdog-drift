#include "DriftArchive.h"
#include <archive.h>
#include <archive_entry.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
struct DriftArchive {struct archive *handle;int writing;int finished;};
static void fail(DriftArchive *a,char *error,size_t count,const char *fallback){const char *text=a && a->handle?archive_error_string(a->handle):NULL;if(count)snprintf(error,count,"%s",text?text:fallback);}
static DriftArchive *open_archive(const char *path,int writing,char *error,size_t count){
    DriftArchive *a=calloc(1,sizeof(*a));if(!a){fail(NULL,error,count,"Not enough memory for project I/O.");return NULL;}
    a->writing=writing;a->handle=writing?archive_write_new():archive_read_new();
    if(!a->handle){fail(a,error,count,"Project archive initialization failed.");drift_archive_free(a);return NULL;}
    int code;
    if(writing){
        code=archive_write_set_format_zip(a->handle);
        if(code==ARCHIVE_OK)code=archive_write_set_options(a->handle,"zip:compression=store,zip:zip64");
        if(code==ARCHIVE_OK)code=archive_write_open_filename(a->handle,path);
    }else{
        code=archive_read_support_format_zip(a->handle);
        if(code==ARCHIVE_OK)code=archive_read_open_filename(a->handle,path,64*1024);
    }
    if(code!=ARCHIVE_OK){fail(a,error,count,"The project archive could not be opened.");drift_archive_free(a);return NULL;}return a;
}
DriftArchive *drift_archive_reader(const char *p,char *e,size_t n){return open_archive(p,0,e,n);}
DriftArchive *drift_archive_writer(const char *p,char *e,size_t n){return open_archive(p,1,e,n);}
int drift_archive_next(DriftArchive *a,char *name,size_t n,int64_t *size,char *error,size_t cap){
    struct archive_entry *entry=NULL;int code=archive_read_next_header(a->handle,&entry);
    if(code==ARCHIVE_EOF)return 0;
    if(code!=ARCHIVE_OK){fail(a,error,cap,"The project archive is malformed.");return -1;}
    const char *p=archive_entry_pathname(entry);
    if(!p || strlen(p)>=n || archive_entry_filetype(entry)!=AE_IFREG || archive_entry_hardlink(entry) || archive_entry_symlink(entry) || archive_entry_size(entry)<0){fail(NULL,error,cap,"The archive contains an unsafe or invalid entry.");return -1;}
    if(archive_entry_is_encrypted(entry)){fail(NULL,error,cap,"Encrypted projects are unsupported.");return -1;}
    memcpy(name,p,strlen(p)+1);*size=archive_entry_size(entry);return 1;
}
int64_t drift_archive_read(DriftArchive *a,void *p,size_t n,char *e,size_t cap){la_ssize_t r=archive_read_data(a->handle,p,n);if(r<0)fail(a,e,cap,"The project entry could not be read.");return r;}
int drift_archive_begin(DriftArchive *a,const char *name,int64_t size,char *e,size_t cap){
    struct archive_entry *entry=archive_entry_new();if(!entry){fail(NULL,e,cap,"Archive allocation failed.");return -1;}
    archive_entry_set_pathname(entry,name);archive_entry_set_size(entry,size);archive_entry_set_filetype(entry,AE_IFREG);archive_entry_set_perm(entry,0600);
    int r=archive_write_header(a->handle,entry);archive_entry_free(entry);if(r!=ARCHIVE_OK)fail(a,e,cap,"Could not write the project entry.");return r==ARCHIVE_OK?0:-1;
}
int64_t drift_archive_write(DriftArchive *a,const void *p,size_t n,char *e,size_t cap){la_ssize_t r=archive_write_data(a->handle,p,n);if(r<0)fail(a,e,cap,"Project write failed.");return r;}
int drift_archive_finish(DriftArchive *a,char *e,size_t cap){if(a->finished)return 0;int r=a->writing?archive_write_close(a->handle):archive_read_close(a->handle);a->finished=1;if(r!=ARCHIVE_OK)fail(a,e,cap,"Project finalization failed.");return r==ARCHIVE_OK?0:-1;}
void drift_archive_free(DriftArchive *a){if(!a)return;if(a->handle){if(a->writing)archive_write_free(a->handle);else archive_read_free(a->handle);}free(a);}
