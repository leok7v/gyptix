"use strict"

import * as backend from "./backend.js"

const interrupt = (state) => {
    backend.interrupt() // next poll will get "<--done-->"
    state.interrupted = true
}

const averages = (state) => {
    const seconds   = (state.completed - state.start) / 1000;
    state.cps       = seconds === 0 ? 0 : state.generated / seconds
    if (state.ewma === 0) {
        state.ewma  = state.cps
    } else {
        const alpha = 1.0 / 8.0
        state.ewma  = state.ewma * (1 - alpha) + state.cps * alpha
    }
    console.log(`.cps: ${state.cps.toFixed(1)} ` +
                `.ewma: ${state.ewma.toFixed(3)} ` +
                `.tma: ${state.tma.toFixed(3)}`)
}

const completed = (state) => {
    console.log("completed")
    const done = state.done
    state.polling   = null
    state.completed = performance.now()
    state.done      = null
    state.response  = null
    state.progress  = null
    state.maximum   = undefined
    // only calculate .cps and averages for long enough runs:
    if (state.generated > 256) { averages(state) }
    done(state)
}

const poll = (state) => {
    // interval polling can accumulate in a queue and be dispatched
    // after 'done' is called - ignore those
    if (state.completed !== 0) { return }
    // TODO: need progress 0..1 too in backend.poll() for prompt processing
    //       and backend.interrupt() should also be able to cancel long
    //       prompt processing for sizable prompts
    const tokens = backend.poll()
    if (tokens === "<--done-->") {
//      console.log("<--done-->")
        clearInterval(state.polling)
        completed(state)
    } else if (tokens && tokens.length > 0) {
        const alpha = 1.0 / 64.0
        state.tma = state.tma * (1 - alpha) + tokens.length * alpha
        state.tokens = tokens
        state.generated += tokens.length
        state.result.push(tokens)
//      console.log(`state.generated: ${state.generated} tokens: ${tokens}`)
//      console.log(`state.response != null: ${state.response != null}`)
        state.response(state)
        if (state.generated >= state.maximum) { state.interrupt(state) }
    }
}

export const create = () => {
    console.log("create")
    return {
        start:       0,         // performance.now() at chat() call
        error:       null,      // Error object
        prompt:      "",        // current prompt
        response:    null,      // response(state) called for generated token(s)
        progress:    null,      // progress(state) called for prompt token(s)
        processed:   0,         // 0..1 ratio of processed promot
        done:        null,      // called when generation is complete
        interrupt:   interrupt, // client can call to stop generation
        interrupted: false,     // chat tokens generation was interrupted
        maximum:     Infinity,  // maximum number of tokens to generate
        tokens:      "",        // last generated tokens response is called with
        result:      [],        // all generate tokens - use result.join('')
        generated:   0,         // length of result.join('')
        interval:    undefined, // polling interval in milliseconds
        polling:     undefined, // defined between chat() and done() calls
        completed:   0,         // performance.now() of done() call
        cps:         0,         // characters per second
        ewma:        0,         // exponentially weighted moving average of cps
        tma:         0,         // token length moving average
    }
}

export const start = (state, prompt, response, done) => {
    // verify correctness of state and arguments
    if (prompt.length == 0) {
        throw new Error("empty prompt")
    } else if (!response || !done) {
        throw new Error("must have response and done")
    } else if (state.polling) {
        throw new Error("still polling")
    } else if (!backend.is_running()) {
        throw new Error("not running")
    }
    state.start       = performance.now()
    state.prompt      = prompt
    state.response    = response
    state.done        = done
    state.processed   = 0
    state.interrupted = false
    state.result      = []
    state.generated   = 0
    state.tokens      = ""
    state.completed   = 0
    state.error = backend.ask(prompt)
//  console.log(`start("${prompt}")`)
    if (state.error) {
        completed(state)
    } else {
        const Hz = state.tma == 0 ? 0 : state.ewma / state.tma
        const i = Hz == 0 ? 33 : (1000 / Hz) // default interval 33Hz
        const interval = state.interval ?? i
        console.log(`.cps: ${state.cps.toFixed(1)} ` +
                    `.ewma: ${state.ewma.toFixed(3)} ` +
                    `.tma: ${state.tma.toFixed(3)}`)
        console.log(`.Hz: ${Hz.toFixed(3)} .i: ${i.toFixed(3)} ` +
                    `.interval: ${interval.toFixed(3)}`)
        state.polling = setInterval(() => poll(state), interval)
    }
}

export const ask = (state, prompt, maximum = Infinity) => {
    state.maximum = maximum
    return new Promise((resolve, reject) => {
        const response = () => {}
        const done = () => {
            if (state.error) {
                reject(state.error)
            } else {
                resolve(state.result.join(""))
            }
        }
        try {
            start(state, prompt, response, done)
        } catch (error) {
            reject(error)
        }
    })
}

/*

## Usage examples

import * as chat from "./chat.js"

let state = chat.create()

### With streaming:

chat.start(state, "Once upon a time…",
    state => { // per-token callback
        console.log(state.tokens)
    },
    state => { // completion callback
        if (state.error) {
            console.error(state.error)
        } else {
            console.log(`.cps ${state.cps} .result: ${state.result.join("")}`)
        }
    }, 4096
)

### Without streaming:

chat.ask(state, "Tell me a joke", 500)
    .then(text => {
        console.log("Joke:", text)
    })
    .catch(error => {
        console.error("Error:", error)
    })

## Brief theory of operation:

create() returns a fresh state object with all fields initialized.

start() kicks off backend.ask(prompt) and schedules setInterval → poll(state).

poll() clears its own interval before calling completed(state),
       and never touches any undefined variables.

completed() nulls out the callbacks and marks state.completed,
            preventing any further polling or double‑calls.

ask() simply sets state.maximum, passes empty lambdas into start(),
      and returns a Promise that resolves to state.result.join("")
      or rejects on any state.error or thrown exception.

clients can check
    if (state.polling) { console.log("still answering") }
at any time

*/
