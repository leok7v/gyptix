#include <stdio.h>
#include "gyptix.h"

extern "C" {

void start(void) {
    printf("start\n");
}

void inactive(void) {
    printf("inactive\n");
}

void stop(void) {
    printf("stop\n");
}

}

