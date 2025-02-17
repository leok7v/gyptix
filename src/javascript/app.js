"use strict"

import * as marked from "./marked.js"
import * as model  from "./model.js"

const get = id => document.getElementById(id)

let current  = null // current chat key
let selected = null // selected chat

const render_markdown = md => marked.parse(md)

document.addEventListener("copy", e => {
    e.preventDefault()
    const s = window.getSelection().toString()
    e.clipboardData.setData("text/plain", s)
})

const get_chat = k => {
    const s = localStorage.getItem(k)
    const a = s ? JSON.parse(s) : [];
//  console.log("k:" + k)
//  console.log("s:" + s)
//  console.log("a:" + a)
    return a
}

const save_chat = (k, a) =>
    localStorage.setItem(k, JSON.stringify(a))

// TODO: ChatGPT dark backgrounds (match):
// backgrounds:
// navigation #272829
// messages   #38393a
// input      #3c3c3c
// user       #454646

// Android
// Mozilla/5.0 (linux; android 11; kfquwi build/rs8332.3115n; wv) applewebkit/537.36 (khtml, like gecko) version/4.0 chrome/128.0.6613.187 safari/537.36
// linux armv8l

// macOS Sequoai 15.3 Apple Silicon
// mozilla/5.0 (macintosh; intel mac os x 10_15_7) applewebkit/605.1.15 (khtml, like gecko)
// macintel
    
let ua = "mozilla/5.0 (macintosh; intel mac os x 10_15_7) applewebkit/605.1.15"
let platform = "macintel"
// TODO: iPhone UA and platform by default
let apple = true
let bro = "safari"
let macOS = false

const detect = () => {
    const html = document.documentElement
    ua = navigator.userAgent.toLowerCase()
    platform = navigator.platform ? navigator.platform.toLowerCase() : ""
    apple =
        /iphone|ipad|ipod/.test(ua) ||
        (platform.includes("mac") && navigator.maxTouchPoints > 1) ||
        (ua.includes("macintosh") &&
         ua.includes("applewebkit") &&
        !ua.includes("chrome"))
    bro = apple ? "safari" : "chrome"
    macOS = /mac os x/.test(ua)
//  console.log("User-Agent:", ua)
//  console.log("Platform:", platform)
//  console.log("Browser:", bro)
    html.setAttribute("data-bro", bro)
}

const get_time_label = () => {
    const d = new Date()
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    return `${days[d.getDay()]} ${d.getHours().toString().padStart(2, "0")}:` +
           `${d.getMinutes().toString().padStart(2, "0")}:` +
           `${d.getSeconds().toString().padStart(2, "0")}`
}


detect() // Immediately to apply styles ASAP

