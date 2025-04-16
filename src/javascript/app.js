"use strict"

import * as detect      from "./detect.js"
import * as history     from "./history.js"
import * as markdown    from "./markdown.js"
import * as marked      from "./marked.js"
import * as modal       from "./modal.js"
import * as model       from "./model.js"
import * as prompts     from "./prompts.js"
import * as scroll      from "./scroll.js"
import * as suggestions from "./suggestions.js"
import * as util        from "./util.js"
import * as ui          from "./ui.js"

const nbsp4 = "    " // 4 non-breakable spaces

const get = id => document.getElementById(id)

const layout_and_render = () => {
    /* "double rAF" is the usual way to ensure the browser
       has actually laid out (and often painted) before the
       second callback runs */
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
    })
}

let chat = null // **the** chat

export const run = () => { // called DOMContentLoaded
    const
    box          = get("box"),
    content      = get("content"),
    discuss      = get("discuss"),
    expand       = get("expand"),
    header       = get("header"),
    input        = get("input"),
    layout       = get("layout"),
    list         = get("list"),
    menu         = get("menu"),
    messages     = get("messages"),
    navigation   = get("navigation"),
    search       = get("search"),
    remove       = get("remove"),
    rename       = get("rename"),
    spawn        = get("spawn"),
    stop         = get("stop"),
    carry        = get("carry"),
    clear        = get("clear"),
    send         = get("send"),
    strut        = get("strut"),
    share        = get("share"),
    shred        = get("shred"),
    suggest      = get("suggest"),
    talk         = get("talk"),
    title        = get("title"),
    tools        = get("tools"),
    toggle_theme = get("toggle_theme")
    
    // TODO:
    // visiblility (hidden) and display none state management is from HELL
    // It was Q&D hack on spur of the moment. Need to subscribe to state
    // changes and update all visibility in one place.
    // Maybe also need "disabled" state for some buttons
    
    let load_timestamp = util.timestamp()
    let current  = null // current  chat id
    let selected = null // selected chat id
    let interrupted = false  // output was interrupted
    let is_expanded = false  // navigation pane expanded
    let selected_item = null // item in chats list
    
    let scrollable = scroll.scroll_create_wrapper(messages,
                                                  model.is_answering, false)
    
    document.addEventListener("copy", e => {
        e.preventDefault()
        const s = window.getSelection().toString()
        e.clipboardData.setData("text/plain", s)
    })
    
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
        if (chat.messages.length === 0) {
//          if (input !== document.activeElement) { suggestions.show() }
            return
        }
        ui.hide(discuss)
        suggestions.hide()
        // this is optimization because markdown rendering is slow
        let i = 0
        chat.messages.forEach(msg => {
            if (i > messages.childNodes.length - 1) {
                messages.appendChild(render_message(msg))
            }
            i++;
        })
    }
    
    const render_last = (chunk) => {
        if (!chat || !chat.messages || chat.messages.length === 0) { return }
        const last_index = chat.messages.length - 1
        const last_msg = chat.messages[last_index]
        // Get last child element (assumed to be the last message).
        const last_child = messages.lastElementChild
        last_msg.text += chunk
        last_msg.text = util.substitutions(last_msg.text)
        if (last_child && last_msg.sender === "user") {
            messages.appendChild(render_message(last_msg))
        } else if (last_child && last_msg.sender === "bot") {
            const processed = (html, error) => {
                if (error) {
                    console.error(error)
                } else {
                    last_child.innerHTML = html
                }
                if (markdown.queue.length > 0) {
                    requestAnimationFrame(() => markdown.post("", processed))
                }
            }
            markdown.post(chunk, processed)
        } else {
            messages.appendChild(render_message(last_msg))
        }
    }
    
    const load = (c) => {
        ui.hide(carry)
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
            scrollable.scroll_to_bottom()
            layout_and_render().then(() => {
                model.run(c.id) // slowest
                load_timestamp = util.timestamp
            })
        })
    }
    
    const list_item = (c) => {
        const div = document.createElement("div")
        div.className = "item"
        if (c.id === current) { div.classList.add("selected") }
        div.onclick = e => {
            e.preventDefault()
            selected = null
            collapsed()
            hide_menu()
            if (current !== c.id) { load(c) }
            search.innerText = ""
        }
        const span = document.createElement("span")
        span.textContent = c.title
        const dots = document.createElement("button")
        dots.textContent = '⋮' // aka '&vellip;' alternative "⋯"
        dots.onclick = e => {
            e.stopPropagation()
            selected = c.id;
            selected_item = span
            show_menu(e.pageX / 2, e.pageY)
            search.innerText = ""
        }
        div.append(span, dots)
        list.appendChild(div)
    }
    
    const rebuild_list = () => history.generate(list, search, list_item)
    
    const spawn_new_conversation = () => {
        // already have new empty chat?
        if (chat && chat.messages && chat.messages.length === 0) {
            suggestions.cycle()
            return
        }
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
        ui.hide(carry, send)
        ui.show(discuss)
        set_title('')
        history.save_chat(chat)
        collapsed()
        rebuild_list()
        messages.innerText = ""
        render_messages()
        suggestions.show()
        placeholder()
        layout_and_render().then(() => model.run('+' + id))
        load_timestamp = util.timestamp
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
            load_timestamp = util.timestamp
            messages.innerHTML = ""
            render_messages()
            rebuild_list()
        } else {
            spawn_new_conversation()
        }
    }
    
    const followup = [
        "Want to dig deeper?",
        "Need more details?",
        "Want to explore this further?",
        "Care to dive deeper?",
        "Shall we go further?",
        "Want to keep talking about this?",
        "Let’s keep going…"
    ]
    
    const placeholder = () => {
        let ph = ""
        if (model.is_answering()) {
            ph = "▣ stop"
        } else if (chat.messages.length > 0) {
            ph = followup[util.random_int(0, followup.length - 1)]
        } else if (!detect.macOS) {
            ph = "Ask anything..."
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
        if (s === '' || s === 'GyPTix') {
            set_title(s)
            title.classList.remove("shimmering")
            title.classList.add("rainbow")
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
        }
    }
    
    const done = () => {
        scrollable.autoscroll = false
//      console.log("autoscroll := " + scrollable.autoscroll)
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
        ui.show(expand, spawn)
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
        scrollable.autoscroll = true
//      console.log("autoscroll := " + scrollable.autoscroll)
        ui.show(stop)
        ui.hide(send, expand, spawn)
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
        modal.toast("<p>Oops<br>" +
                    "Fatal Error", 5000)
        setTimeout(() => { model.quit() }, 5100)
    }

    const ask = t => { // 't': text
        if (!current || !t) { return }
        if (!model.is_running()) { oops() }
        chat.messages.push({ sender: "user", text: t })
        chat.messages.push({ sender: "bot",  text: "" })
        history.save_chat(chat)
        render_messages()
        scrollable.scroll_to_bottom()
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
            if (new_y < 0) { new_y = 0 }
        }
        y = new_y
        menu.style.left = x + "px"
        menu.style.top  = y + "px"
    }
    
    const hide_menu = () => ui.hide(menu)
    
    toggle_theme.onclick = e => {
        e.preventDefault()
        util.toggle_theme()
    }
    
    send.onclick = e => {
        e.preventDefault()
        let s = input.innerText.trim()
        // if we did not achive running state in 10 seconds since load time
        let since = util.timestamp() - load_timestamp // ms
        if (!model.is_running() && since > 10000) { oops() }
        if (model.is_running() && !model.is_answering() && s !== "") {
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
        e.preventDefault()
        input.innerText = ""
        placeholder()
        layout_and_render().then(() => {
            if (chat.messages.length === 0) { suggestions.show() }
        })
    }
    
    carry.onclick = e => {
        e.preventDefault()
        interrupted = false
        ui.hide(carry)
        ask("carry on")
    }
    
    spawn.onclick = e => {
        e.preventDefault()
        if (model.is_running() && !model.is_answering()) {
            spawn_new_conversation()
        }
    }
    
    const erase = () => {
        collapsed()
        const keys = Object.keys(localStorage).filter(k => k.startsWith("chat."))
        keys.forEach(k => localStorage.removeItem(k))
        model.erase()
        current = null
        rebuild_list()
        spawn_new_conversation()
    }
    
    shred.onclick = e => {
        e.preventDefault()
        hide_menu()
        modal.ask("### **Erase All Chat History**  \n" +
                  "For your privacy and storage<br>" +
                  "efficiency, wiping everything<br>" +
                  "clean and shredding the data<br>" +
                  "might be a good idea. *Recycle*<br>" +
                  "*the ellectrons!* But...\n\n" +
                  "**This action is irreversible.**",
        (action) => {
            if (action === "Delete") { erase() }
        },
        "Cancel", "<red>Delete</red>")
    }
    
    const collapsed = () => {
        if (is_expanded) {
            modal.modal_off()
            is_expanded = false
            navigation.classList.remove("expanded")
            ui.hide(tools)
            ui.show(title)
            hide_menu()
        }
    }
    
    const expanded = () => {
        if (!model.is_answering() && !is_expanded) {
            modal.modal_on()
            if (document.activeElement === input) {
                input.blur()
                setTimeout(() => {
                    is_expanded = true
                    navigation.classList.add("expanded")
                }, 500)
            } else {
                is_expanded = true
                navigation.classList.add("expanded")
            }
            setTimeout(() => {
                ui.show(tools)
                ui.hide(title)
            }, 333)
        }
    }
    
    expand.onclick = e => {
        e.preventDefault()
        if (is_expanded) { collapsed() } else { expanded() }
    }
    
    const height_with_margins = (e) => {
        const s = getComputedStyle(e);
        const mt = parseFloat(s.marginTop)    || 0;
        const mb = parseFloat(s.marginBottom) || 0;
        const h = e.offsetHeight + mt + mb;
//      console.log("height_with_margins(): " + h + " mt: " + mt + " mb: " + mb);
        return h
    }
    
    const set_box_top = () => {
        const top = (window.visualViewport.height - height_with_margins(box))
        box.style.setProperty('--data-top', `${top}px`);
    }

    let move_box = false

    input.onblur = () => { // focus lost
        if (detect.macOS) { return }
        move_box = false
        if (chat.messages.length === 0 && input.innerText.trim() === "") {
            suggestions.show()
        }
        input.contentEditable = "false"
        talk.style.marginBottom = talk.dataset.marginBottom
    }

    const viewport = (e) => {
        if (!move_box) { return }
//      console.log("e.type: " + e.type)
        set_box_top()
        box.style.opacity = "1"
        talk.style.marginBottom = `${height_with_margins(box)}px`
    }

    window.visualViewport.addEventListener('resize', viewport);
    window.visualViewport.addEventListener('scroll', viewport);

    input.onclick = () => {
        if (document.activeElement === input) { return }
        if (detect.macOS) { return }
//      suggestions.hide()
        talk.dataset.marginBottom = `${getComputedStyle(talk).marginBottom}`
        collapsed()
        box.style.opacity = "0"
        move_box = true
        input.contentEditable = "plaintext-only"
        input.focus()
    }

    input.onfocus = () => suggestions.hide()

    if (detect.macOS) {
        input.contentEditable = "plaintext-only"
    }

    input.oninput = () => {
        const answering = model.is_answering()
        let s = input.innerText
        if (s === '\n') { s = "" } // empty div has '\n'
        if (s !== "") { suggestions.hide() }
        const clear_and_send = s !== "" && !answering;
        ui.show_hide(clear_and_send, clear, send)
        ui.show_hide(answering,  stop)
        ui.show_hide(!clear_and_send && !interrupted, strut)
        ui.show_hide(interrupted && !answering && !clear_and_send,  carry)
        const lines = input.innerText.split("\n").length
        input.style.maxHeight = lines > 1 ? window.innerHeight * 0.5 + "px" : ""
        set_box_top()
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
                if (sel) { sel.removeAllRanges() }
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
        if (s.length > 0) { suggestions.hide() }
        last_key_down_time = Date.now()
    }
    
    
    const observer = new MutationObserver(input.oninput)
    
    observer.observe(input, { childList: true, subtree: true,
        characterData: true });

    content.onclick = e => {
        if (is_expanded) {
            if (!e.target.closest("#menu")) {
                hide_menu()
            }
            if (e.target.closest("#content") || e.target.closest("#input")) {
                collapsed()
            }
            e.preventDefault()
        }
    }

    const delete_chat = () => {
        if (!selected) { return }
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
    
    remove.onclick = e => {
        e.preventDefault()
        hide_menu()
        if (!selected) { return }
        let c = history.load_chat(selected)
        modal.ask("# **Delete Chat**\n\n" +
                  '"' + c.title + '"\n\n' +
                  "This cannot be undone.",
        (action) => {
            if (action === "Delete") { delete_chat() }
        },
            "Cancel", "<red>Delete</red>")
    }
    
    let unfreezing = null
    
    const freeze = () => {
        if (!detect.iOS || detect.macOS) { return }
        if (unfreezing) {
            clearTimeout(unfreezing)
            unfreezing = null
        }
        navigation.dataset.freeze = "true"
        console.log("navigation.dataset.freeze")
    }
    
    const unfreeze = () => {
        if (!detect.iOS || detect.macOS) { return }
        if (!unfreezing) {
            unfreezing = setTimeout(() => {
                delete navigation.dataset.freeze
                console.log("navigation.dataset.unfreeze")
                unfreezing = null
            }, 500)
        }
    }
    
    rename.onclick = e => {
        if (!selected) { return }
        e.preventDefault()
        hide_menu()
        const c = selected === current ? chat : history.load_chat(selected)
        modal.rename_in_place(selected_item, freeze, unfreeze).then(name => {
            if (name && name !== c.title) {
                c.title = name
                history.save_chat(c)
                if (selected === current) {
                    chat = c
                    title.textContent = c.title
                }
                rebuild_list()
                render_messages()
            }
        })
    }
    
    share.onclick = e => {
        if (!selected) { return }
        e.preventDefault()
        hide_menu()
        const c = history.load_chat(selected)
        console.log("TODO Copy chat data:", JSON.stringify(c))
        hide_menu()
    }
    
    get("font-increase").onclick = e => {
        e.preventDefault()
        util.increase_font_size()
    }
    get("font-decrease").onclick = e => {
        e.preventDefault()
        util.decrease_font_size()
    }
    
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
                // This interfereces with user press and hold selection on iOS
                //              expanded();
                // If 'swipe right' gesture is still desired it would be
                // necessary to detect if selection is expanding now and
                // ignore it in that case.
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
                                  // data version should be changed
                                  // only of scheme needs to be wiped out
    let version_data = "25.02.22" // data scheme version
    
    const showEULA = () => {
//      localStorage.removeItem("app.eula") // DEBUG
        if (!localStorage.getItem("app.eula")) {
//          localStorage.clear() // no one promissed to keep data forever
            modal.show(util.load("./eula.md"), (action) => {
                if (action === "Disagree") {
                    localStorage.removeItem("app.eula")
                    model.quit()
                } else {
                    localStorage.setItem("app.eula", "true")
                    localStorage.setItem("version.data", version_data)
                    licenses()
                }
            }, "<red>Disagree</red>",
               "<green>" + nbsp4 + "Agree" + nbsp4 + "</green>"
            )
        }
    }
    
    get("info").onclick = e => {
        e.preventDefault()
        collapsed()
        licenses()
    }
    
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
    history.init_search(search, freeze, unfreeze)
    ui.hide(tools)
    
    spawn_new_conversation() // alternatively recent() can load and continue
    placeholder()

    send.title = "Submit"
    stop.title = "Stop"
    clear.title = "Clear"
    
    showEULA()
    
    suggestions.show()
    input.oninput()

    const test_download = false // WIP
    
    if (test_download) { download_testing() }
}

export const downloaded = (file, error) => {
    console.log("downloaded\nfile: " + file + "\nerror: " + error)
}

export const inactive = () => {
    if (chat) { history.save_chat(chat) }
    return "done"
}

export const debugger_attached = (attached) => {
//  console.log(`debugger_attached(): ${attached}, typeof: ${typeof attached}`)
    if (typeof attached === "string") { attached = (attached === "true") }
    util.set_debugger_attached(attached);
    if (!attached) {
        if (detect.macOS) {
//          console.log("debugger_attached: disabling context menu")
            document.body.oncontextmenu = e => e.preventDefault()
        }
    }
    return attached ? "conext menu enabled" : "conext menu disabled"
}

export const download = (url, file, percent, error, done, json) => {
//  console.log("urk: " + url)
//  console.log("file: " + file)
//  console.log("percent: " + percent)
//  console.log("error: " + error)
//  console.log("done: " + done)
//  console.log("json: " + json)
    if (error && error !== "") {
        console.log("failed. removing...")
        model.download_remove(url)
        console.log("removed.")
    }
    const a = JSON.parse(json)
    for (const i of a) {
        const url  = i.url
        const file = i.filename
        // Display clean, readable values
        console.log("URL:", url)
        console.log("File:", file)
        /* Or inject into DOM
        const div = document.createElement("div")
        div.textContent = `📂 ${file}\n🌐 ${url}`
        document.body.appendChild(div)
        */
        model.download_remove(url) // temporarely: not to grow the table
    }
}

// macOS sandbox:
// ls -alR /Users/leo/Library/Containers/io.github.leok7v.gyptix/Data/Library/Caches/
// rm -rf /Users/leo/Library/Containers/io.github.leok7v.gyptix

const download_testing = () => {
    const origin = "https://github.com/leok7v/gyptix/releases/download/2025-01-25/"
    const file  = "granite-3.1-1b-a400m-instruct-Q8_0.gguf"
    const r = model.download(origin + file)
    console.log("model.download(): " + r)
}

window.app = { run: run, inactive: inactive,
               debugger_attached: debugger_attached,
               download: download }

model.initialized()

// https://huggingface.co/ibm-research/granite-3.2-8b-instruct-GGUF/tree/main
// https://huggingface.co/ibm-research/granite-3.2-8b-instruct-GGUF/resolve/main/granite-3.2-8b-instruct-f16.gguf
// 8.68GB

// https://huggingface.co/ibm-research/granite-3.2-2b-instruct-GGUF/tree/main
// https://huggingface.co/ibm-research/granite-3.2-2b-instruct-GGUF/resolve/main/granite-3.2-2b-instruct-Q8_0.gguf
// 2.69GB

// Multimodal (images understanding and generation)
// https://huggingface.co/deepseek-ai/Janus-Pro-1B
// https://huggingface.co/mradermacher/Janus-Pro-1B-LM-GGUF
// https://huggingface.co/mradermacher/Janus-Pro-1B-LM-GGUF/resolve/main/Janus-Pro-1B-LM.Q8_0.gguf
// 1.76GB

// DeepSeek R1 (All Versions)
// https://huggingface.co/collections/unsloth/deepseek-r1-all-versions-678e1c48f5d2fce87892ace5

// https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF
// https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q8_0.gguf
// 1.89GB

// https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF
// https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q8_0.gguf
// 8.1GB

// https://huggingface.co/unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF
// https://huggingface.co/unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q8_0.gguf
// 8.54GB

// https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF
// https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-14B-Q8_0.gguf
// 15.7GB

// https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF/tree/main
// https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-32B-Q8_0.gguf
// 34.8GB

// Gemma 3
// https://huggingface.co/collections/unsloth/gemma-3-67d12b7e8816ec6efa7e4e5b

// https://huggingface.co/unsloth/gemma-3-1b-it-GGUF
// https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q8_0.gguf
// 1.05GB

// https://huggingface.co/unsloth/gemma-3-4b-it-GGUF
// https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q8_0.gguf
// 4.0GB

// https://huggingface.co/unsloth/gemma-3-12b-it-GGUF
// https://huggingface.co/unsloth/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-Q8_0.gguf
// 11.9GB

// https://huggingface.co/unsloth/gemma-3-27b-it-GGUF
// https://huggingface.co/unsloth/gemma-3-27b-it-GGUF/resolve/main/gemma-3-27b-it-Q8_0.gguf
// 27.7GB

/*

TODO: investigate

Claude 3 Model Family:
Claude 3 Haiku:
    Optimized for speed and affordability,
    making it suitable for lightweight tasks.
Claude 3 Sonnet:
    Balances capability and performance, well-suited for enterprise
    tasks and large-scale deployments.
Claude 3 Opus:
    The most powerful model, designed for complex reasoning tasks and
    demonstrating enhanced abilities in areas like mathematics, programming,
    and logical reasoning

*/

/*
   R&D:

   https://github.com/rswier/c4
   try to force coding models to extend it to full c99 language
   and automatic .DLL .so binding
   
   Could be fun.
   
*/
