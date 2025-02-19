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
//  setTimeout(() => document.body.removeChild(div), 3300)
    setTimeout(() => document.body.removeChild(div), 6000)
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
            const new_text = span.innerText.trim()
            if (new_text && new_text !== original_text) {
                finish(new_text)
            } else {
                span.innerText = original_text
                finish(null)
            }
        }, { once: true })
    })
}

export const init_theme = () => {
    let theme = localStorage.getItem("settings.theme")
    if (!theme) {
        theme = "dark"  // default theme
        localStorage.setItem("settings.theme", theme)
    }
    document.documentElement.setAttribute("data-theme", theme)
}

export const toggle_theme = () => {
    const html = document.documentElement
    let current = html.getAttribute("data-theme")
    let theme = current === "dark" ? "light" : "dark"
    html.setAttribute("data-theme", theme)
    localStorage.setItem("settings.theme", theme)
}

export const init_font_size = (macOS, iPhone, iPad) => {
    let fs = 100
    if (iPhone) fs = 130
    if (iPad)   fs = 160
    let font_size = localStorage.getItem("settings.font-size") || fs;
    document.body.style.fontSize = font_size + "%";
    localStorage.setItem("settings.font-size", font_size);
}

export const decrease_font_size = () => {
    let font_size = parseInt(localStorage.getItem("settings.font-size")) || 100;
    font_size = Math.max(90, font_size - 10);
    document.body.style.fontSize = font_size + "%";
    localStorage.setItem("settings.font-size", font_size);
}

export const increase_font_size = () => {
    let font_size = parseInt(localStorage.getItem("settings.font-size")) || 100;
    font_size = Math.min(160, font_size + 10);
    document.body.style.fontSize = font_size + "%";
    localStorage.setItem("settings.font-size", font_size);
}
