#ifndef GYPTIX_H
#define GYPTIX_H

#ifdef __cplusplus
extern "C" {
#endif

void start(const char* model);
void ask(const char* question);
const char* answer(const char* interrupt);
int is_answering();
int is_running();
void inactive(void);
void stop(void);

#ifdef __cplusplus
}
#endif

#endif /* GYPTIX_H */

