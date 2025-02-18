"use strict"

import * as marked from "./marked.js"
import * as model  from "./model.js"
import * as util   from "./util.js"

const get = id => document.getElementById(id)

let at_the_bottom = true
let current  = null // current chat key
let selected = null // selected chat
let chat     = null // chat
let selected_item = null // item in chats list

const render_markdown = md => marked.parse(md)

document.addEventListener("copy", e => {
    e.preventDefault()
    const s = window.getSelection().toString()
    e.clipboardData.setData("text/plain", s)
})

const load_chat = id => {
    const header = localStorage.getItem("chat.id." + id)
    const content = localStorage.getItem("chat." + id)
    const h = JSON.parse(header)
    const m = JSON.parse(content) // [] messages
    const c  = { title: h.title, timestamp: h.timestamp, messages: m }
//  console.log("k:" + k)
//  console.log("s:" + s)
//  console.log("c:" + c)
    return c
}

const save_chat = (id, c) => {
    const header  = { title: c.title, timestamp: c.timestamp }
    try {
        localStorage.setItem("chat.id." + id, JSON.stringify(header))
        localStorage.setItem("chat." + id, JSON.stringify(c.messages))
    } catch (error) {
        console.log(error)
        localStorage.removeItem("chat.id." + id)
        localStorage.removeItem("chat." + id)
    }
}

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
let macOS  = false
let iPhone = false
let iPad   = false

