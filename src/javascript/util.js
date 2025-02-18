"use strict"

export const toast = s => {
    const div = document.createElement("div")
    div.style.position  = "fixed"
    div.style.top       = "10px"
    div.style.left      = "50%"
    div.style.transform = "translateX(-50%)"
    div.style.color     = "white"
    div.style.padding   = "10px 20px"
    div.style.zIndex    = "10000"
    div.style.backgroundColor = "rgba(255,0,0,0.9)"
    div.textContent   = s
    document.body.appendChild(div)
    setTimeout(() => document.body.removeChild(div), 3300)
}

const http = (url, method, req = "", done = null) => {
    let error = null
    let text = `Failed to load ${url}`
    try {
        const request = new XMLHttpRequest()
        request.open(method, url, false) // false = synchronous
        request.setRequestHeader("Content-Type", "text/plain")
        if (method === "POST") {
            request.send(req)
        } else {
            request.send()
        }
        if (request.status === 200) {
            text = request.responseText
            if (done) done(text)
        } else {
            error = new Error(`${url} ${method} failed: ${request.status}`)
        }
    } catch (e) {
        error = new Error(`${url} ${method} failed: ${e}`)
    }
    if (error) throw error
    return text
}

export const load = (url) => http(url, "GET")

export const post = (url, req = "", done = null) => http(url, "POST", req, done)

export const rename_in_place = (span, old_name) => {
    return new Promise(resolve => {
        span.contentEditable = "true"
        const original_text = span.innerText
        span.focus()
        const range = document.createRange()
        range.selectNodeContents(span)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        function finish(value) {
            span.contentEditable = "false"
            resolve(value)
        }
        span.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault()
                const new_text = span.innerText.trim() || old_name
                finish(new_text)
            } else if (e.key === "Escape") {
                e.preventDefault()
                span.innerText = original_text
                finish(null)
            }
        })
        span.addEventListener("blur", () => {
            span.innerText = original_text
            finish(null)
        }, { once: true })
    })
}
