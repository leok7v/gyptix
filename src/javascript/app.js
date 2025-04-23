"use strict"

import * as algo        from "./algo.js"
import * as backend     from "./backend.js"
import * as detect      from "./detect.js"
import * as history     from "./history.js"
import * as llm         from "./llm.js"
import * as markdown    from "./markdown.js"
import * as marked      from "./marked.js"
import * as modal       from "./modal.js"
import * as prompts     from "./prompts.js"
import * as scroll      from "./scroll.js"
import * as suggestions from "./suggestions.js"
import * as text        from "./text.js"
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
        share        = get("share"),
        shred        = get("shred"),
        suggest      = get("suggest"),
        talk         = get("talk"),
        title        = get("title"),
        tools        = get("tools"),
        toggle_theme = get("toggle_theme")
        
    let load_timestamp = util.timestamp()
    let current        = null  // current  chat id
    let selected       = null  // selected chat id
    let is_expanded    = false // navigation pane expanded
    let selected_item  = null  // item in chats list
    let interrupted    = false // answer generation was interrupted by **user**
    let suggested      = false // suggestion used

    let model = llm.create()
    
    let scrollable = scroll.scroll_create_wrapper(messages,
                                                  backend.is_answering, false)

    const is_input_focused = () => document.activeElement === input

    const update_buttons = () => {
        let s = input.innerText
        if (s === '\n') { s = "" } // empty div has '\n'
        const empty = s === ""
//      console.log(`empty: ${empty} polling: ${model.polling} interrupted: ${interrupted}`)
        const show_clear = !empty && !model.polling && suggested
        const show_carry = !show_clear && interrupted
        ui.show_hide(show_clear, clear)
        ui.show_hide(show_carry, carry)
        ui.show_hide(model.polling, stop)
        ui.show(send) // always
        ui.show_hide(!model.polling, expand, spawn)
        const running = backend.is_running() // about 1ms roundtrip
        if (!running) {
            ui.disable(send)
            clearTimeout(check_running)
            check_running = setTimeout(wait_for_running, 100)
        } else {
            ui.enable_disable(!empty && !model.polling, send)
        }
    }

    document.addEventListener("copy", e => {
        e.preventDefault()
        const s = window.getSelection().toString()
        e.clipboardData.setData("text/plain", s)
    })
    
    const normalize_line_breaks_to_spaces = (text) => {
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
            if (i > messages.childNodes.length - 1 && !msg.hidden) {
                messages.appendChild(render_message(msg))
            }
            i++;
        })
    }

    const interrupt = () => {
        model.interrupt()
        placeholder()
        update_buttons()
    }

    const count_dups = (s, d) => {
        let n = 0;
        for (let i = s.indexOf(d); i !== -1; i = s.indexOf(d, i + d.length)) {
            n++
        }
        return n
    }

    let check_for_repetitions_count = 0

    const check_for_repetitions_and_stop = () => {
        if (chat.messages.length < 1) { return }
        const s = chat.messages[chat.messages.length - 1].text
        if (s.length < 1024) { return } // start checking at 1KB
        check_for_repetitions_count++
        // check after 128 appends
        if (check_for_repetitions_count % 128 != 0) { return }
        const d = algo.longest_duplicate_substring(s)
        if (d.length > 48) {
            const c = count_dups(s, d)
//          console.log(`duplicate string found: (${c}) ${d.length}:"${d}"`)
            if (c > 2 || d.length > 64) { requestAnimationFrame(interrupt) }
        }
    }

    const append_chunk = (chunk) => {
        if (!chat || !chat.messages || chat.messages.length === 0) { return }
        const last_index = chat.messages.length - 1
        const last_msg = chat.messages[last_index]
        // Get last child element (assumed to be the last message).
        const last_child = messages.lastElementChild
        last_msg.text += chunk
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
                backend.run(c.id) // slowest
                load_timestamp = util.timestamp()
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
        const t = c.title !== "" ? c.title : text.timestamp_label(c.id)
        span.textContent = t
        const dots = document.createElement("button")
        dots.textContent = '⋮' // aka '&vellip;' alternative "⋯"
        dots.onclick = e => {
            e.stopPropagation()
            selected = c.id;
            selected_item = span
            show_menu(e.pageX / 2, e.pageY)
            search.innerText = ""
        }
        dots.title = "Menu"
        div.append(span, dots)
        list.appendChild(div)
    }
    
    const rebuild_list = () => history.generate(list, search, list_item)
    
    const spawn_new_conversation = () => {
        suggestions.show()
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
            title: "", // rendered as text.timestamp_label(id)
            messages: []
        }
        ui.hide(carry)
        ui.show(discuss)
        set_title('')
        history.save_chat(chat)
        collapsed()
        rebuild_list()
        messages.innerText = ""
        render_messages()
        suggestions.show()
        placeholder()
        layout_and_render().then(() => backend.run('+' + id))
        load_timestamp = util.timestamp()
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
            backend.run(most_recent.id)
            load_timestamp = util.timestamp()
            messages.innerHTML = ""
            render_messages()
            rebuild_list()
        } else {
            spawn_new_conversation()
        }
    }
    
    const followup = [
        "Want to dig deeper? Let's discuss…",
        "Need more details?",
        "Want to explore this further?",
        "Want to keep talking about this? Ask more questions…",
        "Let’s keep going…"
    ]

    const set_input_placeholder = (s) => {
        // double quotes improtant for css variable inside value
        input.style.setProperty("--placeholder", `"${s}"`)
    }
    
    const placeholder = () => {
        let ph = ""
        if (chat.messages.length > 0 && !model.polling) {
            ph = followup[util.random_int(0, followup.length - 1)]
        } else if (!detect.macOS) {
            ph = "Ask anything..."
        } else {
            ph = "Ask anything... Use ⇧⏎ for line break"
        }
        set_input_placeholder(ph)
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
    
    const trim_interrupted = () => {
        const last_index = chat.messages.length - 1
        const last_msg = chat.messages[last_index]
        let i = last_msg.text.lastIndexOf('.')
        if (i != -1 && i > last_msg.text.length - 256) {
            const is_digit       = (ch) => ch >= '0' && ch <= '9';
            const is_whitespace  = (ch) => /\s/.test(ch);
            while (i > 0 && i > last_msg.text.length - 256) {
                const ch = last_msg.text[i - 1];
                if (!(is_digit(ch) || is_whitespace(ch))) { break; }
                i--;
            }
            last_msg.text = last_msg.text.slice(0, i + 1)
//          console.log(`last_msg.text: ${last_msg.text}`)
            const html = marked.parse(last_msg.text)
            messages.lastElementChild.innerHTML = html
        }
        scrollable.scroll_to_bottom()
    }

    const generate_title = (done) => {
        ui.hide(stop)
        set_input_placeholder('')
        const prompt =
            "[otr:32]Write concise title for the preceding conversation.\n" +
            "Reply only with the title in plain-text.\n[/otr]"
        model.start(prompt,
            model => { }, // per-token callback
            model => { // completion callback
                const dt = performance.now() - model.started
//              console.log(`generate_title: ${dt.toFixed(1)} ms`)
                let t = text.long_title(model.result.join(''))
//              console.log(`long_title(): "${t}":${t.length}`)
                chat.subject = t // TODO: make use of (scrolling line on progress)
                let title = text.short_title(t, 32)
                if (model.error) {
                    console.error(model.error)
                    let s = `${model.error.name}:\n${model.error.message}`
                    modal.mbx(s, () => {}, "Dismiss")
                } else {
//                  console.log(`generate_title: .cps ${model.cps.toFixed(1)} ` +
//                              `.title: ${model.result.join("")}`)
                }
                done(title)
            },
            128 // max characters
        )
    }
    
    const complete = () => {
        input.oninput()
        chat.timestamp = util.timestamp()
        stop.classList.remove("pulsing")
        placeholder()
        ui.show(expand, spawn)
        title.innerHTML = chat.title
    }

    const bot_messages_total_length = () => {
        let total_length = 0
        for (let i = 0; i < chat.messages.length; i++) {
            if (chat.messages[i].sender === "bot") {
                total_length += chat.messages[i].text.length
            }
        }
        return total_length
    }

    const end_of_generation = () => {
        // because model.interrupted will be reset to false by title generation
        interrupted = model.interrupted
        update_buttons()
        scrollable.autoscroll = false
//      console.log(`scrollable.autoscroll := ${scrollable.autoscroll}`)
        if (interrupted) { setTimeout(trim_interrupted, 250) }
//      console.log(`chat.title: ${chat.title} bot_messages_total_length: ${bot_messages_total_length()}`)
        if (chat.title !== "" || bot_messages_total_length() < 256) {
            complete()
        } else {
            generate_title((s) => {
                title.innerHTML = ""
                chat.title = s
                if (chat.title === "") {
                    chat.title = text.summarize(chat.messages[0].text + " " +
                                                chat.messages[1].text)
                }
                title.innerHTML = chat.title
                set_chat_title(chat.title)
                history.save_chat(chat)
                rebuild_list()
                complete()
            })
        }
    }
    
    const oops = () => {
        modal.toast("<p>Oops<br>" +
                    "Fatal Error", 5000)
        setTimeout(() => { backend.quit() }, 5100)
    }

    const poll = (model, context) => {
        if (context.count == 0) { update_buttons() } // first poll
        context.count++
        if (!markdown.processing) {
            if (performance.now() - context.last > 1500) {
                context.cycle = cycle_titles(context.cycle)
                context.last = performance.now()
            }
            append_chunk(model.tokens)
            check_for_repetitions_and_stop()
        }
    }

    const ask = (t, hidden) => { // 't': text
        interrupted = false
        ui.hide(carry, clear)
        if (!current || !t) { return }
        if (!backend.is_running()) { oops() }
        let h = hidden ? hidden : false
        chat.messages.push({ sender: "user", text: t, hidden: h })
        chat.messages.push({ sender: "bot",  text: "", hidden: false })
        history.save_chat(chat)
        render_messages()
        setTimeout(scrollable.scroll_to_bottom, 500)
        layout_and_render().then(() => { // render before asking
            scrollable.autoscroll = true
//          console.log(`scrollable.autoscroll := ${scrollable.autoscroll}`)
            stop.classList.add("pulsing")
            markdown.start()
            cycle_titles(0)
            let context = {
                last: performance.now(),
                count: 0,
                cycle: 1
            }
            model.start(t,
                model => {
//                  console.log(model.tokens)
                    if (performance.now() - model.started > 1500) {
                        set_input_placeholder('')
                    }
                    poll(model, context)
                },
                model => { // completion callback
//                  console.log(`.cps ${model.cps} .result: ${model.result.join("")}`)
                    end_of_generation()
                    if (model.error) {
                        console.error(model.error)
                        let s = `${model.error.name}:\n${model.error.message}`
                        modal.mbx(s, () => {}, "Dismiss")
//                  } else {
//                      console.log(`.cps: ${model.cps} .ewma: ${model.ewma}`)
                    }
                })
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
        ui.toggle_theme()
    }
    

    const send_click = (e) => {
        e.preventDefault()
        let s = input.innerText.trim()
        // if we did not achive running state in 10 seconds since load time
        let since = util.timestamp() - load_timestamp // ms
        if (!backend.is_running() && since > 10000) { oops() }
        if (backend.is_running() && !backend.is_answering() && s !== "") {
            collapsed()
            ui.hide(carry, clear)
            input.innerHTML = ""
            ui.hide(send)
            set_title('')
            set_input_placeholder('')
            input.blur()
            layout_and_render().then( () => ask(s) )
        }
    }

    const clear_click = (e) => {
        e.preventDefault()
        input.innerHTML = ''
        placeholder()
        layout_and_render().then(() => {
            clear_selection()
            suggestions.show()
        })
    }

    const start_input = () => {
        collapsed()
        if (is_input_focused() || model.polling) { return }
        if (!detect.macOS) {
            box.style.opacity = "0"
            move_box = true
        }
        input.contentEditable = "plaintext-only"
        input.oninput()
        input.focus()
    }

    const box_touch = (e) => {
        hide_menu()
        if (is_expanded) { collapsed() }
    }

    if (detect.macOS) {
        send.addEventListener("click",       send_click,  { passive: false } )
        clear.addEventListener("click",      clear_click, { passive: false } )
        box.addEventListener("click",        start_input, { passive: false } )
    } else {
        send.addEventListener("touchstart",  send_click,  { passive: false } )
        clear.addEventListener("touchstart", clear_click, { passive: false } )
        box.addEventListener("touchstart",   box_touch,   { passive: true  } )
    }
    
    stop.onclick = e => {
        e.preventDefault()
        ui.hide(stop)
        let s = input.innerText.trim()
        if (model.polling) { interrupt() }
    }

    carry.onclick = e => {
        e.preventDefault()
        ui.hide(carry)
        ask("carry on", true) // hidden
    }
    
    spawn.onclick = e => {
//      console.log(`backend.is_running(): ${backend.is_running()} backend.is_answering(): ${backend.is_answering()}`)
        e.preventDefault()
        if (backend.is_running() && !backend.is_answering()) {
            spawn_new_conversation()
        }
    }
    
    const erase = () => {
        collapsed()
        const ks = Object.keys(localStorage).filter(k => k.startsWith("chat."))
        ks.forEach(k => localStorage.removeItem(k))
        backend.erase()
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
        if (!backend.is_answering() && !is_expanded) {
            modal.modal_on()
            if (is_input_focused()) {
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
            }, 150)
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
    
    let inset_bottom = null
    
    const safe_area_inset_bottom = () => {
        if (inset_bottom === null) {
            const root = document.documentElement
            const value = getComputedStyle(root)
                .getPropertyValue('--data-safe-area-inset-bottom')
                .trim()
//          console.log(`--data-safe-area-inset-bottom: ${value}`)
            inset_bottom = parseFloat(value) || 0 // '34px'
//          console.log(`inset_bottom: ${inset_bottom}`)
        }
        return inset_bottom
    }
    
    const set_box_top = () => {
        if (detect.macOS) { return }
        const top = (window.visualViewport.height - height_with_margins(box))
        box.style.setProperty('--data-top', `${top}px`);
//      console.log(`box.style.setProperty('--data-top', ${top}px)`);
        if (is_input_focused()) {
            const bh = height_with_margins(box)
            const kh = window.innerHeight - window.visualViewport.height
            const ib = safe_area_inset_bottom()
            const m = bh + kh - ib // box height + keyboard height - inset bottom
            talk.style.marginBottom = `${m}px`
//          console.log(`talk.style.marginBottom = ${m}px`)
        } else {
            talk.style.marginBottom = talk.dataset.marginBottom
//          console.log(`talk.style.marginBottom = ${talk.dataset.marginBottom}`)
        }
    }

    let move_box = false

    input.onfocus = () => { // focus gained
        if (input.textContent === "\n") { input.textContent = "" }
        suggestions.hide()
    }

    input.onblur = () => { // focus lost
        if (chat.messages.length === 0 && input.innerText.trim() === "") {
            suggestions.show()
        }
        if (!detect.macOS) {
            move_box = false
            input.contentEditable = "false"
            talk.style.marginBottom = talk.dataset.marginBottom
//          console.log(`talk.style.marginBottom = ${talk.dataset.marginBottom}`)
        }
    }

    const viewport = (e) => {
        if (!move_box || detect.macOS) { return }
        set_box_top()
        box.style.opacity = "1"
    }

    window.visualViewport.addEventListener('resize', viewport);
    window.visualViewport.addEventListener('scroll', viewport);

    input.onclick = start_input

    // save initial marginBottom
    talk.dataset.marginBottom = `${getComputedStyle(talk).marginBottom}`
//  console.log(`talk.dataset.marginBottom = ${getComputedStyle(talk).marginBottom}`)

    if (detect.macOS) {
        input.contentEditable = "plaintext-only"
    }

    let check_running = null

    const wait_for_running = () => {
        clearTimeout(check_running)
        check_running = null
        if (backend.is_running()) {
            update_buttons()
        } else {
            let since = util.timestamp() - load_timestamp // ms
            if (since > 10000) {
                oops()
            } else {
                check_running = setTimeout(wait_for_running, 100)
            }
        }
    }

    input.oninput = () => {
        update_buttons()
        input.style.maxHeight = `${window.innerHeight * 0.25}px`
        set_box_top()
    }
    
    let last_key_down_time = 0
    
    const clear_selection = () => {
        const sel = window.getSelection()
        if (sel) { sel.removeAllRanges() }
    }
    
    input.onkeydown = e => {
        suggested = false
        const lf = input.textContent === "\n"
        const empty = input.textContent === ""
        const enter = e.key === "Enter"
        const shift_enter = e.key === "Enter" && e.shiftKey
        if (detect.macOS && enter && (lf || empty)) {
            return // let the browser insert the '\n' for us
        }
        if (detect.macOS && shift_enter) {
            if (lf) { input.textContent = "" }
            return // let the browser insert the '\n' for us
        }
        let s = input.innerText.trim()
        if (detect.macOS && s !== "" && e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            input.innerHTML = ""
            ui.hide(send)
            layout_and_render().then(() => {
                clear_selection()
                ask(s)
            })
        }
        if (s.length > 0 && last_key_down_time !== 0) {
            setTimeout(() => {
                if (Date.now() - last_key_down_time > 1000) {
                    send.classList.add("pulsing")
                    setTimeout(() => send.classList.remove("pulsing"), 2000)
                }
            }, 3000)
        }
        if (s.length > 0) { suggestions.hide() }
        last_key_down_time = Date.now()
    }
    
    const observer = new MutationObserver(input.oninput)
    
    observer.observe(input,
        { childList:     true,
          subtree:       true,
          characterData: true
        }
    )

    messages.onclick = e => {
        if (!e.target.closest("#menu")) { hide_menu() }
        if (is_expanded) { collapsed() }
    }

    content.onclick = e => {
        if (!e.target.closest("#menu")) { hide_menu() }
        if (is_expanded) { collapsed() }
    }

    const delete_chat = () => {
        if (!selected) { return }
        localStorage.removeItem("chat.id." + selected)
        localStorage.removeItem("chat." + selected)
        backend.remove(selected)
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
//      console.log("navigation.dataset.freeze")
    }
    
    const unfreeze = () => {
        if (!detect.iOS || detect.macOS) { return }
        if (!unfreezing) {
            unfreezing = setTimeout(() => {
                delete navigation.dataset.freeze
//              console.log("navigation.dataset.unfreeze")
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
        hide_menu()
        ui.increase_font_size()
    }

    get("font-decrease").onclick = e => {
        e.preventDefault()
        hide_menu()
        ui.decrease_font_size()
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
            interrupted = false
            suggested = true
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
    
    const swipe = () => {
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
        modal.show(backend.load("./licenses.md"), (action) => {
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
            modal.show(backend.load("./eula.md"), (action) => {
                if (action === "Disagree") {
                    localStorage.removeItem("app.eula")
                    backend.quit()
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
    
    ui.init_theme()
    ui.init_font_size()
    history.init_search(search, freeze, unfreeze)
    ui.hide(tools)
    
    spawn_new_conversation() // alternatively recent() can load and continue
    placeholder()

    send.title = "Submit"
    stop.title = "Stop"
    clear.title = "Clear"
    
    showEULA()
    
    suggestions.show()
    update_buttons()

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
        backend.download_remove(url)
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
        backend.download_remove(url) // temporarely: not to grow the table
    }
}

// macOS sandbox:
// ls -alR /Users/leo/Library/Containers/io.github.leok7v.gyptix/Data/Library/Caches/
// rm -rf /Users/leo/Library/Containers/io.github.leok7v.gyptix

const download_testing = () => {
    const origin = "https://github.com/leok7v/gyptix/releases/download/2025-01-25/"
    const file  = "granite-3.1-1b-a400m-instruct-Q8_0.gguf"
    const r = backend.download(origin + file)
    console.log("backend.download(): " + r)
}

window.app = { run: run, inactive: inactive,
               debugger_attached: debugger_attached,
               download: download }

backend.initialized()

