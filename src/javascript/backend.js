"use strict"

import * as util from "./util.js"

const sleep = async (ms) => {
    await new Promise(resolve => setTimeout(resolve, ms))
}

export const ask = (value) => { // returns error message or null on OK
    if (is_running()) {
        const result = util.post("./ask", value)
        return result === "OK" ? null : new Error(result)
    } else {
        return new Error("not running")
    }
}

export const run = id => {
    util.post("./run", id)
}

export const remove = id => util.post("./remove", id)

export const download = (url) => {
    return util.post("./download", url, null)
}

export const download_remove = (url) => {
    return util.post("./download_remove", url, null)
}

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

// app.* methods can be called from native code
export const initialized = () => util.post("./initialized")

export const quit = () => util.post("./quit") // fatal no return

