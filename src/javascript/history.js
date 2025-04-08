"use strict"
// history.js — generates and groups chat history list items by recency

import * as modal       from "./modal.js"

export const key2id = key => parseInt(key.substring("chat.id.".length))

export const load_chat = id => {
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

export const save_failed = (c) => {
    modal.toast(error, 5000)
    localStorage.removeItem("chat.id." + c.id)
    localStorage.removeItem("chat." + c.id)
}

export const save_chat_header = (c) => {
    const header  = { id: c.id, title: c.title, timestamp: c.timestamp }
    try {
        localStorage.setItem("chat.id." + c.id, JSON.stringify(header))
    } catch (error) {
        console.log(error)
        save_failed(c)
    }
}

export const save_chat = (c) => {
    if (c.messages.length == 0) return // never save empty chats
    const header  = { id: c.id, title: c.title, timestamp: c.timestamp }
    try {
        localStorage.setItem("chat.id." + c.id, JSON.stringify(header))
        localStorage.setItem("chat." + c.id, JSON.stringify(c.messages))
    } catch (error) {
        console.log(error)
        save_failed(c)
    }
}

const start_of_day = days => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - days)
    return d
}

const start_of_month = months => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(1)
    d.setMonth(d.getMonth() - months)
    return d
}

const start_of_year = () => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(0)
    return d
}

const section_key = ts => {
    const d = new Date(ts)
    if (d >= start_of_day(0)) return ""
    if (d >= start_of_day(1)) return "Yesterday"
    if (d >= start_of_day(7)) return "Last Week"
    if (d >= start_of_month(1)) return "Last Month"
    if (d >= start_of_year()) {
        return d.toLocaleString("default", { month: "long" })
    }
    return String(d.getFullYear())
}

const test_list = timestamp => {
    const words = "Lorem ipsum dolor sit amet consectetur " +
                  "adipiscing elit sed".split(" ")
    const rand_title = () => {
        const r = () => words[Math.floor(Math.random() * words.length)]
        return `${r()} ${r()} ${r()}`
    }
    const save = (id, ts, title) => {
        const c = { id, timestamp: ts, title, messages: [], test: true }
        const h = { id, timestamp: ts, title }
        localStorage.setItem("chat.id." + id, JSON.stringify(h))
        localStorage.setItem("chat." + id, JSON.stringify([]))
    }
    const rand = n => Array.from({ length: n }, () => 0)
    const now = timestamp
    const next = () => now + Math.floor(Math.random() * 10000)

    rand(3 + Math.floor(Math.random() * 3)).forEach(
        () => save(next(), now, rand_title())
    )
    for (let w = 1; w <= 6; w++) {
        const ts = now - w * 7 * 86400000
        rand(3 + Math.floor(Math.random() * 8)).forEach(
            () => save(next(), ts, rand_title())
        )
    }
    for (let y = 1; y <= 3; y++) {
        const ts = new Date().setFullYear(new Date().getFullYear() - y)
        rand(3 + Math.floor(Math.random() * 17)).forEach(
            () => save(next(), ts, rand_title())
        )
    }
}

const test_list_clear = () => {
    const keys = Object.keys(localStorage)
    for (let k of keys) {
        if (!k.startsWith("chat.id.")) continue
        const id = key2id(k)
        const h = JSON.parse(localStorage.getItem(k) || "{}")
        if (!h?.test) continue
        localStorage.removeItem("chat.id." + id)
        localStorage.removeItem("chat." + id)
    }
}

export const generate = (list, render_item) => {
    /* history.generate() – populates a DOM list with all stored chats,
       grouped by recency (Today, Yesterday, Last Week, etc.), in reverse
       chronological order. Optionally seeds fake test data, then removes it.
     */
    list.innerHTML = ""
    const now = Date.now()
    test_list(now)

    const chats = []
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k.startsWith("chat.id.")) continue
        const c = load_chat(key2id(k))
        if (c) chats.push(c)
    }

    chats.sort((a, b) => b.timestamp - a.timestamp)
    const buckets = new Map()
    chats.forEach(c => {
        const k = section_key(c.timestamp)
        if (!buckets.has(k)) buckets.set(k, [])
        buckets.get(k).push(c)
    })

    const order = ["", "Yesterday", "Last Week", "Last Month"]
    order.forEach(k => {
        if (!buckets.has(k)) return
        if (k) {
            const h = document.createElement("div")
            h.className = "section-title"
            h.textContent = k
            list.appendChild(h)
        }
        buckets.get(k).forEach(render_item)
        buckets.delete(k)
    })

    for (let m = new Date().getMonth() - 1; m >= 0; m--) {
        const name = new Date(new Date().getFullYear(), m, 1)
                     .toLocaleString("default", { month: "long" })
        if (!buckets.has(name)) continue
        const h = document.createElement("div")
        h.className = "section-title"
        h.textContent = name
        list.appendChild(h)
        buckets.get(name).forEach(render_item)
        buckets.delete(name)
    }

    Array.from(buckets.keys())
        .map(Number)
        .filter(y => !isNaN(y))
        .sort((a, b) => b - a)
        .forEach(y => {
            const h = document.createElement("div")
            h.className = "section-title"
            h.textContent = String(y)
            list.appendChild(h)
            buckets.get(String(y)).forEach(render_item)
        })

    test_list_clear()
}

