"use strict"

import * as marked      from "./marked.js"
import * as model       from "./model.js"
import * as util        from "./util.js"
import * as prompts     from "./prompts.js"
import * as suggestions from "./suggestions.js"

const get = id => document.getElementById(id)

let at_the_bottom = true
let user_scrolling = false
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
    const c  = { id: h.id, title: h.title, timestamp: h.timestamp, messages: m }
    return c
}

const save_chat = (id, c) => {
    const header  = { title: c.title, timestamp: c.timestamp }
    try {
        localStorage.setItem("chat.id." + id, JSON.stringify(header))
        localStorage.setItem("chat." + id, JSON.stringify(c.messages))
    } catch (error) {
        console.log(error)
        util.toast(error, 5000)
        localStorage.removeItem("chat.id." + id)
        localStorage.removeItem("chat." + id)
        localStorage.clear() // brutal but effective
    }
}
    
let ua = "mozilla/5.0 (macintosh; intel mac os x 10_15_7) applewebkit/605.1.15"
let platform = "macintel"
let apple = true
let bro = "safari"
let macOS  = false
let iPhone = false
let iPad   = false
let iOS    = false

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
    if (macOS && navigator.maxTouchPoints && navigator.maxTouchPoints === 5) {
        // Incorrect UserAgent in iPad OS WebKit
        macOS = false
        iPad = true
    }
    iOS = iPad || iPhone
    html.setAttribute("data-bro", bro)
    if (macOS)  html.setAttribute("data-macOS",  "true")
    if (iPhone) html.setAttribute("data-iPhone", "true")
    if (iPad)   html.setAttribute("data-iPad",   "true")
    if (iOS)    html.setAttribute("data-iOS",    "true")
}

detect() // Immediately to load script

