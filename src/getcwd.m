#ifdef __OBJC__
#import <Foundation/Foundation.h>
#endif
#include <string.h>

const char* get_cwd(void) {
    static char cwd[4096];
    if (cwd[0] == 0) {
#ifdef __OBJC__
        NSArray *paths = NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES);
        if ([paths count] > 0) {
            NSString *dir = [paths objectAtIndex:0];
            snprintf(cwd, sizeof(cwd), "%s", [dir UTF8String]);
            return cwd;
        }
#else
        getcwd(cwd, sizeof(cwd));
#endif
    }
    return cwd;
}
