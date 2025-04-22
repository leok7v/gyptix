"use strict"

import * as detect from "./detect.js"

export let is_debugger_attached = false

export function set_debugger_attached(attached) {
    is_debugger_attached = attached
    console.log("set_debugger_attached(" + attached + ")")
}

export const timestamp = () => Date.now() // UTC timestamp in milliseconds

export const random_int = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min

export const word_count = s => s.trim().split(/\s+/).filter(Boolean).length

export const capitalize = (s) => {
    const cp = s.codePointAt(0)
    const fc = String.fromCodePoint(cp)
    return fc.toLocaleUpperCase() + s.slice(fc.length)
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

export const log = (...args) => {
    return post("./log", args.join(''), null)
}

export const console_log = console.log

const start = Date.now() // UTC timestamp in milliseconds

console.log = (...args) => {
    try {
        throw new Error()
    } catch (e) {
        const dt = (Date.now() - start) / 1000.0 // seconds
        const lines = e.stack.split('\n')
        let f = lines[1] || ''
        if (f.includes('util.js')) f = lines[2] || ''
        let func = f.includes('@') ? f.substring(0, f.indexOf('@')) : ''
        if (func != '') func = ' ' + func + '()'
        let m = f.match(/@(.*?):(\d+):\d+/) || // @gyptix://./modal.js:67:46
                f.match(/(.*?):(\d+):\d+/)
        if (m) { // m.length > 1 guaranteed by regexes above
            const file = m[1].split('/').pop()
            const line = m[2]
            const s = `${dt.toFixed(3)} ${file}:${line}${func} ${args.join("\x20")}`
            log(s)
            console_log(s)
        } else {
            if (f != '') log(f)
            log(...args)
            console_log(...args)
        }
    }
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
    const min_font = detect.iPad ? 90 : 100
    font_size = Math.max(min_font, font_size - 10);
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
        "where", "while", "again", "said", "says", "from", "into", "over",
        "what", "when", "more", "less", "ever", "your"
])

const shorten_the_sentence = (str, limit) => {
    const words = str.split(/\s+/).filter(Boolean) // Remove empty words
    let result = ""
    for (let word of words) {
        if ((result.length + word.length + (result ? 1 : 0)) > limit) break
        result += (result ? " " : "") + word
    }
    return result
}

export const summarize = (str) => {
    // three most frequent words
    if (typeof str !== "string") { return timestamp_label(timestamp()) }
    const words = str.toLowerCase().match(/\b\w+\b/g) || []
    if (words.length === 0) { return timestamp_label(timestamp()) }
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
    
    const sorted = [...map.entries()]
        .sort((a, b) => b[1] - a[1] ||
                       a[0].localeCompare(b[0]))
    for (let i = 0; i < sorted.length; i++) {
        let [w, c] = sorted[i] // `w` word, `c` count
        if (c < 3) break
        console.log(`${w} ${c}`)
    }
        
    let s = [...map.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(entry => entry[0])
        .join(" ")
    s = shorten_the_sentence(s, 24)
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export const substitutions = (text) => {
    // `text` input string
    const now = new Date()
    const replacements = {
        '[insert current date]': now.toLocaleDateString(),
        '[insert day of the week]': now.toLocaleDateString(undefined, {
            weekday: 'long'
        }),
        '[insert current time]': now.toLocaleTimeString()
    }
    const pattern = new RegExp(
        Object.keys(replacements)
            .map(k => k.replace(/[\[\]]/g, '\\$&'))
            .join('|'),
        'gi'
    )
    text = text.replace(pattern,
        match => replacements[match.toLowerCase()] || match
    )
    // strip remaining bracketed text except markdown markdown links:
    text = text.replace(
        /(\[[^\]]+\]\([^)]*\))|(\[[^\]]+\])/g,
        (match, link) => link ? match : ''
    )
    return text
}

