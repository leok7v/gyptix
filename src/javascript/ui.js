"use strict" // can be used as
// import * as ui from "./ui.js"

import * as detect from "./detect.js"

const element = (tag, a) => {
    let e = document.createElement(tag) // `e` element
    let c = '' // `c` class
    let o = {} // `o` children
    for (let item of a) {
        if (typeof item === "string") {
            c = item
        } else if (typeof item === "object" && item !== null) {
            Object.assign(o, item)
        }
    }
    if (c) {
        e.className = c.split(",")
            .map(s => s.trim())
            .filter(s => s)
            .join(" ")
    }
    for (let k in o) {
        let child = o[k]
        child.id = k
        e.appendChild(child)
        e[k] = child
    }
    return e
}

export const div = (...a)  => element("div", a)
export const span = (...a) => element("span", a)
export const p = (...a)    => element("p", a)

export const build = (r, t) => { // build(root, tree)
    const flat = {}
    const process = (r, t) => { // process children(element)
        for (let k in t) {
            if (t.hasOwnProperty(k)) {
                if (flat.hasOwnProperty(k)) {
                    throw new Error("duplicate id: " + k)
                }
                let e = t[k]
                flat[k] = e
                e.id = k
                r.appendChild(e)
                process(e, t[k])
            }
        }
    }
    process(r, t)
    return flat
}

export const show = (...elements) => {
    for (const e of elements) {
        let display = e.getAttribute("data-display")
        if (!display) display = "block"
        if (display === "none")
            throw new Error("Invalid display: none")
        e.removeAttribute("data-display")
        e.style.display = display
    }
}

export const hide = (...elements) => {
    try {
        for (const e of elements) {
            const currentDisplay = e.style.display || "block"
            if (currentDisplay !== "none") {
                e.setAttribute("data-display", currentDisplay)
                e.style.display = "none"
            }
        }
    } catch (e) {
        console.log("ui.hide **** ERROR ****")
        console.log(e.stack)
        let i = 0
        for (const e of elements) {
            if (!e) {
                console.log('[' + i + ']=null')
            } else {
                console.log('[' + i + ']=' + e.id)
            }
            i++
        }
    }
}

export const conceal = (...elements) =>
    elements.forEach(e => e.style.visibility = "hidden")

export const reveal = (...elements) =>
    elements.forEach(e => e.style.visibility = "visible")

export const disable = (...elements) =>
    elements.forEach(e => e.disabled = true)

export const enable = (...elements) =>
    elements.forEach(e => e.disabled = false)

export const enable_disable = (b, ...elements) =>
    elements.forEach(e => e.disabled = !b)

export const is_hidden = e => e.style.display === "none"

export const is_concealed = e => e.style.visibility === "hidden"

export const is_disabled = e => e.disabled

export const show_hide = (b, ...elements) =>
    elements.forEach(e => b ? show(e) : hide(e))

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
    if (detect.iPhone) fs = 110
    if (detect.iPad)   fs = 150
    let font_size = localStorage.getItem("settings.font-size") || fs;
    document.body.style.fontSize = font_size + "%";
    localStorage.setItem("settings.font-size", font_size);
}

export const decrease_font_size = () => {
    let font_size = parseInt(localStorage.getItem("settings.font-size")) || 100;
    const min_font = detect.iPad ? 70 : 80
    font_size = Math.max(min_font, font_size - 10);
    document.body.style.fontSize = font_size + "%";
    localStorage.setItem("settings.font-size", font_size);
}

export const increase_font_size = () => {
    let font_size = parseInt(localStorage.getItem("settings.font-size")) || 100;
    const max_font = detect.iPad ? 200 : 170
    font_size = Math.min(max_font, font_size + 10);
    document.body.style.fontSize = font_size + "%";
    localStorage.setItem("settings.font-size", font_size);
}
