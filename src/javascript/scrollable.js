"use strict"

import * as detect from "./detect.js"

export let is_debugger_attached = false

export function set_debugger_attached(attached) {
    is_debugger_attached = attached
    console.log("set_debugger_attached(" + attached + ")")
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
        var f = lines[1] || ''
        if (f.includes('util.js')) f = lines[2] || ''
        let m = f.match(/at .* \((.*?):(\d+):\d+\)/) ||
                f.match(/@(.*?):(\d+):\d+/) ||
                f.match(/(.*?):(\d+):\d+/)
        if (m) { // m.length > 1 guaranteed by regexes above
            const file = m[1].split('/').pop()
            const line = m[2]
            const s = `${dt.toFixed(3)} ${file}:${line} ${args.join("\x20")}`
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

export const substitutions = (s) => {
    const now = new Date()
    const replacements = {
        "[insert current date]": now.toLocaleDateString(),
        "[insert day of the week]": now.toLocaleDateString(undefined, { weekday: "long" }),
        "[insert current time]": now.toLocaleTimeString()
    }
    return s.replace(/\[insert (current date|day of the week|current time)\]/gi, (match) => {
        return replacements[match.toLowerCase()] || match
    })
}

export const create_scrollable = (list, is_answering, verbose) => {
    
    let scrollable = {
        autoscroll: false,
        scroll_to_top: null,
        scroll_to_bottom: null,
    }
    
    const log = verbose ? console.log : () => {}
    
    const create_buttton = (id, content) => {
        const b = document.createElement('button')
        b.style.position = 'absolute'
        b.style.display = 'block'
        b.id = id
        b.className = 'scroll-button'
        b.textContent = content
        return b
    }
    
    const button_top = create_buttton('scroll-top', '⏶')
    const button_bottom = create_buttton('scroll-bottom', '⏷')
    list.parentElement.appendChild(button_top)
    list.parentElement.appendChild(button_bottom)
    const position_buttons = () => {
        button_top.style.top       = "0.5rem"
        button_top.style.right     = "0.5rem"
        button_bottom.style.bottom = "0.5rem"
        button_bottom.style.right  = "0.5rem"
    }

    position_buttons()

    window.addEventListener('resize', () => position_buttons())
    document.addEventListener('scroll', () => position_buttons())
    
    const show_hide = (b, e) => {
        if (b) {
            e.classList.add('scroll-button-visible')
        } else {
            e.classList.remove('scroll-button-visible')
        }
        e.disabled = !b
    }

    let is_programmatic_scroll = false

    let scroll_position = null

    const line_height = (e) => {
        const cs = window.getComputedStyle(e) // computed style
        let h = parseFloat(cs.lineHeight)
        if (isNaN(h)) h = parseFloat(cs.fontSize) * 1.2
        return h
    }

    const scrolled = new CustomEvent('scrolled', {
          detail: { message: 'smooth scroll completed' },
          bubbles: false,
          cancelable: true
    })
    
    let requested_animation_frame = null
    let start = Date.now()

    const force_layout = (e) => { // and cancel smooth scroll
        if (scroll_position !== null) {
            e.scrollTop = scroll_position
            scroll_position = null
            if (requested_animation_frame) {
                cancelAnimationFrame(requested_animation_frame)
            }
            requested_animation_frame = null
        }
        const _ = e.offsetHeight // force layout
    }
    
    const update_buttons = (e) => {
        const lh = line_height(e)
        show_hide(e.scrollTop >= lh, button_top)
        const bottom = e.scrollTop + e.clientHeight
        const end = e.scrollHeight - lh
        console.log("autoscroll: " + scrollable.autoscroll + " bottom: " + bottom + " < end: " + end)
        console.log("bottom < end: " + (bottom < end))
        console.log("(bottom < end && !scrollable.autoscroll): " + (bottom < end && !scrollable.autoscroll))
        show_hide(bottom < end && !scrollable.autoscroll, button_bottom)
        log("update_buttons up: " + (e.scrollTop >= lh) +
                        " down: " + (bottom < end && !scrollable.autoscroll))
    }

    const scroll_to = (e, p) => { // element, position
        log("scroll_to: " + p)
        is_programmatic_scroll = true
        if (p == scroll_position) return
        start = Date.now()
        scroll_position = p
        e.scrollTo({ top: p, behavior: 'smooth' })
        if (requested_animation_frame === null) {
            const check = (time) => {
                log("scroll_to.check p: " + p + " .scrollTop: " + e.scrollTop)
                let done = false
                if (e.scrollTop === scroll_position) {
                    log("scroll_to.check DONE scroll_position: " +
                         scroll_position + " .scrollTop: " + e.scrollTop)
                    done = true
                } else if (Date.now() - start > 1000) {
                    log("scroll_to.check TIMEOUT p: " +
                         scroll_position + " .scrollTop: " + e.scrollTop)
                    done = true
                } else {
                    requested_animation_frame = requestAnimationFrame(check)
                }
                if (done) {
                    is_programmatic_scroll = false
                    force_layout(e)
                    scroll_position = null
                    requested_animation_frame = null
                    requestAnimationFrame(() => update_buttons(e))
                    e.dispatchEvent(scrolled)
                }
            }
            requested_animation_frame = requestAnimationFrame(check)
        }
    }

    const scroll_to_bottom_top_position = (e) =>
        e.scrollHeight - e.clientHeight

    const scroll_to_top = (e) => {
        log("scroll_to_top")
        scroll_to(e, 0)
        scrollable.autoscroll = false
    }

    const scroll_to_bottom = (e) => {
        log("scroll_to_bottom")
        scroll_to(e, scroll_to_bottom_top_position(e))
        if (is_answering()) {
            scrollable.autoscroll = true
            show_hide(false, button_bottom)
        }
    }

    const scroll = (e) => {
        log("scroll() .scrollTop: " + e.scrollTop)
        const lh = line_height(e)
        const bottom = e.scrollTop + e.clientHeight
        const end = e.scrollHeight - lh
        if (is_answering() && bottom >= end && !scrollable.autoscroll) {
console.log("is_answering() && bottom: " + bottom + " >= end: " + end)
            scrollable.autoscroll = true
            show_hide(false, button_bottom)
            show_hide(true,  button_top)
        }
        if (!is_programmatic_scroll && is_answering()) {
            if (scrollable.autoscroll && bottom < end) {
                scrollable.autoscroll = false
            }
        }
        requestAnimationFrame(() => update_buttons(e))
    }

    let later = null
    
    const update_buttons_later = (e) => {
        if (later) clearTimeout(later)
        later = setTimeout(() => {
            later = null
            update_buttons(e)
        }, 100)
    }

    const touch_move = (e) => {
        log("touch_move")
        force_layout(e)
        scrollable.autoscroll = false
        update_buttons_later(e)
    }

    const scroll_end = (e) => {
        log("scroll_end")
        if (later) clearTimeout(later)
        later = setTimeout(() => {
            later = null
            update_buttons(e)
        }, 100)
    }

    list.addEventListener('scroll',    () => scroll(list))
    list.addEventListener('scrolled',  () => scroll_end(list))
    list.addEventListener('touchmove', () => touch_move(list))

    
    const observer = new MutationObserver(function(mutationsList, observer) {
        /*
        let log_mutation = console.log
        log_mutation = () => {}
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                log_mutation('Child list change:', mutation);
                mutation.addedNodes.forEach(node => {
                    log_mutation("Added node:", node)
                })
                mutation.removedNodes.forEach(node => {
                    log_mutation("Removed node:", node)
                })
            } else if (mutation.type === 'characterData') {
                log_mutation("Text content change:", mutation)
            } else if (mutation.type === 'attributes') {
                log_mutation("Attribute change:", mutation)
            }
        }
        */
        if (scrollable.autoscroll) {
            scroll_to(list, scroll_to_bottom_top_position(list))
        } else {
            update_buttons_later(list)
        }
    })
    
    const config = {
        childList:     true,  // Observe direct children
        subtree:       true,  // all descendants
        characterData: true,  // changes to text content
        attributes:    false, // attribute changes
    }

    observer.observe(list, config);
    
    scrollable.autoscroll = false
    scrollable.scroll_to_top    = () => scroll_to_top(list)
    scrollable.scroll_to_bottom = () => scroll_to_bottom(list)
    
    button_top.addEventListener('click',    () => scrollable.scroll_to_top())
    button_bottom.addEventListener('click', () => scrollable.scroll_to_bottom())

    update_buttons(list)

    return scrollable
}

