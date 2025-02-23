"use strict"

import * as detect from "./detect.js"
import * as marked from "./marked.js"

const get = id => document.getElementById(id)

const button_color = (action) => {
    const colors = ["red", "green", "blue"]
    for (const color of colors) {
        const open  = `<${color}>`
        const close = `</${color}>`
        if (action.includes(open)) {
            action = action.replace(open, "").replace(close, "");
            return { color: color, text: action }
        }
    }
    return { color: "#888", text: action }
}

const buttons = (actions, done) => {
    const buttons = document.createElement("div")
    buttons.style.display = "flex"
    buttons.style.justifyContent = "center"
    buttons.style.gap = "1em"
    actions.forEach(a => {
        const { color, text } = button_color(a)
        const b = document.createElement("button")
        b.style.padding = "0.5em 2em"
        b.style.border = "none"
        b.style.borderRadius = "0.5em"
        b.style.cursor = "pointer"
        b.style.color = "white"
        b.style.fontWeight = "bold"
        b.style.backgroundColor = color
        b.innerText = text
        b.addEventListener("click", () => {
            get("modal").style.display = "none"
            if (done) done(b.innerText.trim())
        })
        buttons.appendChild(b)
    })
    return buttons
}

const page = () => {
    const panel = document.createElement("div")
    panel.style.fontSize = detect.iPhone ? "8pt" : "10pt"
    panel.style.padding = "0"
    panel.style.border = "none"
    panel.style.minWidth  = "100%"
    panel.style.minHeight = "100%"
    panel.style.maxWidth  = "100%"
    panel.style.maxHeight = "100%"
    panel.style.display = "flex"
    panel.style.flexDirection = "column"
    return panel
}

const message_box = (centered, markdown, done, actions) => {
    const html = marked.parse(markdown)
    const panel = page()
    panel.style.justifyContent = "center"
    panel.style.alignItems = "center"
    const mbx = document.createElement("div") // message box
    mbx.style.display = "flex"
    mbx.style.flexDirection = "column"
    mbx.style.justifyContent = "center"
    mbx.style.alignItems = "center"
    mbx.style.backgroundColor = "var(--background-message-box)"
    mbx.style.maxWidth = "40em"
    mbx.style.border = "1px solid #888"
    mbx.style.borderRadius = "0.5em"
    const content = document.createElement("div")
    content.style.overflowY = "auto"
    content.style.padding = "1em"
    content.style.width = "100%"
    content.style.textAlign = centered ? "center" : "left"
    if (centered) content.style.justifyContent = "center"
    content.innerHTML = html
    mbx.appendChild(content)
    const b = buttons(actions, done)
    b.style.padding = "1em"
    mbx.appendChild(b)
    panel.appendChild(mbx)
    const modal = get("modal")
    modal.style.backgroundColor = "color-mix(in srgb, var(--background-color), transparent 10%)"
    modal.innerHTML = ""
    modal.appendChild(panel)
    modal.style.display = "block"
}


// ask|mbx = (markdown, done, ...) =>
// message boxes:
// ask() horizontally centered content
// mbx() left justified

export const ask = (markdown, done, ...actions) =>
    message_box(true, markdown, done, actions)

export const mbx = (markdown, done, ...actions) =>
    message_box(false, markdown, done, actions)

// show|ask|mbx = (markdown, done, ...) =>
// show shcrollable html of markdown inside absolute
// 100%x100 panel
// draws buttons from ...actions list
// which are HTML-like strings like
// "OK" "Cancel" "<green>Agree</green>" "<red>Delete</red>"
// and calls done(plainText of a button) on click

export const show = (markdown, done, ...actions) => {
    const html = marked.parse(markdown)
    const panel = page()
    panel.style.justifyContent = "top"
    const content = document.createElement("div")
    content.style.overflow = "auto"
    content.style.flex = "1"
    content.style.padding = "0"
    content.style.width  = "100%"
    content.style.height = "100%"
    content.innerHTML = marked.parse(markdown)
    panel.appendChild(content)
    panel.appendChild(buttons(actions, done))
    const modal = get("modal")
    modal.innerHTML = ""
    modal.appendChild(panel)
    modal.style.backgroundColor = "var(--background-color)"
    modal.style.display = "block"
}

export const toast = (s, to) => {
    if (!s.includes("<") && !s.includes(">")) s = `<p>${s}</p>`
    const div = document.createElement("div")
    div.style.position        = "fixed"
    div.style.top             = "10px"
    div.style.left            = "50%"
    div.style.transform       = "translateX(-50%)"
    div.style.color           = "white"
    div.style.padding         = "10px 20px"
    div.style.zIndex          = "10000"
    div.style.border          = "2px solid #888"
    div.style.borderRadius    = "5%"
    div.style.backgroundColor = "rgba(200, 0, 0, 0.8)"
    div.style.textAlign       = "center";
    div.style.display         = "inline-block";
    div.style.maxWidth        = "80%";
    div.innerHTML = s
    document.body.appendChild(div)
    setTimeout(() => document.body.removeChild(div), to)
}

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