const init = () => { // called DOMContentLoaded
    const clear        = get("clear"),
          collapse     = get("collapse"),
          content      = get("content"),
          expand       = get("expand"),
          input        = get("input"),
          layout       = get("layout"),
          list         = get("list"),
          menu         = get("menu"),
          messages     = get("messages"),
          navigation   = get("navigation"),
          remove       = get("remove"),
          rename       = get("rename"),
          restart      = get("restart"),
          scroll       = get("scroll"),
          send         = get("send"),
          send_stop    = get("send_stop"),
          share        = get("share"),
          toggle_theme = get("toggle_theme")
    
    const render_messages = (k) => {
        const arr = get_chat(k)
        messages.innerHTML = ""
        arr.forEach(msg => {
            const d = document.createElement("div")
            d.className = msg.sender === "user"
                ? "user"
                : "bot"
            d.innerHTML = render_markdown(msg.text)
            messages.appendChild(d)
        })
        messages.scrollTop = messages.scrollHeight
        title.textContent = k
    }

    const rebuild_list = () => {
        list.innerHTML = ""
        const count = localStorage.length
        for (let i = count - 1; i >= 0; i--) {
            const key = localStorage.key(i)
            if (!key) continue
            const div = document.createElement("div")
            div.className = "item"
            div.onclick = () => {
                current = key
                render_messages(key)
            }
            const span = document.createElement("span")
            span.textContent = key
            const dots = document.createElement("button")
            dots.className = "button"
            dots.textContent = "⋮"
            dots.onclick = e => {
                e.stopPropagation()
                selected = key
                show_menu(e.pageX, e.pageY)
            }
            div.appendChild(span)
            div.appendChild(dots)
            list.appendChild(div)
        }
    }

    const start = () => {
        let k = get_time_label()
        while (localStorage.getItem(k)) {
            k = get_time_label()
        }
        localStorage.setItem(k, "[]")
        current = k
        const arr = [{
            sender: "bot",
            text: "What would you like to discuss today?<br>" +
                  "<sup>Full sentences help me respond better.<sup>"
        }]
        save_chat(k, arr)
        rebuild_list()
        render_messages(k)
    }

    const toast = (message) => {
        console.log("TODO: toast(" + message + ")")
    }
    
    const placeholder = () => {
        if (model.is_answering()) {
            input.style.setProperty("--placeholder",
                                    '"click (⏹) to interrupt"');
        } else if (!macOS) { // double quotes improtant for css variable:
            input.style.setProperty("--placeholder",
                                    '"Ask anything... and click (⇧)"');
        } else {
            input.style.setProperty("--placeholder",
                                    '"Ask anything... Use ⇧⏎ for new line"');
        }
    }
    
    const polling = () => {
        send_stop.innerText = "⏹"
        const pollInterval = setInterval(() => {
            const polledText = model.poll()
            if (polledText === "<-done->") {
                clearInterval(pollInterval)
                send_stop.innerText = "⇧"
                placeholder()
                return
            }
            if (polledText !== "") {
                const chats = get_chat(current)
                chats[chats.length - 1].text += polledText
                save_chat(current, chats)
                requestAnimationFrame(() => render_messages(current))
            }
        }, 100)
    }

    const ask = t => {
        if (!current || !t) return
        const arr = get_chat(current)
        arr.push({ sender: "user", text: t })
        arr.push({ sender: "bot", text: "" })
        save_chat(current, arr)
        render_messages(current)
        let error = model.ask(t)
        if (error == null) {
            placeholder()
            polling()
        } else {
            toast(error)
        }
    }

    const show_menu = (x, y) => {
        menu.style.left = `${x}px`
        menu.style.top = `${y}px`
        menu.style.display = "block"
    }

    const hide_menu = () => {
        menu.style.display = "none"
    }
    
    window.addEventListener("resize", () => {
        const px = window.innerHeight * 0.01;
        console.log("resize(--vh: " + px + "px)")
        document.documentElement.style.setProperty("--vh", px + "px")
    })

    toggle_theme.onclick = () => {
        const html = document.documentElement
        const current = html.getAttribute("data-theme")
        html.setAttribute("data-theme", current === "dark"
            ? "light" : "dark")
    }

    send.onclick = e => {
        e.preventDefault()
        const s = input.innerText.trim()
        console.log("send.onclick")
        if (model.is_answering()) {
            console.log("<-interrupt->")
            model.poll("<-interrupt->")
            placeholder()
        } else if (s !== "") {
            console.log("<-interrupt->")
            ask(s)
            input.innerText = ""
            requestAnimationFrame(() => input.blur())
        }
    }

    restart.onclick = () => start()
    
    clear.onclick = () => {
        localStorage.clear()
        current = null
        start()
    }

    const collapsed = () => {
        navigation.classList.add("collapsed")
        layout.classList.add("is_collapsed")
        hide_menu()
    }

    const expanded = () => {
        navigation.classList.remove("collapsed")
        layout.classList.remove("is_collapsed")
    }

    collapse.onclick = () => collapsed()
    expand.onclick = () => expanded()

    scroll.onclick = () => {
        messages.scrollTop = messages.scrollHeight
    }

    input.onkeydown = e => {
        // for iOS enable ignore enter
        let s = input.innerText.trim()
        if (macOS && s !== "" && e.key === "Enter" && !e.shiftKey) {
            input.innerText = ""
            requestAnimationFrame(() => {
                const sel = window.getSelection()
                if (sel) sel.removeAllRanges()
                ask(s)
            })
        }
    }

    const observer = new MutationObserver(() => {
        scroll.style.display = "none"
    })
    
    observer.observe(input, { childList: true, subtree: true,
                              characterData: true });
    
    input.onblur = () => { // focus lost
        show_hide_scroll_to_bottom()
        document.body.style.overflow = ""
    }
    
    input.onfocus = () => {
        scroll.style.display = "none"
        document.body.style.overflow = "hidden"
        collapsed()
    }

    input.oninput = () => {
        const lines = input.innerText.split("\n").length
        input.style.maxHeight = lines > 1
            ? window.innerHeight * 0.5 + "px" : ""
    }

    content.onclick = e => {
        if (e.target.closest("#chat-container") ||
            e.target.closest("#input")) collapsed()
        if (!e.target.closest("#menu")) hide_menu()
    }

    const show_hide_scroll_to_bottom = () => {
        const d = messages.scrollHeight - messages.scrollTop
        scroll.style.display = d > messages.clientHeight + 10 &&
        !model.is_answering()
            ? "block" : "none"
    }

    messages.onscroll = () => show_hide_scroll_to_bottom()
    
    remove.onclick = () => {
        if (!selected) return
        localStorage.removeItem(selected)
        if (current === selected)
            current = null
        rebuild_list()
        if (!localStorage.length) {
            start()
        } else if (!current) {
            const k = localStorage.key(0)
            current = k
            render_messages(k)
        }
        hide_menu()
    }

    rename.onclick = () => {
        if (!selected) return
        const name = prompt("Enter new name", selected)
        if (name && name !== selected) {
            const data = get_chat(selected)
            localStorage.removeItem(selected)
            localStorage.setItem(name, JSON.stringify(data))
            if (current === selected)
                current = name
            rebuild_list()
            render_messages(current)
        }
        hide_menu()
    }

    share.onclick = () => {
        if (!selected) return
        const data = get_chat(selected)
        prompt("Copy chat data:", JSON.stringify(data))
        hide_menu()
    }
    
    localStorage.clear() // DEBUG
    detect()
    if (!macOS) { // double quotes improtant for css variable:
        input.style.setProperty("--placeholder",
                                '"Ask anything... and click [⇧]"');
    }
    marked.use({pedantic: false, gfm: true, breaks: false})
    rebuild_list()
    if (!localStorage.length) {
        start()
    } else {
        current = localStorage.key(0)
        render_messages(current)
    }
}

export { init }
