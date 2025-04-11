"use strict" // mdw.js (Makrdown Worker)

import * as marked from "./marked.js"

let md = ""
let length = 0 // last Html length

self.onmessage = function(e) {
    const { type, chunk } = e.data
    if (type === "append") {
        try {
            md += chunk
//          console.log("md: " + md)
            const html = marked.parse(md)
            self.postMessage({ html: html, error: null })
        } catch (err) {
            self.postMessage({ html: null, error: err.message })
        }
    }
    if (type === "reset") {
        md = ""
        length = 0
    }
}
