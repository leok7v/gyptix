"use strict" // markdown.js

let worker     = new Worker("mdw.js", { type: "module" })
let callback   = null // user callback
let processing = false
let queue      = ""

worker.onmessage = (e) => {
    processing = false
    const { html, error } = e.data
    if (error) {
        console.log("error: " + error)
        callback(null, error);
    } else {
//      console.log("html: " + html)
        callback(html, null);
    }
    callback = null
}

const process_next = () => {
    if (processing || queue.lengh === 0) return
    const text = queue
    queue = ""
    processing = true
//  console.log("text: " + text)
    worker.postMessage({ type: "append", chunk: text })
}

export const start = () => {
    processing = false
    callback = null
    queue = ""
    worker.postMessage({ type: "reset" })
}

export const post = (chunk, cb) => {
    queue += chunk
    callback = cb
    process_next()
}

export { queue }
