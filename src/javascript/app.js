"use strict"

import * as detect      from "./detect.js"
import * as marked      from "./marked.js"
import * as modal       from "./modal.js"
import * as model       from "./model.js"
import * as prompts     from "./prompts.js"
import * as suggestions from "./suggestions.js"
import * as util        from "./util.js"

const get = id => document.getElementById(id)

let at_the_bottom = true
let user_scrolling = false
let current  = null // current chat key
let selected = null // selected chat
let chat     = null // chat
let selected_item = null // item in chats list

let interrupted = false // output was interrupted

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
    // if chat was corrupted fix it and report it:
    if (!h || !h.id) {
        console.log("missing header.id replacing with: " + id)
        h.id = id
    }
    const m = JSON.parse(content) // [] messages
    const c  = { id: h.id, title: h.title, timestamp: h.timestamp, messages: m }
    return c
}

const save_chat = (c) => {
    if (c.messages.length == 0) return // never save empty chats
    const header  = { id: c.id, title: c.title, timestamp: c.timestamp }
    try {
        localStorage.setItem("chat.id." + c.id, JSON.stringify(header))
        localStorage.setItem("chat." + c.id, JSON.stringify(c.messages))
    } catch (error) {
        console.log(error)
        modal.toast(error, 5000)
        localStorage.removeItem("chat.id." + c.id)
        localStorage.removeItem("chat." + c.id)
    }
}

export const inactive = () => {
//  console.log(">>>app.js inactive()")
    if (chat) save_chat(chat)
//  console.log("<<<app.js inactive()")
    return "done"
}

