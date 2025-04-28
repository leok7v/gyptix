"use strict"

import * as backend from "./backend.js"
import * as modal   from "./modal.js"

const verbose = false

const log = verbose ? console.log : () => {}

export const info = {
    "context_tokens": 4096, // default
    "session_tokens": 0,
    "generated": 0,
    "progress": 1.000000,
    "average_token": 4.357,
    "tps": 0,
    "logits_bytes": 0,
    "sum": 0,
    "time": 0,
    "platform": "macOS", // "iPhone", "iPad"
    "git_hash": "BADBEEF",
    "ram": 0,
    "storage": 0,
    "gpu": {
        "recommended_max_working_set_size": 0,
        "has_unified_memory": 1
    },
    "is_iOS_app_on_mac": 0,
    "is_mac_catalyst_app": 0,
    "cpu": 0,
    "active_cpu": 0
}

export const interrupt = (state) => {
    backend.interrupt() // next poll will get "<--done-->"
    state.interrupted = true
//  log(`state.interrupted: ${state.interrupted}`)
}

const averages = (state) => {
    const seconds  = (state.completed - state.started) / 1000;
    state.cps      = seconds === 0 ? 0 : state.generated / seconds
    if (state.ewma === 0) {
        state.ewma = state.cps
    } else {
        const alpha = 1.0 / 8.0
        state.ewma  = state.ewma * (1 - alpha) + state.cps * alpha
    }
    log(`.cps: ${state.cps.toFixed(1)} ` +
        `.ewma: ${state.ewma.toFixed(3)} ` +
        `.tma: ${state.tma.toFixed(3)}`)
}

const completed = (state) => {
    log("completed")
    update_info()
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

export const update_info = () => {
    Object.assign(info, backend.stat())
}

const poll_stats = (state) => {
    const now = performance.now()
    if (now - state.last_info >= 100) {
        update_info()
        state.last_info = now;
        if (state.progress) { state.progress(state) }
    }
}

const poll = (state) => {
    // interval polling can accumulate in a queue and be dispatched
    // after 'done' is called - ignore those
    if (state.completed !== 0) { return }
    // TODO: need progress 0..1 too in backend.poll() for prompt processing
    //       and backend.interrupt() should also be able to cancel long
    //       prompt processing for sizable prompts
    poll_stats(state)
    const tokens = backend.poll()
    if (tokens.startsWith('<--error-->') && tokens.endsWith('</--error-->')) {
        const message = tokens.slice( // strip off the tags
            '<--error-->'.length, -('</--error-->'.length)
        )
        modal.fatal_error(message)
    } else if (tokens === "<--done-->") {
//      log("<--done-->")
        clearInterval(state.polling)
        completed(state)
    } else if (tokens && tokens.length > 0) {
        const alpha = 1.0 / 64.0
        state.tma = state.tma * (1 - alpha) + tokens.length * alpha
        state.tokens = tokens
        state.generated += tokens.length
        state.result.push(tokens)
//      log(`state.generated: ${state.generated} tokens: ${tokens}`)
//      log(`state.response != null: ${state.response != null}`)
        state.response(state)
        if (state.generated >= state.maximum) { state.interrupt(state) }
    }
}

export const create = () => {
    update_info()
    return {
        started:     0,         // performance.now() at chat() call
        last_info:   0,         // performance.now() when last info was polled
        error:       null,      // Error object
        prompt:      "",        // current prompt
        response:    null,      // response(state) called for generated token(s)
        progress:    null,      // progress(state) called for prompt token(s)
        processed:   0,         // 0..1 ratio of processed promot
        done:        null,      // called when generation is complete
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
        // bound methods:
        interrupt() {
            interrupt(this);
        },
        start(prompt, response, done) {
            return start(this, prompt, response, done);
        },
        ask(prompt, maximum = Infinity) {
            return ask(this, prompt, maximum);
        }
    }
}

const start = (state, prompt, response, done) => {
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
    state.started     = performance.now()
    state.last_info   = state.started
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
//  log(`start("${prompt}")`)
    if (state.error) {
        completed(state)
    } else {
        const Hz = state.tma == 0 ? 0 : state.ewma / state.tma
        const i = Hz == 0 ? 33 : (1000 / Hz) // default interval 33Hz
        const interval = state.interval ?? i
        if (verbose) {
            log(`.cps: ${state.cps.toFixed(1)} ` +
                `.ewma: ${state.ewma.toFixed(3)} ` +
                `.tma: ${state.tma.toFixed(3)}`)
            log(`.Hz: ${Hz.toFixed(3)} .i: ${i.toFixed(3)} ` +
                `.interval: ${interval.toFixed(3)}`)
        }
        state.polling = setInterval(() => poll(state), interval)
    }
}

const ask = (state, prompt, maximum = Infinity) => {
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

let model = llm.create()

### With streaming:

model.start("Once upon a time…",
    model => { // per-token callback
        console.log(model.tokens)
    },
    model => { // completion callback
        if (model.error) {
            console.error(model.error)
        } else {
            console.log(`.cps ${model.cps} .result: ${model.result.join("")}`)
        }
    }, 4096
)

### Without streaming:

model.ask("Tell me a joke", 500)
    .then(text => {
        console.log("Joke:", text)
    })
    .catch(error => {
        console.error("Error:", error)
    })

## Brief theory of operation:

create() returns a fresh model state object with all fields initialized.

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
