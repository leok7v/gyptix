"use strict"

import * as detect      from "./detect.js"
import * as markdown    from "./markdown.js"
import * as marked      from "./marked.js"
import * as modal       from "./modal.js"
import * as model       from "./model.js"
import * as prompts     from "./prompts.js"
import * as suggestions from "./suggestions.js"
import * as util        from "./util.js"
import * as ui          from "./ui.js"

const get = id => document.getElementById(id)

/* “double rAF,” is the usual way to ensure the browser
   has actually laid out (and often painted) before the
   second callback runs
*/

const layout_and_render = () => {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
    })
}

let chat = null // **the** chat

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

export const run = () => { // called DOMContentLoaded
    const
        shred        = get("shred"), // shred & recycle 
        content      = get("content"),
        expand       = get("expand"),
        tools        = get("tools"),
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

    let at_the_bottom = true
    let at_the_bottom_stopped = false // false at start of polling
    let user_scrolling = false
    let current  = null // current  chat id
    let selected = null // selected chat id
    let selected_item = null // item in chats list
    let interrupted = false  // output was interrupted
    let is_expanded = false  // navigation pane expanded
    
    document.addEventListener("copy", e => {
        e.preventDefault()
        const s = window.getSelection().toString()
        e.clipboardData.setData("text/plain", s)
    })

    const hide_scroll_to_bottom = () => {
        ui.hide(scroll)
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

    const stop_in_flight_scroll = () => {
        const originalOverflow = messages.style.overflow;
        messages.style.overflow = "hidden";
        // Force reflow (e.g., read offsetHeight).
        const _ = messages.offsetHeight; // reading forces layout
        messages.style.overflow = originalOverflow;
    }
    
    const scroll_to_bottom = () => {
        stop_in_flight_scroll() // must be stopped before assignment below
//      messages.scrollTop = messages.scrollHeight
        messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth"})
        at_the_bottom = true
        setTimeout(() => ui.hide(scroll), 50)
    }
    
    function normalize_line_breaks_to_spaces(text) {
        const paragraphs = text.split(/(\r\n\r\n|\r\r|\n\n)/)
        return paragraphs.map(segment => {
            if (/^(\r\n\r\n|\r\r|\n\n)$/.test(segment)) { return "\n\n" }
            return segment.replace(/\r\n|\r|\n/g, "\x20\x20\n");
        }).join('')
    }
    
    const render_message = msg => {
        const d = document.createElement("div")
        d.className = msg.sender === "user" ? "user" : "bot"
        let text = msg.sender === "bot" ? msg.text :
            normalize_line_breaks_to_spaces(msg.text)
        d.innerHTML = marked.parse(text)
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
    
    const render_last = (chunk) => {
        if (!chat || !chat.messages || chat.messages.length === 0) return
        const last_index = chat.messages.length - 1
        const last_msg = chat.messages[last_index]
        // Get last child element (assumed to be the last message).
        const last_child = messages.lastElementChild
        last_msg.text += chunk
        last_msg.text = util.substitutions(last_msg.text)
        if (last_child && last_msg.sender === "user") {
            messages.appendChild(render_message(last_msg))
        } else if (last_child && last_msg.sender === "bot") {
            let text = chunk
            markdown.post(text, (html, error) => {
                if (error) {
                    console.error(error)
                } else {
                    last_child.innerHTML = html
                    if (!at_the_bottom_stopped) {
                        const mrc = messages.getBoundingClientRect();
                        const lrc = last_child.getBoundingClientRect();
                        at_the_bottom_stopped = lrc.top - 30 <= mrc.top
                        if (at_the_bottom_stopped) at_the_bottom = false
                    }
                    if (at_the_bottom) scroll_to_bottom()
                    show_hide_scroll_to_bottom()
                }
            })
        } else {
            messages.appendChild(render_message(last_msg))
        }
        if (at_the_bottom) scroll_to_bottom()
        show_hide_scroll_to_bottom()
    }
    
    messages.onscroll = () => {
        if (user_scrolling) {
            input.blur()
            collapsed()
            layout_and_render().then(() => {
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
                hide_menu()
                hide_scroll_to_bottom()
                if (current !== c.id) {
                    ui.hide(carry)
                    suggestions.hide()
                    messages.innerHTML = ""
                    current = c.id
                    layout_and_render().then(() => {
                        chat = load_chat(current)
                        placeholder()
                        render_messages()
                        rebuild_list()
                        layout_and_render().then(() => {
                            scroll_to_bottom()
                            layout_and_render().then(() => {
                                model.run(c.id) // slowest
                            })
                        })
                    })
                }
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
        ui.hide(carry)
        title.innerHTML = ""
        send.classList.add('hidden')
        save_chat(chat)
        collapsed()
        rebuild_list()
        messages.innerText = ""
        render_messages()
        suggestions.show()
        model.run(id)
//      console.log("model.run(" + id + ")")
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
//          console.log("model.run(" + most_recent.id + ")")
            messages.innerHTML = ""
            render_messages()
            scroll_to_bottom()
            rebuild_list()
        } else {
            new_session()
        }
    }
    
    const placeholder = () => {
        let ph = ""
        if (model.is_answering()) {
            ph = "click ▣ to stop"
        } else if (chat.messages.length > 0) {
            ph = "Anything else can I help you with?"
        } else if (!detect.macOS) { // double quotes improtant for css variable:
            ph = "Ask anything... and click ⇧"
        } else {
            ph = "Ask anything... Use ⇧⏎ for line break"
        }
        // double quotes improtant for css variable inside value
        input.style.setProperty("--placeholder", `"${ph}"`)
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
    
    const done = () => {
        send.classList.remove('hidden')
        ui.hide(stop)
        ui.hide(clear)
        carry.style.display = interrupted ? "inline" : "none"
        chat.timestamp = util.timestamp()
        title.innerHTML = ""
        summarize_to_title()
        save_chat(chat)
        rebuild_list()
        stop.classList.remove("pulsing")
        const last_index = chat.messages.length - 1
        const last_msg = chat.messages[last_index]
        placeholder()
    }
    
    const thinking = detect.macOS ?
        [          "Reasoning", "Thinking", "Answering"] :
        ["GyPTix", "Reasoning", "Thinking", "Answering"]

    const cycle_titles = (count) => {
        title.innerHTML =
            "<div class='logo-container shimmering'>" +
                "<span class='logo'></span>" +
                "<span class='logo-content'>" + thinking[count] + "</span>" +
            "</div>"
        return (count + 1) % thinking.length
    }
    
    const poll = (context) => {
        if (!markdown.processing) {
            const chunk = model.poll()
            if (chunk === "<--done-->") {
                clearInterval(context.interval)
                done()
            } else if (chunk !== "") {
                render_last(chunk)
            }
        }
        if (util.timestamp() - context.last > 1500) {
            context.count = cycle_titles(context.count)
            context.last = util.timestamp()
        }
    }
    
    const polling = () => {
        at_the_bottom_stopped = false
        stop.style.display = "inline" // ? ▣ ◾ ◼ ■ ▣ ◻
        send.classList.add('hidden')
        stop.classList.add("pulsing")
        markdown.start()
        cycle_titles(0)
        let context = { interval: null, last: util.timestamp(), count: 1 }
        const interval = setInterval(() => {
            layout_and_render().then(() => {
                context.interval = interval
                poll(context)
            })
        }, 20) // 50 times per second
        placeholder()
    }

    const oops = () => {
        modal.toast("<p>Oops.<br>🤕🧠🤢<br>" +
                   "Close and try again later<br><br>" +
                   "or update ⚙️ in AppStore?</p>", 5000)
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
        layout_and_render().then(() => { // render before asking
            let error = model.ask(t)
            ui.hide(clear)
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
    
    const hide_menu = () => ui.hide(menu)

    toggle_theme.onclick = () => util.toggle_theme()
    
    send.onclick = e => {
        e.preventDefault()
        let s = input.innerText.trim()
        if (!model.is_answering() && s !== "") {
            ui.hide(carry, clear)
            interrupted = false
            input.innerText = ""
            send.classList.add('hidden')
            input.style.setProperty("--placeholder", '""')
            title.innerHTML =
                "<div class='logo-container shimmering'>" +
                    "<span class='logo'></span>" +
                    (detect.macOS ? "" :
                     "<span class='logo-content'>GyPTix</span>") +
                "</div>"
            setTimeout(() => { // let frame to re-render first
                ask(s)
                placeholder()
                layout_and_render().then(() => input.blur())
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
            ui.hide(stop)
            carry.style.display = "inline"
        }
    }

    clear.onclick = e => {
        input.innerText = ""
        ui.hide(clear)
        layout_and_render().then(() => {
            input.focus()
            if (chat.messages.length == 0) suggestions.show()
        })
    }

    carry.onclick = e => {
        ui.hide(carry)
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
        is_expanded = false
        navigation.classList.add("collapsed")
        ui.hide(tools)
        hide_menu()
    }
    
    const expanded = () => {
        if (!model.is_answering()){
            is_expanded = true
            navigation.classList.remove("collapsed")
            ui.hide(scroll)
            tools.style.display = "block"
        }
    }
    
    expand.onclick = () => (is_expanded ? collapsed() : expanded())
    
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
            e.preventDefault()
            input.innerText = ""
            send.classList.add('hidden')
            layout_and_render().then(() => {
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
    
    const observer = new MutationObserver(() => ui.hide(scroll))
    
    observer.observe(input, { childList: true, subtree: true,
        characterData: true });
    
    input.onblur = () => { // focus lost
        if (at_the_bottom) scroll_to_bottom()
        show_hide_scroll_to_bottom()
        document.body.style.overflow = ""
        if (chat.messages.length == 0) suggestions.show()
    }
    
    input.onfocus = () => {
        suggestions.hide()
        ui.hide(scroll)
        document.body.style.overflow = "hidden"
        collapsed()
    }
    
    input.oninput = () => {
        let s = input.innerText
        if (s !== "" && !model.is_answering()) {
            send.classList.remove('hidden')
            ui.hide(stop, carry)
            clear.style.display = "inline"
        }
        const lines = input.innerText.split("\n").length
        input.style.maxHeight = lines > 1
        ? window.innerHeight * 0.5 + "px" : ""
    }
    
    content.onclick = e => {
        if (e.target.closest("#content") || e.target.closest("#input")) {
            collapsed()
        }
        if (!e.target.closest("#menu")) hide_menu()
    }

    const delete_chat = () => {
        if (!selected) return
        localStorage.removeItem("chat.id." + selected)
        localStorage.removeItem("chat." + selected)
        model.remove(selected)
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
            ui.hide(stop, carry)
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

    get("info").onclick = () => { collapsed(); licenses() }
    
    let v = localStorage.getItem("version.data")
    if (v !== version_data) {
        localStorage.clear() // no one promissed to keep data forever
        localStorage.setItem("version.data", version_data)
    }
    
    detect.init()
    marked.use({pedantic: false, gfm: true, breaks: true})
    
    util.init_theme()
    util.init_font_size()
    
    new_session() // alternatively recent() can load and continue
    placeholder()
    if (chat.messages.length == 0 &&
        input !== document.activeElement) {
        suggestions.show()
    }
    send.title = "Submit"
    stop.title = "Stop"
    clear.title = "Clear"
    scroll.title = "Scroll to the Bottom"

    showEULA()
}

export const inactive = () => {
    if (chat) save_chat(chat)
    return "done"
}

export const debugger_attached = (attached) => {
//  console.log(`debugger_attached(): ${attached}, typeof: ${typeof attached}`)
    if (typeof attached === "string") attached = (attached === "true")
    util.set_debugger_attached(attached);
    if (!attached) {
        document.body.oncontextmenu = (e) => e.preventDefault()
//      console.log("debugger_attached: disabling context menu")
    }
    return attached ? "conext menu enabled" : "conext menu disabled"
}

window.app = { run: run, inactive: inactive, debugger_attached: debugger_attached }

model.initialized()
