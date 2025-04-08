"use strict"

import * as detect      from "./detect.js"
import * as history     from "./history.js"
import * as markdown    from "./markdown.js"
import * as marked      from "./marked.js"
import * as modal       from "./modal.js"
import * as model       from "./model.js"
import * as prompts     from "./prompts.js"
import * as suggestions from "./suggestions.js"
import * as util        from "./util.js"
import * as ui          from "./ui.js"

const nbsp4 = "    " // 4 non-breakable spaces

const get = id => document.getElementById(id)

const layout_and_render = () => {
    /* “double rAF,” is the usual way to ensure the browser
       has actually laid out (and often painted) before the
       second callback runs */
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
    })
}

let chat = null // **the** chat

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

    let autoscroll = false // scroll clicked while answering
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
    
    const scroll_gap = 20

    var scroll_queue = { top: 0, next: 0 }

    const is_scrolling = () => // smooth scrolling in flight
            scroll_queue.top !== 0 || scroll_queue.next !== 0

    const stop_in_flight_scroll = () => {
        const originalOverflow = messages.style.overflow;
        messages.style.overflow = "hidden";
        // Force reflow (e.g., read offsetHeight).
        const _ = messages.offsetHeight; // reading forces layout
        messages.style.overflow = originalOverflow;
    }

    const is_scrolled_to_the_bottom = () => {
        const verbose = false
        const log = verbose ? console.log : () => {}
        const top = messages.scrollHeight - messages.offsetHeight
        const r = Math.abs(top - messages.scrollTop) < scroll_gap
        log("is_scrolled_to_the_bottom " +
            ".scrollTop: " + messages.scrollTop +
            " top: " + top + " : " + r)
        return r
    }

    const scroll_show_hide = () => {
        const verbose = false
        const log = verbose ? console.log : () => {}
        if (is_scrolling()) { // indeterminate for now
            log("scroll_show_hide " +
                " autoscroll: " + autoscroll +
                " .scrollTop: " + messages.scrollTop +
                " .scrollHeight: " + messages.scrollHeight +
                " .offsetHeight: " + messages.offsetHeight +
                " .next: " + scroll_queue.next +
                " .top: "  + scroll_queue.top +
                " is_scrolling(): true")
        } else if (is_scrolled_to_the_bottom()) {
            log("scroll_show_hide " +
                " autoscroll: " + autoscroll +
                " .scrollTop: " + messages.scrollTop +
                " .scrollHeight: " + messages.scrollHeight +
                " .offsetHeight: " + messages.offsetHeight +
                " .next: " + scroll_queue.next +
                " .top: "  + scroll_queue.top +
                " ui.hide(scroll) because is_scrolled_to_the_bottom()")
            ui.hide(scroll)
        } else {
            log("scroll_show_hide " +
                " autoscroll: " + autoscroll +
                " .scrollTop: " + messages.scrollTop +
                " .scrollHeight: " + messages.scrollHeight +
                " .offsetHeight: " + messages.offsetHeight +
                " .next: " + scroll_queue.next +
                " .top: "  + scroll_queue.top +
                " ui.show(scroll)")
            ui.show(scroll)
        }
    }

    const scroll_to_bottom_cancel = () => {
        if (is_scrolling()) stop_in_flight_scroll()
        scroll_queue = { top: 0, next: 0 }
    }
    
    const scroll_to_bottom = () => {
        const verbose = false
        const log = verbose ? console.log : () => {}
        var top = messages.scrollHeight - messages.offsetHeight
        top = Math.max(top, scroll_queue.next)
        if (Math.abs(top - messages.scrollTop) < 1) {
            log("scroll_to_bottom nothing to do " +
                " autoscroll: " + autoscroll +
                " .scrollTop: " + messages.scrollTop +
                " .scrollHeight: " + messages.scrollHeight +
                " .offsetHeight: " + messages.offsetHeight +
                " .top: "  + scroll_queue.top +
                " .next: " + scroll_queue.next +
                " top: " + top
            )
            return
        }
        const max_top = Math.max(messages.scrollTop, top)
        const next = Math.max(max_top, scroll_queue.next)
        if (!is_scrolling()) { // scrolling isn't started yet
            scroll_queue.next = next
            log("scroll_to_bottom starting" +
                " autoscroll: " + autoscroll +
                " .scrollTop: " + messages.scrollTop +
                " .scrollHeight: " + messages.scrollHeight +
                " .offsetHeight: " + messages.offsetHeight +
                " .top: "  + scroll_queue.top +
                " .next: " + scroll_queue.next
            )
            scroll_queue.top  = next // .top and .next the same
            messages.scrollTo({ top: next, behavior: "smooth" })
            const check_scroll = () => {
                const top = Math.max(scroll_queue.top, scroll_queue.next)
                if (Math.abs(top - messages.scrollTop) < 1) {
                    log("scroll_to_bottom smooth scroll done " +
                        " autoscroll: " + autoscroll +
                        " .scrollTop: " + messages.scrollTop +
                        " .scrollHeight: " + messages.scrollHeight +
                        " .offsetHeight: " + messages.offsetHeight +
                        " .top: "  + scroll_queue.top +
                        " .next: " + scroll_queue.next
                        )
                    if (autoscroll) {
                        log("scroll_to_bottom scroll_to_bottom() again")
                        scroll_queue = { top: 0, next: 0 }
                        requestAnimationFrame(scroll_to_bottom)
                    } else {
                        log("scroll_to_bottom scroll_to_bottom_cancel()")
                        scroll_to_bottom_cancel()
                        scroll_show_hide()
                    }
                } else if (is_scrolling()) {
                    log("scroll_to_bottom requestAnimationFrame " +
                        " autoscroll: " + autoscroll +
                        " .scrollTop: " + messages.scrollTop +
                        " .scrollHeight: " + messages.scrollHeight +
                        " .offsetHeight: " + messages.offsetHeight +
                        " .top: "  + scroll_queue.top +
                        " .next: " + scroll_queue.next
                    )
                    requestAnimationFrame(check_scroll)
                } else {
                    log("scroll_to_bottom canceled" +
                        " autoscroll: " + autoscroll +
                        " .scrollTop: " + messages.scrollTop +
                        " .scrollHeight: " + messages.scrollHeight +
                        " .offsetHeight: " + messages.offsetHeight +
                        " .top: "  + scroll_queue.top +
                        " .next: " + scroll_queue.next +
                        " is_scrolling(): " + is_scrolling())
                }
            }
            requestAnimationFrame(check_scroll)
        } else {
            log("scroll_to_bottom is_scrolling(): true")
        }
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
        console.log("chat.messages.length: " + chat.messages.length)
        if (chat.messages.length > 0) {
            console.log("suggestions.hide()")
            suggestions.hide()
        }
        // this is optimization because markdown rendering is slow
        var i = 0
        chat.messages.forEach(msg => {
            if (i > messages.childNodes.length - 1) {
                messages.appendChild(render_message(msg))
//              console.log("render_messages messages.appendChild(): " + i)
            }
            i++;
        })
        if (autoscroll || ui.is_hidden(scroll)) scroll_to_bottom()
    }
    
    const last_child_scroll = () => {
        const last_child = messages.lastElementChild
        const _ = messages.offsetHeight; // reading forces layout
        const mrc = messages.getBoundingClientRect()
        const lrc = last_child.getBoundingClientRect()
        if (lrc.top - scroll_gap <= mrc.top &&
            ui.is_hidden(scroll) && !autoscroll) {
//          console.log("last_child_scroll scroll_to_bottom_cancel()")
            ui.show(scroll)
            scroll_to_bottom_cancel()
        } else {
//          console.log("last_child_scroll autoscroll: " + autoscroll)
            if (autoscroll || ui.is_hidden(scroll)) scroll_to_bottom()
        }
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
//                  console.log("render_last last_child_scroll()")
                    last_child_scroll()
                }
            })
        } else {
            messages.appendChild(render_message(last_msg))
//          console.log("render_last last_child_scroll()")
            last_child_scroll()
        }
    }
    
    messages.onscroll = () => {
        if (is_expanded) collapsed()
//      if (document.activeElement == input) input.blur()
        if (!model.is_answering() || ui.is_hidden(scroll)) {
            scroll_show_hide()
        }
    }
    
    const load = (c) => {
        ui.hide(scroll, carry)
        suggestions.hide()
        messages.innerHTML = ""
        current = c.id
        set_chat_title(c.title)
        layout_and_render().then(() => {
            chat = history.load_chat(current)
            chat.timestamp = util.timestamp() // make it recent
            history.save_chat_header(chat)    // and save it
            placeholder()
            render_messages()
            rebuild_list()
            layout_and_render().then(() => {
                console.log("model.run(" + c.id + ")")
                model.run(c.id) // slowest
                if (!is_scrolled_to_the_bottom()) {
                    ui.show(scroll)
                    scroll_to_bottom()
                }
            })
        })
    }
    
    const list_item = (c) => {
        const div = document.createElement("div")
        div.className = "item"
        if (c.id === current) div.classList.add("selected")
        div.onclick = () => {
            selected = null; collapsed(); hide_menu()
            if (current !== c.id) load(c)
        }
        const span = document.createElement("span")
        span.textContent = c.title
        const dots = document.createElement("button")
        dots.textContent = "⋯"
        dots.onclick = e => {
            e.stopPropagation()
            selected = c.id; selected_item = span
            show_menu(e.pageX / 2, e.pageY)
        }
        div.append(span, dots)
        list.appendChild(div)
    }

    const rebuild_list = () => history.generate(list, list_item)

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
        set_title('')
        ui.hide(send)
        history.save_chat(chat)
        collapsed()
        rebuild_list()
        messages.innerText = ""
        render_messages()
        suggestions.show()
        placeholder()
        console.log("model.run(" + id + ")")
        layout_and_render().then(() => model.run('+' + id))
    }
    
    const recent = () => { // most recent chat -> current
        const keys = Object.keys(localStorage).filter(k => k.startsWith("chat.id."))
        const valid_chats = keys.map(key => {
            const h = history.load_chat(history.key2id(key))
            return h && h.timestamp
            ? { id: history.key2id(key),
                timestamp: h.timestamp,
                title: h.title }
            : null
        }).filter(chat => chat !== null)
        if (valid_chats.length > 0) {
            valid_chats.sort((a, b) => b.timestamp - a.timestamp)
            const most_recent = valid_chats[0]
            current = most_recent.id
            chat = history.load_chat(most_recent.id)
            model.run(most_recent.id)
//          console.log("model.run(" + most_recent.id + ")")
            messages.innerHTML = ""
            render_messages()
            rebuild_list()
        } else {
            new_session()
        }
    }
    
    const placeholder = () => {
        let ph = ""
        if (model.is_answering()) {
            if (ui.is_hidden(scroll)) {
                ph = "▣ stop"
            } else {
                ph = "▣ stop" + nbsp4 + "↓ scroll"
            }
        } else if (chat.messages.length > 0) {
            ph = "Anything else can I help you with?"
        } else if (!detect.macOS) { // double quotes improtant for css variable:
            ph = "Ask anything... (↑)"
        } else {
            ph = "Ask anything... Use ⇧⏎ for line break"
        }
        // double quotes improtant for css variable inside value
        input.style.setProperty("--placeholder", `"${ph}"`)
    }
    
    const set_title = (s) => {
        const classes = s === '' ? 'logo-container rainbow' :
                                   'logo-container shimmering'
        const t = s === '' ? (detect.macOS ? '' : 'GyPTix') : s
        const c = t === '' ? '' : `<span class='logo-content'>${t}</span>`
        title.innerHTML =
            `<div class='${classes}' >` +
                "<span class='logo'></span>" + c +
            "</div>"
    }

    const set_chat_title = (s) => {
        if (s === '') {
            set_title(s)
        } else {
            title.innerHTML =
                "<div class='logo-container' >" +
                    `<span class='logo-content'>${s}</span>` +
                "</div>"
        }
    }
    
    const thinking = detect.macOS ?
        [          "Reasoning", "Thinking", "Answering"] :
        ["GyPTix", "Reasoning", "Thinking", "Answering"]

    const cycle_titles = (count) => {
        set_title(thinking[count])
        return (count + 1) % thinking.length
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
        autoscroll = false
        input.oninput()
        chat.timestamp = util.timestamp()
        title.innerHTML = ""
        summarize_to_title()
        set_chat_title(chat.title)
        history.save_chat(chat)
        rebuild_list()
        stop.classList.remove("pulsing")
        const last_index = chat.messages.length - 1
        const last_msg = chat.messages[last_index]
        placeholder()
        ui.show(expand, restart)
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
        autoscroll = false
        ui.show(stop)
        ui.hide(send, expand, restart)
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
        history.save_chat(chat)
        render_messages()
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
            input.innerHTML = ""
            ui.hide(send)
            input.style.setProperty("--placeholder", '""')
            set_title('')
            placeholder()
            input.blur()
            layout_and_render().then( () => ask(s) )
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
        placeholder()
        layout_and_render().then(() => {
            input.focus()
            if (chat.messages.length == 0) suggestions.show()
        })
    }

    carry.onclick = e => {
        interrupted = false
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
        hide_menu()
        // TODO: menu here "Older than month" / "Older than a week" / "All"
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
        navigation.classList.remove("expanded")
        ui.hide(tools)
        ui.show(title)
        hide_menu()
    }
    
    const expanded = () => {
        if (!model.is_answering()) {
            input.blur()
            setTimeout(() => {
                is_expanded = true
                navigation.classList.add("expanded")
                ui.show(tools)
                ui.hide(scroll, title)
            }, 500)
        }
    }
    
    expand.onclick = () => (is_expanded ? collapsed() : expanded())
    
    scroll.onclick = () => {
        autoscroll = model.is_answering()
        ui.hide(scroll)
        layout_and_render().then(scroll_to_bottom)
    }
    
    let last_key_down_time = 0
    
    input.onkeydown = e => {
        let s = input.innerText.trim()
        if (detect.macOS && s !== "" && e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            input.innerHTML = ""
            ui.hide(send)
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
    
    input.onblur = () => { // focus lost
        ui.show(expand, restart)
        scroll_show_hide()
//      document.body.style.overflow = ""
        if (chat.messages.length == 0 && input.innerText.trim() === "") {
            suggestions.show()
        }
    }
    
    input.onfocus = () => {
        ui.hide(scroll, expand, restart)
        suggestions.hide()
//      document.body.style.overflow = "hidden"
        collapsed()
    }
    
    input.oninput = () => {
        const answering = model.is_answering()
        let s = input.innerText
        if (s !== "") suggestions.hide()
        ui.show_hide(s !== "", clear)
        ui.show_hide(answering, stop)
        ui.show_hide(!answering, send)
        ui.show_hide(interrupted, carry)
        const lines = input.innerText.split("\n").length
        input.style.maxHeight = lines > 1 ? window.innerHeight * 0.5 + "px" : ""
        scroll_show_hide()
    }

    const observer = new MutationObserver(input.oninput)
    
    observer.observe(input, { childList: true, subtree: true,
        characterData: true });

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
    }
    
    remove.onclick = () => {
        hide_menu()
        if (!selected) return
        let c = history.load_chat(selected)
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
        const c = selected === current ? chat : history.load_chat(selected)
        modal.rename_in_place(selected_item, c.title).then(new_name => {
            if (new_name && new_name !== c.title) {
                c.title = new_name
                history.save_chat(c)
                if (selected === current) {
                    chat = c
                    title.textContent = c.title
                }
                rebuild_list()
                render_messages()
                // bug in iOS input scroll back:
                collapsed()
                expanded()
            }
        })
    }
    
    share.onclick = () => {
        if (!selected) return
        hide_menu()
        const c = history.load_chat(selected)
        prompt("Copy chat data:", JSON.stringify(c))
        hide_menu()
    }
    
    get("font-increase").onclick = () => util.increase_font_size()
    get("font-decrease").onclick = () => util.decrease_font_size()
    
    const user_started_scrolling = () => {
        autoscroll = false
        if (chat && chat.messages && chat.messages.length > 0) {
            requestAnimationFrame(scroll_show_hide)
            if (is_scrolling()) scroll_to_bottom_cancel()
        }
    }
    
    messages.addEventListener("mousedown",  user_started_scrolling, { passive: true })
    messages.addEventListener("wheel",      user_started_scrolling)

    document.querySelectorAll(".tooltip").forEach(button => {
        button.addEventListener("mouseenter", function() {
            let rect = this.getBoundingClientRect()
            if (rect.top < 30) { // If too close to the top, move tooltip below
                this.classList.add("tooltip-bottom")
            } else {
                this.classList.remove("tooltip-bottom")
            }
        }, { passive: true })
    })
    
    const caret_to_end = () => {
        const range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
    
    suggest.innerHTML = suggestions.init({
        data: prompts.data,
        callback: s => {
            interrupted = false;
            input.innerText = s.prompt
            input.oninput()
            suggestions.hide()
            input.focus()
            caret_to_end()
        }
    })
    
    let touch_start_x = 0;
    let touch_end_x = 0;
    document.addEventListener('touchstart', (e) => {
        touch_start_x = e.changedTouches[0].screenX;
    }, false);
    
    document.addEventListener('touchend', (e) => {
        touch_end_x = e.changedTouches[0].screenX;
        swipe();
    }, false);

    function swipe() {
        const dx = touch_end_x - touch_start_x;
        const threshold = window.innerWidth / 4;
        if (Math.abs(dx) > threshold) {
            if (dx > 0 && !navigation.classList.contains('expanded')) {
                expanded();
            } else if (dx < 0 && navigation.classList.contains('expanded')) {
                collapsed();
            }
        }
    }
    
    const licenses = () => {
        modal.show(util.load("./licenses.md"), (action) => {
        }, "OK")
    }

    let version_app  = "25.02.24" // application version
    // data version should be changed only of scheme needs to be wiped out
    let version_data = "25.02.22" // data scheme version

    const showEULA = () => {
//      localStorage.removeItem("app.eula") // DEBUG
        if (!localStorage.getItem("app.eula")) {
//          localStorage.clear() // no one promissed to keep data forever
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
        console.log("version.data: " + v + " version_data: " + version_data)
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

    input.oninput()
}

export const inactive = () => {
    if (chat) history.save_chat(chat)
    return "done"
}

export const debugger_attached = (attached) => {
//  console.log(`debugger_attached(): ${attached}, typeof: ${typeof attached}`)
    if (typeof attached === "string") attached = (attached === "true")
    util.set_debugger_attached(attached);
    if (!attached) {
        if (detect.macOS) document.body.oncontextmenu = e => e.preventDefault()
//      console.log("debugger_attached: disabling context menu")
    }
    return attached ? "conext menu enabled" : "conext menu disabled"
}

window.app = { run: run, inactive: inactive, debugger_attached: debugger_attached }

model.initialized()
