"use strict"

import * as detect from "./detect.js"

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

export const log = (...args) => {
    return post("./log", args.join(''), null)
}

export const console_log = console.log

console.log = (...args) => {
    log(...args)
    console_log(...args)
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

export const init_font_size = () => {
    let fs = 100
    if (detect.iPhone) fs = 130
    if (detect.iPad)   fs = 160
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
    const max_font = detect.iPad ? 200 : 160
    font_size = Math.min(max_font, font_size + 10);
    document.body.style.fontSize = font_size + "%";
    localStorage.setItem("settings.font-size", font_size);
}

export const shorten_the_sentence = (str, limit) => {
    const words = str.split(/\s+/).filter(Boolean) // Remove empty words
    let result = ""
    for (let word of words) {
        if ((result.length + word.length + (result ? 1 : 0)) > limit) break
        result += (result ? " " : "") + word
    }
    return result
}

export const timestamp = () => Date.now() // UTC timestamp in milliseconds

export const timestamp_label = (timestamp) => {
    const d = new Date(timestamp)
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    const options = { hour: "2-digit", minute: "2-digit",
                    second: "2-digit", hour12: true }
    const time = d.toLocaleTimeString(undefined, options) ||
                 `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
    return `${days[d.getDay()]} ${time}`
}

const stop_words = new Set([
        "were", "this", "that", "there", "which", "their", "would",
        "could", "with", "should", "about", "because", "after", "before",
        "where", "while", "again"
])

export const summarize = (str) => {
    // three most frequent words
    if (typeof str !== "string") return timestamp_label(timestamp())
    const words = str.toLowerCase().match(/\b\w+\b/g) || []
    if (words.length === 0) return timestamp_label(timestamp())
    let map = new Map()
    for (let word of words) {
        if (word.endsWith("s")) {
            let singular = word.slice(0, -1)
            if (map.has(singular)) {
                word = singular
            }
        }
        if (word.length <= 3 || word.startsWith("the") || stop_words.has(word)) {
            continue
        }
        map.set(word, (map.get(word) || 0) + 1)
    }
    let s = [...map.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(entry => entry[0])
        .join(" ")
    s = shorten_the_sentence(s, 24)
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