const detect = () => {
    const html = document.documentElement
    ua = navigator.userAgent.toLowerCase()
    platform = navigator.platform ? navigator.platform.toLowerCase() : ""
    apple =
        /iphone|ipad|macintosh/.test(ua) ||
        (platform.includes("mac") && navigator.maxTouchPoints > 1) ||
        (ua.includes("macintosh") &&
         ua.includes("applewebkit") &&
        !ua.includes("chrome"))
    bro = apple ? "safari" : "chrome"
    macOS  = /\(macintosh;/.test(ua)
    iPhone = /\(iphone;/.test(ua)
    iPad   = /\(ipad;/.test(ua)
//  console.log("User-Agent:", ua)
//  console.log("Platform:", platform)
//  console.log("Browser:", bro)
    html.setAttribute("data-bro", bro)
    if (macOS)  html.setAttribute("data-macOS",  "true")
    if (iPhone) html.setAttribute("data-iPhone", "true")
    if (iPad)   html.setAttribute("data-iPad",   "true")
}

const timestamp = () => Date.now() // UTC timestamp in milliseconds

const timestamp_label = (timestamp) => {
    const d = new Date(timestamp)
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
          title        = get("title"),
          toggle_theme = get("toggle_theme")
    
    const render_message = msg => {
        const d = document.createElement("div")
        d.className = msg.sender === "user" ? "user" : "bot"
        // For non-bot messages, double the newlines.
        let text = msg.sender === "bot" ? msg.text : msg.text.replace(/\n/g, "\n\n")
        d.innerHTML = render_markdown(text)
        return d
    }

    const render_messages = () => {
        if (!chat || !chat.messages) return
        const sh = messages.scrollHeight
        const ch = messages.clientHeight
        const top = messages.scrollTop
        at_the_bottom = sh - ch <= top + 5
        console.log("at_the_bottom := " + at_the_bottom)
        messages.innerHTML = ""
        chat.messages.forEach(msg => {
            messages.appendChild(render_message(msg))
        })
        if (at_the_bottom) messages.scrollTop = messages.scrollHeight
        title.textContent = chat.title
    }

    const render_last = () => {
        if (!chat || !chat.messages || chat.messages.length === 0) return
        const last_index = chat.messages.length - 1
        const last_msg = chat.messages[last_index]
        // Get last child element (assumed to be the last message).
        const last_child = messages.lastElementChild
        if (last_child) {
            let text = last_msg.sender === "bot" ?
                last_msg.text : last_msg.text.replace(/\n/g, "\n\n")
            last_child.innerHTML = render_markdown(text)
        } else {
            messages.appendChild(render_message(last_msg))
        }
        if (at_the_bottom) messages.scrollTop = messages.scrollHeight
    }

    messages.onscroll = () => {
        input.blur()
        const sh = messages.scrollHeight
        const ch = messages.clientHeight
        const top = messages.scrollTop
        at_the_bottom = (sh - ch <= top + 5)
        requestAnimationFrame(() => {
            show_hide_scroll_to_bottom()
        })
    }
    
    const key2id = (key) => parseInt(key.substring("chat.id.".length))
    
    const rebuild_list = () => {
        if (!list) return
        list.innerHTML = ""
        const chats = []
        const count = localStorage.length
        for (let i = 0; i < count; i++) {
            const key = localStorage.key(i)
            if (!key || !key.startsWith("chat.id.")) continue
            const id = key2id(key)
            const c = load_chat(id)
            if (c.timestamp) {
                chats.push({ id: id, timestamp: c.timestamp, title: c.title })
            }
        }
        chats.sort((a, b) => b.timestamp - a.timestamp)
        chats.forEach(c => {
            const div = document.createElement("div")
            div.className = "item"
            div.onclick = () => {
//              console.log("onclick: " + c.id)
                selected = null
                current = c.id
                chat = load_chat(current)
                render_messages()
                hide_menu()
                collapsed()
            }
            const span = document.createElement("span")
            span.textContent = c.title
            const dots = document.createElement("button")
            dots.className = "button"
            dots.textContent = "⋯"
            dots.onclick = e => {
                e.stopPropagation()
                selected = c.id
                selected_item = span
                show_menu(e.pageX, e.pageY)
            }
            div.appendChild(span)
            div.appendChild(dots)
            list.appendChild(div)
        })
    }

    const start = () => {
        let id = timestamp()
        let k = "chat.id." + id
        while (localStorage.getItem(k)) {
            id = timestamp()
            k = "chat.id." + id
        }
        current = id
        chat = {
            title: timestamp_label(id),
            timestamp: id,
            messages: [{
                sender: "bot",
                text: "What would you like to discuss today?<br>" +
                      "<sup>Using full sentences helps me respond better.<sup>"
            }]
        }
        save_chat(id, chat)
        rebuild_list()
        render_messages()
    }
    
    const recent = () => { // most recent chat -> current
        const keys = Object.keys(localStorage).filter(k =>
            k.startsWith("chat.id.")
        )
        const valid_chats = keys.map(key => {
            const h = load_chat(key2id(key))
            return h && h.timestamp
                ? { id: key2id(key),
                    timestamp: h.timestamp,
                    title: h.title }
                : null
        }).filter(chat => chat !== null)
        if (valid_chats.length > 0) {
            valid_chats.sort((a, b) => b.timestamp - a.timestamp)
            const most_recent = valid_chats[0]
            current = most_recent.id
            chat = load_chat(most_recent.id)
            console.log("recent id: " + most_recent.id)
            render_messages()
            rebuild_list()
        } else {
            start()
        }
    }
    
    const placeholder = () => {
        // double quotes improtant for css variable inside value
        if (model.is_answering()) {
            input.style.setProperty("--placeholder",
                                    '"click ⏹ to stop"');
        } else if (!macOS) { // double quotes improtant for css variable:
            input.style.setProperty("--placeholder",
                                    '"Ask anything... and click (⇧)"');
        } else {
            input.style.setProperty("--placeholder",
                                    '"Ask anything... Use ⇧⏎ for line break"');
        }
    }
    
    const poll = (interval) => {
        const polledText = model.poll()
        if (polledText === "<--done-->") {
            clearInterval(interval)
            send_stop.innerText = "⇧"
            chat.timestamp = timestamp()
            save_chat(current, chat)
            placeholder()
            return
        }
        if (polledText !== "") {
            if (chat.messages.length > 0) {
                chat.messages[chat.messages.length - 1].text += polledText
                requestAnimationFrame(() => {
                    render_last()
                    show_hide_scroll_to_bottom()
                })
            }
        }
    }

    const polling = () => {
        send_stop.innerText = "⏹"
        const interval = setInterval(() => {
            requestAnimationFrame(() => poll(interval))
        }, 10)
    }

    const ask = t => {
        if (!current || !t) return
        if (!chat.messages) chat.messages = []
        chat.messages.push({ sender: "user", text: t })
        chat.messages.push({ sender: "bot",  text: "" })
        save_chat(current, chat)
        render_messages()
        messages.scrollTop = messages.scrollHeight
        at_the_bottom = true
//      console.log("at_the_bottom := " + at_the_bottom)
        let error = model.ask(t)
        if (!error) {
            placeholder()
            polling()
        } else {
            util.toast(error)
        }
    }

    function show_menu(x, y) {
        menu.style.display = "block"
        menu.offsetWidth
        const menu_rect = menu.getBoundingClientRect()
        const window_height = window.innerHeight
        const window_width  = window.innerWidth
        let new_y = y
        if (y + menu_rect.height > window_height) {
            new_y = y - menu_rect.height
            if (new_y < 0) new_y = 0
        }
        y = new_y
        menu.style.left = x + "px"
        menu.style.top  = y + "px"
    }

    const hide_menu = () => {
        menu.style.display = "none"
    }
    
    window.addEventListener("resize", () => {
        const px = window.innerHeight * 0.01;
//      console.log("resize(--vh: " + px + "px)")
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
//      console.log("send.onclick")
        if (model.is_answering()) {
//          console.log("<--interrupt-->")
            model.poll("<--interrupt-->")
            placeholder()
        } else if (s !== "") {
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
        console.log("macOS: " + macOS + " e.key: " + e.key)
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
        (!model.is_answering() || !at_the_bottom)
            ? "block" : "none"
    }
    
    remove.onclick = () => {
        if (!selected) return
        localStorage.removeItem("chat.id." + selected)
        localStorage.removeItem("chat." + selected)
        if (current === selected) {
            current = null
            recent()
        }
        selected = null
        hide_menu()
        rebuild_list()
        render_messages()
    }

    rename.onclick = () => {
        if (!selected) return
        hide_menu()
//      console.log("selected: " + selected)
//      console.log("current: " + current)
//      console.log("selected === current " + (selected === current))
        const c = selected === current ? chat : load_chat(selected)
        util.rename_in_place(selected_item, c.title).then(new_name => {
            if (new_name && new_name !== c.title) {
                c.title = new_name
                save_chat(selected, c)
                if (selected === current) {
                    chat = c
                    title.textContent = c.title
//                  console.log("title.textContent " + title.textContent)
                }
                rebuild_list()
                render_messages()
            }
        })
    }
    
    share.onclick = () => {
        if (!selected) return
        const c = load_chat(selected)
        prompt("Copy chat data:", JSON.stringify(c))
        hide_menu()
    }
    
//  localStorage.clear() // DEBUG

    marked.use({pedantic: false, gfm: true, breaks: false})
    detect()
    placeholder()
    recent()
//  util.toast("Testing Toast")
    util.toast(ua)
}

export { init }
