"use strict" // mdw.js (Makrdown Worker)

import * as marked from "./marked.js"

let md = ""

self.onmessage = function(e) {
    const { type, chunk } = e.data
    if (type === "reset") {
        md = ""
    } else if (type === "append") {
        try {
            md += chunk
            const html = marked.parse(md)
            self.postMessage({ html: html, error: null })
        } catch (err) {
            self.postMessage({ html: null, error: err.message })
        }
    }
}
