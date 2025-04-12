"use strict"

import * as detect from "./detect.js"
import * as marked from "./marked.js"

const get = id => document.getElementById(id)

export let modality = 0 // modality count

const app_modal = new CustomEvent('app_modal', {
      detail: { message: 'application modal dialog' },
      bubbles: false,
      cancelable: false
})

export const modal_on = () => {
    modality++
    window.dispatchEvent(app_modal)
}

export const modal_off = () => {
    modality--
    window.dispatchEvent(app_modal)
}

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
    buttons.style.gap = "1rem"
    actions.forEach(a => {
        const { color, text } = button_color(a)
        const b = document.createElement("button")
        b.style.padding = "0.75em 2rem"
        b.style.border = "none"
        b.style.borderRadius = "0.5rem"
        b.style.cursor = "pointer"
        b.style.color = "white"
        b.style.fontWeight = "bold"
        b.style.backgroundColor = color
        if (detect.iPad) b.style.fontSize = "15pt"
        b.innerText = text
        b.addEventListener("click", () => {
            get("modal").style.display = "none"
            modal_off()
            if (done) done(b.innerText.trim())
        })
        buttons.appendChild(b)
    })
    return buttons
}

const page = (pts) => {
    const panel = document.createElement("div")
    panel.style.fontSize  = pts
    panel.style.border    = "none"
    panel.style.minWidth  = "100%"
    panel.style.minHeight = "100%"
    panel.style.maxWidth  = "100%"
    panel.style.maxHeight = "100%"
    panel.style.display   = "flex"
    panel.style.flexDirection = "column"
    panel.classList.add("modal_page")
    return panel
}

const error_box = (content, markdown, html) => {
    if (markdown.includes("# **Error**")) {
        content.style.userSelect       = "text"
        content.style.webkitUserSelect = "text"
        content.contentEditable = true
        content.readOnly = false
        content.classList.add("error_content")
        content.dataset.markdown = markdown
        const range = document.createRange()
        range.selectNodeContents(content)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
    }
}

const message_box = (centered, markdown, done, actions) => {
    const html = marked.parse(markdown)
    const panel = page(detect.iOS ? "11pt" : "10pt")
    panel.style.justifyContent = "center"
    panel.style.alignItems = "center"
    const mbx = document.createElement("div") // message box
    mbx.style.display = "flex"
    mbx.style.flexDirection = "column"
    mbx.style.justifyContent = "center"
    mbx.style.alignItems = "center"
    mbx.style.backgroundColor = "var(--background-message-box)"
    mbx.style.maxWidth = "40rem"
    mbx.style.border = "1px solid #888"
    mbx.style.borderRadius = "0.5rem"
    const content = document.createElement("div")
    content.style.overflowY = "auto"
    content.style.padding = "1rem"
    content.style.width = "100%"
    content.style.textAlign = centered ? "center" : "left"
    if (centered) content.style.justifyContent = "center"
    content.innerHTML = html
    mbx.appendChild(content)
    const b = buttons(actions, done)
    b.style.padding = "1rem"
    mbx.appendChild(b)
    panel.appendChild(mbx)
    const modal = get("modal")
    modal.style.backgroundColor = 
        "color-mix(in srgb, var(--background-color), transparent 10%)"
    modal.innerHTML = ""
    modal.appendChild(panel)
    modal.style.display = "block"
    error_box(content, markdown, html)
    modal_on()
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
// 100%x100% panel
// draws buttons from ...actions list
// which are HTML-like strings like
// "OK" "Cancel" "<green>Agree</green>" "<red>Delete</red>"
// and calls done(plainText of a button) on click

export const show = (markdown, done, ...actions) => {
    const html = marked.parse(markdown)
    const panel = page(detect.iPhone ? "0.85rem" : "1rem")
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
    modal_on()
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
    modal_on()
    setTimeout(() => {
        document.body.removeChild(div)
        modal_off()
    }, to)
}

const scroll_into_view_later = (span) => {
    window.visualViewport.addEventListener('resize',() => {
        setTimeout(() => {
            span.scrollIntoView({ behavior: "smooth", block: "center" })
        }, 333)
    }, { once: true })
}

export const rename_in_place = (span, freeze, unfreeze) => {
    return new Promise(resolve => {
        span.contentEditable = "true"
        const was = span.innerText.trim()
        span.addEventListener("focus",  () => {
            freeze()
            scroll_into_view_later(span)
        }, { once: true })
        span.focus()
        const range = document.createRange()
        range.selectNodeContents(span)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        const finish = (value) => {
            span.contentEditable = "false"
            resolve(value)
            unfreeze()
        }
        span.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault()
                const new_text = span.innerText.trim() || was
                finish(new_text)
            } else if (e.key === "Escape") {
                e.preventDefault()
                span.innerText = was
                finish(null)
            }
        })
        span.addEventListener("blur", () => {
            const new_text = span.innerText.trim()
            if (new_text && new_text !== was) {
                finish(new_text)
            } else {
                span.innerText = was
                finish(null)
            }
        }, { once: true })
    })
}

const copy_to_pasteboard = (text) => {
    navigator.clipboard.writeText(text)
    .then(() => {
        console.log("Copied to pasteboard.")
    }).catch(error => {
        console.log("Failed to copy to pasteboard: ", error)
        try {
            const success = document.execCommand("copy")
            console.log("Fallback copy " + (success ? "done" : "failed"))
        } catch (error) {
            console.log("Fallback copy failed: " + error)
        }
    })
}

const mailto = (email, subject, body) => {
    console.log("mailto")
    const to = "example@email.com"
    const s = encodeURIComponent(subject)
    const b = encodeURIComponent(body)
    const link = `mailto:${to}?subject=${s}&body=${b}`
    window.location.href = link
}

const show_error = (error) => {
    console.log("app_error: \n" + error || '')
    mbx('# **Error**\n\n' +
      '```\n' + error + '\n```\n' +
      'Please copy and email to: ' +
      '<a href="mailto:gyptix@gmail.com">gyptix@gmail.com</a>',
    (action) => {
        copy_to_pasteboard(error)
        if (action === "Copy") {
            mailto("gyptix@gmail.com", "Feedback", error)
        }
        localStorage.removeItem("app.last_error")
    },
    "Copy", "Ignore")
}

const app_error = new CustomEvent('app_error', {
      detail: { message: 'application error' },
      bubbles: false,
      cancelable: false
})

window.onerror = function(message, source, lineno, colno, error) {
    const stack   = error?.stack || "No stack trace available"
    const details = `Unhandled Exception:\n` +
                    `Message: ${message}\n` +
                    `Source: ${source}\n` +
                    `Line: ${lineno}, Column: ${colno}\n` +
                    `Stack:\n${stack}\n`
    console.log(details)
    localStorage.setItem("app.last_error", details)
    window.dispatchEvent(app_error)
    return true
}

window.onunhandledrejection = (event) => {
    const reason = event.reason // The Error object
    const stack  = reason?.stack || "No stack trace available"
    const details = `Promise Rejection:\n` +
                    `Reason: ${reason.message}\n` +
                    `Stack:\n${stack}\n`
    console.log(details)
    localStorage.setItem("app.last_error", details)
    window.dispatchEvent(app_error)
}

window.addEventListener('app_error', () => {
    const last_error = localStorage.getItem("app.last_error")
    console.log("app_error: \n" + last_error || '')
    show_error(last_error)
})

// show error from previous run if not cleared
const last_error = localStorage.getItem("app.last_error")

if (last_error) {
    setTimeout(() => { show_error(last_error) }, 1000)
}