const init = () => { // called DOMContentLoaded
    const
        clear        = get("clear"),
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
        suggest      = get("suggest"),
        title        = get("title"),
        toggle_theme = get("toggle_theme")

    const hide_scroll_to_bottom = () => {
        scroll.style.display = "none"
    }
    
    const show_hide_scroll_to_bottom = () => {
        const d = messages.scrollHeight - messages.scrollTop
        scroll.style.display = d > messages.clientHeight + 10 &&
        (!model.is_answering() || !at_the_bottom)
        ? "block" : "none"
    }
    
    const scroll_to_bottom = () => {
        messages.scrollTop = messages.scrollHeight
        at_the_bottom = true
        setTimeout(() => { scroll.style.display = "none" }, 50)
    }
    
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
        messages.innerHTML = ""
        chat.messages.forEach(msg => {
            messages.appendChild(render_message(msg))
        })
        if (at_the_bottom) scroll_to_bottom()
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
        if (at_the_bottom) scroll_to_bottom()
    }
    
    messages.onscroll = () => {
        if (user_scrolling) {
            input.blur()
            collapsed()
            const sh = messages.scrollHeight
            const ch = messages.clientHeight
            const top = messages.scrollTop
            at_the_bottom = (sh - ch <= top + 5)
            requestAnimationFrame(() => {
                show_hide_scroll_to_bottom()
            })
        }
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
            if (c.id === current) div.classList.add("selected")
            div.onclick = () => {
                selected = null
                current = c.id
                model.run(c.id)
                chat = load_chat(current)
                rebuild_list()
                render_messages()
                hide_menu()
                hide_scroll_to_bottom()
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
    
    const new_session = () => {
        let id = util.timestamp()
        let k = "chat.id." + id
        while (localStorage.getItem(k)) {
            id = util.timestamp()
            k = "chat.id." + id
        }
        current = id
        chat = {
            id: id,
            timestamp: id,
            title: util.timestamp_label(id),
            messages: []
        }
        input.innerText = ""
        save_chat(id, chat)
        collapsed()
        rebuild_list()
        render_messages()
        suggestions.show()
        suggestions.start()
        model.run(id)
    }
    
    const recent = () => { // most recent chat -> current
        const keys = Object.keys(localStorage).filter(k => k.startsWith("chat.id."))
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
            model.run(most_recent.id)
            render_messages()
            rebuild_list()
        } else {
            new_session()
        }
    }
    
    const placeholder = () => {
        // double quotes improtant for css variable inside value
        if (model.is_answering()) {
            input.style.setProperty("--placeholder",
                                    '"click ▣ to stop"');
            send.title = "Click to Stop"
        } else if (!macOS) { // double quotes improtant for css variable:
            input.style.setProperty("--placeholder",
                                    '"Ask anything... and click ⇧ to send"');
        } else {
            input.style.setProperty("--placeholder",
                                    '"Ask anything... Use ⇧⏎ for line break"');
        }
    }
    
    const summarize_to_title = () => {
        // Poor man summarization. TODO: use AI for that
        console.log("summarize: " + chat.messages.length)
        if (chat.messages.length == 2) {
            chat.title = util.summarize(chat.messages[0].text + " " +
                                        chat.messages[1].text)
            console.log("title: " + chat.title)
            title.textContent = chat.title
            title.classList.add("shimmering")
            setTimeout(() => title.classList.remove("shimmering"), 2000)
        }
    }

    const poll = interval => {
        const polledText = model.poll()
        if (polledText === "<--done-->") {
            clearInterval(interval)
            send_stop.innerText = "⇧"
            chat.timestamp = util.timestamp()
            title.innerHTML = ""
            summarize_to_title()
            save_chat(current, chat)
            rebuild_list()
            send.classList.remove("pulsing")
            placeholder()
            send.title = "Click to Submit"
            return
        }
        if (polledText !== "") {
            if (chat.messages.length > 0) {
                chat.messages[chat.messages.length - 1].text += polledText
                requestAnimationFrame(() => {
                    render_last()
                    if (at_the_bottom) scroll_to_bottom()
                    show_hide_scroll_to_bottom()
                })
            }
        }
    }
    
    const polling = () => {
        send_stop.innerText = "▣" // ▣ ◾ ◼ ■ ▣ ◻
        send.classList.add("pulsing")
        const interval = setInterval(() => {
            requestAnimationFrame(() => poll(interval))
        }, 10)
        if (!macOS) {
            title.innerHTML =
                "<div class='logo-container shimmering'>" +
                    "<span class='logo'></span>" +
                    "<span class='logo-content'>GyPTix</span>" +
                "</div>"
        }
    }

    const oops = () => {
        util.toast("<p>Oops.<br>🤕🧠🤢<br>" +
                   "Update?<br>⚙️🔧<br>" +
                   "Try again later?</p>", 5000)
        setTimeout(() => { model.quit() }, 5100)
    }
    
    const ask = t => {
        if (!current || !t) return
        if (!model.is_running()) oops()
        console.log("ask: " + t)
        chat.messages.push({ sender: "user", text: t })
        chat.messages.push({ sender: "bot",  text: "" })
        save_chat(current, chat)
        render_messages()
        scroll_to_bottom()
        let error = model.ask(t)
        if (!error) {
            placeholder()
            polling()
        } else {
            util.toast(error, 5000)
        }
    }
    
    const show_menu = (x, y) => {
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

/*  // May be helpful on Android with softKeyboard
    window.addEventListener("resize", () => {
//      const px = window.innerHeight * 0.01; // ???
        console.log("resize() window " +
                    window.innerWidth + "x" + window.innerHeight)
//      document.documentElement.style.setProperty("--vh", px + "px")
    })
*/
    toggle_theme.onclick = () => util.toggle_theme()
    
    send.onclick = e => {
        e.preventDefault()
        let s = input.innerText.trim()
        if (model.is_answering()) {
            model.interrupt()
            placeholder()
        } else if (s !== "") {
            ask(s)
            input.innerText = ""
            requestAnimationFrame(() => input.blur())
        }
    }
    
    restart.onclick = () => {
        if (model.is_running() && !model.is_answering()) new_session()
    }
    
    clear.onclick = () => {
        localStorage.clear()
        current = null
        new_session()
    }
    
    const collapsed = () => {
        navigation.classList.add("collapsed")
        layout.classList.add("is_collapsed")
        hide_menu()
    }
    
    const expanded = () => {
        if (!model.is_answering()){
            navigation.classList.remove("collapsed")
            layout.classList.remove("is_collapsed")
        }
    }
    
    collapse.onclick = () => collapsed()
    expand.onclick = () => expanded()
    
    scroll.onclick = () => {
        user_scrolling = false
        scroll_to_bottom()
    }
    
    scroll.addEventListener("touchend", e => {
        e.preventDefault()
        user_scrolling = false
        scroll_to_bottom()
    })
    
    let last_key_down_time = 0
    
    input.onkeydown = e => {
        let s = input.innerText.trim()
        if (macOS && s !== "" && e.key === "Enter" && !e.shiftKey) {
            input.innerText = ""
            requestAnimationFrame(() => {
                const sel = window.getSelection()
                if (sel) sel.removeAllRanges()
                ask(s)
            })
        }
        if (s.length > 0 && last_key_down_time !== 0) {
            setTimeout(() => {
                if (Date.now() - last_key_down_time > 2000) {
                    send.classList.add("pulsing")
                    setTimeout(() => send.classList.remove("pulsing"), 2000)
                }
            }, 3000)
        }
        if (s.length > 0) suggestions.hide()
        last_key_down_time = Date.now()
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
        const c = selected === current ? chat : load_chat(selected)
        util.rename_in_place(selected_item, c.title).then(new_name => {
            if (new_name && new_name !== c.title) {
                c.title = new_name
                save_chat(selected, c)
                if (selected === current) {
                    chat = c
                    title.textContent = c.title
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
    
    get("font-increase").onclick = () => util.increase_font_size()
    get("font-decrease").onclick = () => util.decrease_font_size()
    
    messages.addEventListener("mousedown", () => { user_scrolling = true })
    messages.addEventListener("touchstart", () => { user_scrolling = true })

    navigation.addEventListener("mousedown", () => { hide_menu() })

    messages.addEventListener("mouseup", () => {
        setTimeout(() => { user_scrolling = false }, 50)
    })
    
    messages.addEventListener("touchend", () => {
        setTimeout(() => { user_scrolling = false }, 50)
    })
    
    let user_scrolling_timeout = null
    
    messages.addEventListener("wheel", () => {
        user_scrolling = true
        if (user_scrolling_timeout) {
            clearTimeout(user_scrolling_timeout)
        }
        user_scrolling_timeout = setTimeout(() => {
            user_scrolling = false
        }, 100)
    })
    
    document.querySelectorAll(".tooltip").forEach(button => {
        button.addEventListener("mouseenter", function() {
            let rect = this.getBoundingClientRect()
            if (rect.top < 30) { // If too close to the top, move tooltip below
                this.classList.add("tooltip-bottom")
            } else {
                this.classList.remove("tooltip-bottom")
            }
        })
    })
    
    suggest.innerHTML = suggestions.init({
        data: prompts.data,
        callback: s => {
            console.log("suggestion.category: " + s.category + " .prompt: " + s.prompt)
            input.innerText = s.prompt
            suggestions.hide()
        }
    })
    
//  localStorage.clear() // DEBUG
    
    marked.use({pedantic: false, gfm: true, breaks: false})
    detect()
    util.init_theme()
    util.init_font_size(macOS, iPhone, iPad)
    recent()
    placeholder()
    send.title = "Click to Submit"
    if (chat.messages.length == 0) {
        suggestions.show()
        suggestions.start()
    }
}

export { init }
