"use strict"

import * as util from "./util.js"

const sleep = async (ms) => {
    await new Promise(resolve => setTimeout(resolve, ms))
}

export const ask = (value) => { // returns error message or null on OK
    const deadline = Date.now() + 3000 // 3s deadline
    while (Date.now() && !is_running()) { sleep(100) }
    if (is_running()) {
        const error = util.post("./ask", value)
        return error === "OK" ? null : error
    } else {
        return "Model session is not running"
    }
}

export const run = id => {
    util.post("./run", id)
}

export const remove = id => util.post("./remove", id)

export const poll = () => {
    return util.post("./poll", "", null)
}

export const interrupt = () => {
    return util.post("./poll", "<--interrupt-->", null)
}

export const is_running = () =>  { 
    return util.post("./is_running") === "true"
}

export const is_answering = () => {
    return util.post("./is_answering") === "true"
}

export const erase = () => util.post("./erase")

// DOM loaded
export const loaded = () => util.post("./loaded")

// app.* methods can be called from native code
export const initialized = () => util.post("./initialized")

export const keyboard_frame = () => util.post("./keyboard_frame")

export const quit = () => util.post("./quit") // fatal no return
