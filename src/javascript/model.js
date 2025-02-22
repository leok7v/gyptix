"use strict"

import * as util from "./util.js"

export const ask = (value) => { // returns error message or null on OK
    const error = util.post("./ask", value)
    return error === "OK" ? null : error
}

export const run = (id) => {
    util.post("./run", id)
}

export const poll = () => {
    return util.post("./poll", "", null)
}

export const interrupt = () => {
    return util.post("./poll", "<--interrupt-->", null)
}

export const is_running = () => {
    return util.post("./is_running") === "true"
}

export const is_answering = () => {
    return util.post("./is_answering") === "true"
}

export const quit = () => {
    util.post("./quit")
}
