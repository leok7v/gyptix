"use strict"

import * as detect      from "./detect.js"
import * as model       from "./model.js"
import * as util        from "./util.js"

export const run = () => {
    console.log("run")
}

export const inactive = () => {
    return "done"
}

export const debugger_attached = (attached) => {
    console.log(`debugger_attached(): ${attached}, typeof: ${typeof attached}`)
    if (typeof attached === "string") attached = (attached === "true")
    util.set_debugger_attached(attached);
    if (!attached) {
        document.body.oncontextmenu = (e) => e.preventDefault()
        console.log("debugger_attached: disabling context menu")
    }
    return attached ? "conext menu enabled" : "conext menu disabled"
}

window.app = { run: run, inactive: inactive, debugger_attached: debugger_attached }

console.log("initialized")

model.initialized()
