"use strict" // can be used as
// import * as ui from "./ui.js"

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
    for (const e of elements) {
        const currentDisplay = e.style.display || "block"
        if (currentDisplay !== "none") {
            e.setAttribute("data-display", currentDisplay)
            e.style.display = "none"
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

export const is_hidden = e => e.style.display === "none"

export const is_concealed = e => e.style.visibility === "hidden"

export const is_disabled = e => e.disabled

export const show_hide = (b, ...elements) =>
    elements.forEach(e => b ? show(e) : hide(e))
