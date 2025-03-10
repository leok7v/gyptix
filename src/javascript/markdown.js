"use strict" // markdown.js

let worker = new Worker("mdw.js", { type: "module" })
let callback = null;

let processing = false

worker.onmessage = (e) => {
    const { html, error } = e.data;
    processing = false;
    if (error) {
        callback?.(null, error);
    } else {
        callback?.(html, null);
    }
    callback = null; 
}

export function start() {
    processing = false
    callback = null
    worker.postMessage({ type: "reset" })
}

export function post(chunk, cb) {
    if (processing) throw new Error("Already processing Markdown")
    processing = true
    callback = (html, error) => { processing = false; cb(html, error) }
    worker.postMessage({ type: "append", chunk: chunk })
}

