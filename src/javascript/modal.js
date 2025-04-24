"use strict"

import * as backend from "./backend.js"
import * as detect  from "./detect.js"
import * as marked  from "./marked.js"

const get = id => document.getElementById(id)

export let modality = 0 // modality count

const one_line_gap = "\u00A0\u00A0\n\n"
const two_lines_gap = one_line_gap + one_line_gap

const app_modal = new CustomEvent('app_modal', {
      detail: { message: 'application modal dialog' },
      bubbles: false,
      cancelable: false
})

const select_element = (e) => {
    const range = document.createRange()
    range.selectNodeContents(e)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
}

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
        if (detect.iPad) { b.style.fontSize = "15pt" }
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

const full_page = (pts) => {
    const panel = document.createElement("div")
    panel.style.fontSize = pts
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
        content.contentEditable = "plaintext-only"
        content.readOnly = false
        content.classList.add("error_content")
        content.dataset.markdown = markdown
        select_element(content)
    }
}

const message_box = (centered, markdown, done, actions) => {
    const html = marked.parse(markdown)
    const panel = full_page(detect.iOS ? "11pt" : "10pt")
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

const show_page = (markdown, fs, done, actions) => {
    const html = marked.parse(markdown)
    const panel = full_page(fs)
    panel.style.justifyContent = "top"
    const content = document.createElement("div")
    content.style.overflow = "auto"
    content.style.flex = "1"
    content.style.padding = "0"
    content.style.width  = "100%"
    content.style.height = "100%"
    content.innerHTML = html
    panel.appendChild(content)
    panel.appendChild(buttons(actions, done))
    const modal = get("modal")
    modal.innerHTML = ""
    modal.appendChild(panel)
    modal.style.backgroundColor = "var(--background-color)"
    modal.style.display = "block"
    modal_on()
}

export const show = (markdown, done, ...actions) => {
    show_page(markdown, detect.iPhone ? "0.65rem" : "1rem", done, actions)
}

export const page = (markdown, done, ...actions) => {
    let fs = "1rem";
    if (detect.iPhone) { fs = "0.65rem" }
    if (detect.macOS)  { fs = "0.90rem" }
    show_page(markdown, fs, done, actions)
}

export const toast = (s, to) => {
    if (!s) { return }
    if (!s.includes("<") && !s.includes(">")) s = `<p>${s}</p>`
    const div = document.createElement("div")
    div.style.position        = "fixed"
    div.style.top             = "5rem"
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

export const fatal_error = (message) => {
    const error = `# Fatal Error:${two_lines_gap}`+
                  `** ${message} **${two_lines_gap}` +
                  "Application cannot continue and will close now."
    mbx(error, () => backend.quit(), "Close")
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
        const was = span.innerText.trim()
        span.addEventListener("focus",  () => {
            freeze()
            scroll_into_view_later(span)
        }, { once: true })
        const finish = (value) => {
            delete span.contentEditable
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
        span.contentEditable = "plaintext-only"
        select_element(span)
        span.focus()
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
    const to = "gyptix@gmail.com"
    const s = encodeURIComponent(subject)
    const b = encodeURIComponent(body)
    const link = `mailto:${to}?subject=${s}&body=${b}`
    window.location.href = link
}

const show_error = (error) => {
    console.log("app_error: \n" + error || '')
    const backticks = "\n```\n"
    mbx('# **Error**' + two_lines_gap +
      backticks + error.replaceAll(": ", ":\n") + backticks + one_line_gap +
      'Please copy and email to: ' +
      '<p><a href="mailto:gyptix@gmail.com">gyptix@gmail.com</a></p>' +
      '<p></p>',
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

const sanitize_stack = (stack) => {
    if (!stack) { return "No stack trace available" }
    return stack.replaceAll("@gyptix://./", "@")
}

window.onerror = function(message, source, lineno, colno, error) {
    try {
        const src     = source.replaceAll("gyptix://./", "")
        const stack   = sanitize_stack(error?.stack)
        const details = `Message: ${message}\n` +
                        `Source: ${src}\n` +
                        `Line: ${lineno}:${colno}\n` +
                        `Stack:\n${stack}\n`
        console.log(details)
        localStorage.setItem("app.last_error", details)
        window.dispatchEvent(app_error)
    } catch (_) { // prevents infinite recursion
    }
    return true
}

window.onunhandledrejection = (event) => {
    try {
        const error   = event.reason
        const stack   = sanitize_stack(error?.stack)
        const msg     = error?.message || ''
        const source  = error?.sourceURL || ''
        const src     = source.replaceAll("gyptix://./", "")
        const line    = error?.line   || ''
        const col     = error?.column || ''
        const details = `Promise Rejection:\n` +
                        `Message: ${msg}\n` +
                        `Source: ${src}\n` +
                        `Line: ${line}:${col}\n` +
                        `Stack:\n${stack}\n`
        console.log(details)
        localStorage.setItem("app.last_error", details)
        window.dispatchEvent(app_error)
    } catch (_) { // prevents infinite recursion
    }
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
