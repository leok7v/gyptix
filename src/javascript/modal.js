"use strict"

import * as detect      from "./detect.js"
import * as marked from "./marked.js"

const get = id => document.getElementById(id)

// show = (markdown, done, ...) => {
// TODO show html inside absolute 100%x100 #modal div:
// initial: app.css #modal { display: none
//  #modal {
//    display: none
//    color: var(--color)
//    background-color: var(--background-color)
//  }
// add styles dynamically here as needed.
// Modal z-index on top, draws buttons from ... list
// which are HTML strings like "OK" "Cancel" "Agree" "<red>Delete</red>"
// and calls done(plainText of a button) on click
// Modal is semitransparent and makes under the modal dialog view blurry
// like App switching on iOS

export const show = (markdown, done, ...actions) => {
    const html = marked.parse(markdown)
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
    panel.style.justifyContent = "top"
    const content = document.createElement("div")
    content.style.overflow = "auto"
    content.style.flex = "1"
    content.style.padding = "0"
    content.style.width  = "100%"
    content.style.height = "100%"
    content.innerHTML = marked.parse(markdown)
    const buttons = document.createElement("div")
    buttons.style.display = "flex"
    buttons.style.justifyContent = "center"
    buttons.style.gap = "1em"
    buttons.style.marginTop = "1em"
    const button_color = (action) => {
        if (action.includes("<red>")) return { color: "red",
            text: action.replace("<red>", "").replace("</red>", "") }
        if (action.includes("<green>")) return { color: "green",
            text: action.replace("<green>", "").replace("</green>", "") }
        return { color: "#888", text: action }
    }
    actions.forEach(action => {
        const { color, text } = button_color(action)
        const btn = document.createElement("button")
        btn.style.padding = "1em 2em"
        btn.style.border = "none"
        btn.style.borderRadius = "0.5em"
        btn.style.cursor = "pointer"
        btn.style.color = "white"
        btn.style.fontWeight = "bold"
        btn.style.fontSize = detect.iPhone ? "10pt" : "12pt"
        btn.style.backgroundColor = "#888"
        btn.style.backgroundColor = color
        btn.innerText = text
        btn.addEventListener("click", () => {
            modal.style.display = "none"
            if (done) done(btn.innerText.trim())
        })
        buttons.appendChild(btn)
    })
    panel.appendChild(content)
    panel.appendChild(buttons)
    const modal = get("modal")
    modal.innerHTML = ""
    modal.appendChild(panel)
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