export const run = () => { // called DOMContentLoaded
    const
        shred        = get("shred"), // shred & recycle 
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
        stop         = get("stop"),
        carry        = get("carry"),
        clear        = get("clear"),
        send         = get("send"),
        share        = get("share"),
        suggest      = get("suggest"),
        title        = get("title"),
        toggle_theme = get("toggle_theme")
    
    // TODO:
    // visiblility (hidden) and display none state management is from HELL
    // It was Q&D hack on spur of the moment. Need to subscribe to state
    // changes and update all visibility in one place.
    // Maybe also need "disabled" style with <glyp> 50% oppacity

    const hide_scroll_to_bottom = () => {
        scroll.style.display = "none"
    }

    const scroll_gap = 20
    
    const show_hide_scroll_to_bottom = () => {
        const sh = messages.scrollHeight
        const ch = messages.clientHeight
        const top = messages.scrollTop
        const d = sh - top
        scroll.style.display = d > ch + scroll_gap &&
        (!model.is_answering() || !at_the_bottom)
        ? "block" : "none"
    }
    
    const scrolled_to_bottom = () => {
        const sh = messages.scrollHeight
        const ch = messages.clientHeight
        const top = messages.scrollTop
        at_the_bottom = sh - ch <= top + scroll_gap
    }

    const scroll_to_bottom = () => {
        messages.scrollTop = messages.scrollHeight
        at_the_bottom = true
        setTimeout(() => { scroll.style.display = "none" }, 50)
    }
    
    const render_message = msg => {
        const d = document.createElement("div")
        d.className = msg.sender === "user" ? "user" : "bot"
        if (msg.sender === "bot") {
            d.innerHTML = render_markdown(msg.text)
        } else {
            d.textContent = msg.text // makes sure use text does not do html injection
        }
        return d
    }
    
    const render_messages = () => {
        if (!chat || !chat.messages) { return }
        if (chat.messages.length == 0) {
            if (input !== document.activeElement) suggestions.show()
            return
        }
        if (chat.messages.length > 0) {
            suggestions.hide()
        }
        scrolled_to_bottom()
        // this is optimization because markdown rendering is slow
        var i = 0
        chat.messages.forEach(msg => {
            if (i > messages.childNodes.length - 1) {
                messages.appendChild(render_message(msg))
            }
            i++;
        })
        if (at_the_bottom) scroll_to_bottom()
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
            requestAnimationFrame(() => {
                scrolled_to_bottom()
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
                collapsed()
                if (current != c.id) {
                    current = c.id
                    model.run(c.id)
                    chat = load_chat(current)
                    rebuild_list()
                    messages.innerHTML = ""
                    render_messages()
                }
                hide_menu()
                hide_scroll_to_bottom()
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
        // already have new empty chat?
        if (chat && chat.messages && chat.messages.length == 0) return
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
        title.innerHTML = ""
        send.classList.add('hidden')
        save_chat(chat)
        collapsed()
        rebuild_list()
        messages.innerText = ""
        render_messages()
        suggestions.show()
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
            messages.innerHTML = ""
            render_messages()
            scroll_to_bottom()
            rebuild_list()
        } else {
            new_session()
        }
    }
    
    const placeholder = () => {
        // double quotes improtant for css variable inside value
        if (model.is_answering()) {
            input.style.setProperty("--placeholder",
                                    '"click ▣ to stop"')
            send.title = "Click to Stop"
        } else if (!detect.macOS) { // double quotes improtant for css variable:
            input.style.setProperty("--placeholder",
                                    '"Ask anything... and click ⇧"')
        } else {
            input.style.setProperty("--placeholder",
                                    '"Ask anything... Use ⇧⏎ for line break"')
        }
    }
    
    const summarize_to_title = () => {
        // Poor man summarization. TODO: use AI for that
        if (chat.messages.length == 2) {
            chat.title = util.summarize(chat.messages[0].text + " " +
                                        chat.messages[1].text)
            title.textContent = chat.title
            title.classList.add("shimmering")
            setTimeout(() => title.classList.remove("shimmering"), 2000)
        }
    }

    const substitutions = (s) => {
        const now = new Date()
        const replacements = {
            "[insert current date]": now.toLocaleDateString(),
            "[insert day of the week]": now.toLocaleDateString(undefined, { weekday: "long" }),
            "[insert current time]": now.toLocaleTimeString()
        };
        return s.replace(/\[insert (current date|day of the week|current time)\]/gi, (match) => {
            return replacements[match.toLowerCase()] || match;
        })
    }
    
    const done = () => {
        send.classList.remove('hidden')
        stop.style.display = "none"
        carry.style.display = interrupted ? "inline" : "none"
        clear.style.display = "none"
        chat.timestamp = util.timestamp()
        title.innerHTML = ""
        summarize_to_title()
        save_chat(chat)
        rebuild_list()
        stop.classList.remove("pulsing")
        placeholder()
        send.title = "Click to Submit"
        const last_index = chat.messages.length - 1
        const last_msg = chat.messages[last_index]
        last_msg.text = substitutions(last_msg.text)
        render_last() // because of substitutions
    }
    
    const poll = interval => {
        const polledText = model.poll()
        if (polledText === "<--done-->") {
            clearInterval(interval)
            done()
        } else if (polledText !== "") {
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
        stop.style.display = "inline" // ? ▣ ◾ ◼ ■ ▣ ◻
        send.classList.add('hidden')
        stop.classList.add("pulsing")
        const interval = setInterval(() => {
            requestAnimationFrame(() => poll(interval))
        }, 50)
    }

    const oops = () => {
        modal.toast("<p>Oops.<br>🤕🧠🤢<br>" +
                   "Maybe AppStore update?<br>⚙️🔧<br>" +
                   "Or try again later?</p>", 5000)
        setTimeout(() => { model.quit() }, 5100)
    }
    
    const ask = t => {
        if (!current || !t) return
        if (!model.is_running()) oops()
        chat.messages.push({ sender: "user", text: t })
        chat.messages.push({ sender: "bot",  text: "" })
        save_chat(chat)
        render_messages()
        scroll_to_bottom()
        requestAnimationFrame(() => { // render before asking
            let error = model.ask(t)
            if (!error) {
                polling()
            } else {
                modal.toast(error, 5000)
            }
        })
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

    toggle_theme.onclick = () => util.toggle_theme()
    
    send.onclick = e => {
        e.preventDefault()
        let s = input.innerText.trim()
        if (!model.is_answering() && s !== "") {
            carry.style.display = "none"
            clear.style.display = "none"
            interrupted = false
            input.innerText = ""
            send.classList.add('hidden')
            input.style.setProperty("--placeholder", '""')
            if (!detect.macOS) {
                title.innerHTML =
                    "<div class='logo-container shimmering'>" +
                        "<span class='logo'></span>" +
                        "<span class='logo-content'>GyPTix</span>" +
                    "</div>"
            }
            setTimeout(() => { // let frame to re-render first
                ask(s)
                placeholder()
                requestAnimationFrame(() => input.blur())
            }, 10)
        }
    }

    stop.onclick = e => {
        e.preventDefault()
        let s = input.innerText.trim()
        if (model.is_answering()) {
            interrupted = true
            model.interrupt()
            placeholder()
            stop.style.display = "none"
            carry.style.display = "inline"
        }
    }

    clear.onclick = e => {
        input.innerText = ""
        clear.style.display = "none"
        requestAnimationFrame(() => {
            input.focus()
            if (chat.messages.length == 0) suggestions.show()
        })
    }

    carry.onclick = e => {
        carry.style.display = "none"
        ask("carry on")
    }

    restart.onclick = () => {
        if (model.is_running() && !model.is_answering()) new_session()
    }

    const erase = () => {
        collapsed()
        const keys = Object.keys(localStorage).filter(k => k.startsWith("chat."))
        keys.forEach(k => localStorage.removeItem(k))
        model.erase()
        current = null
        rebuild_list()
        new_session()
    }

    shred.onclick = () => {
        modal.ask("### **Erase All Chat History**  \n" +
            "For your privacy and storage<br>" +
            "efficiency, wiping everything<br>" +
            "clean and shredding the data<br>" +
            "might be a good idea. *Recycle*<br>" +
            "*the ellectrons!* But...\n\n" +
            "**This action is irreversible.**",
        (action) => {
            if (action === "Delete") erase()
        },
        "Cancel", "<red>Delete</red>")
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
        if (detect.macOS && s !== "" && e.key === "Enter" && !e.shiftKey) {
            input.innerText = ""
            send.classList.add('hidden')
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
        if (at_the_bottom) scroll_to_bottom()
        show_hide_scroll_to_bottom()
        document.body.style.overflow = ""
    }
    
    input.onfocus = () => {
        suggestions.hide()
        scroll.style.display = "none"
        document.body.style.overflow = "hidden"
        collapsed()
    }
    
    input.oninput = () => {
        let s = input.innerText
        if (s !== "" && !model.is_answering()) {
            send.classList.remove('hidden')
            stop.style.display = "none"
            carry.style.display = "none"
            clear.style.display = "inline"
        }
        const lines = input.innerText.split("\n").length
        input.style.maxHeight = lines > 1
        ? window.innerHeight * 0.5 + "px" : ""
    }
    
    content.onclick = e => {
        if (e.target.closest("#chat-container") || e.target.closest("#input")) {
            collapsed()
        }
        if (!e.target.closest("#menu")) hide_menu()
    }

    const delete_chat = () => {
        localStorage.removeItem("chat.id." + selected)
        localStorage.removeItem("chat." + selected)
        if (current === selected) {
            current = null
            recent()
        }
        selected = null
        hide_menu()
        rebuild_list()
        messages.innerHTML = ""
        render_messages()
        scroll_to_bottom()
    }
    
    remove.onclick = () => {
        hide_menu()
        if (!selected) return
        let c = load_chat(selected)
        modal.ask("# **Delete Chat**\n\n" +
                          '"' + c.title + '"\n\n' +
                          "This cannot be undone.",
            (action) => {
                if (action === "Delete") delete_chat()
            },
        "Cancel", "<red>Delete</red>")
    }
    
    rename.onclick = () => {
        if (!selected) return
        hide_menu()
        const c = selected === current ? chat : load_chat(selected)
        modal.rename_in_place(selected_item, c.title).then(new_name => {
            if (new_name && new_name !== c.title) {
                c.title = new_name
                save_chat(c)
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
        hide_menu()
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
            interrupted = false;
            input.innerText = s.prompt
            stop.style.display  = "none"
            carry.style.display = "none"
            clear.style.display = "inline"
            send.classList.remove('hidden')
            suggestions.hide()
        }
    })

    const licenses = () => {
        modal.show(util.load("./licenses.md"), (action) => {
        }, "OK")
    }

    let version_app  = "25.02.24" // application version
    // data version should be changed only of scheme needs to be wiped out
    let version_data = "25.02.22" // data scheme version

    const showEULA = () => {
//      localStorage.removeItem("app.eula") // DEBUG
        const nbsp4 = "    " // 4 non-breakable spaces
        if (!localStorage.getItem("app.eula")) {
            localStorage.clear() // no one promissed to keep data forever
            modal.show(util.load("./eula.md"), (action) => {
                if (action === "Disagree") { model.quit() }
                localStorage.setItem("app.eula", "true")
                localStorage.setItem("version.data", version_data)
                licenses()
            }, "<red>Disagree</red>",
               "<green>" + nbsp4 + "Agree" + nbsp4 + "</green>")
        }
    }

    let v = localStorage.getItem("version.data")
    if (v !== version_data) {
        localStorage.clear() // no one promissed to keep data forever
        localStorage.setItem("version.data", version_data)
    }
    
    detect.init()
    marked.use({pedantic: false, gfm: true, breaks: false})
    
    util.init_theme()
    util.init_font_size()
    recent()
    if (chat.messages.length > 0) { new_session() }
    placeholder()
    send.title = "Click to Submit"
    setTimeout(() => {
        if (chat.messages.length == 0 &&
            input !== document.activeElement) {
            suggestions.show()
        }
    }, 3000)

    showEULA()
    
    try {
        let buffer = new SharedArrayBuffer(4)
        console.log("✅ SharedArrayBuffer is available:", buffer)
    } catch (e) {
        console.log("🚫 SharedArrayBuffer is blocked:", e.message)
    }
    console.log("self.crossOriginIsolated: " + self.crossOriginIsolated)
    
}

window.app = { inactive, run }
