"use strict"

import * as util from "./util.js"

const sleep = async (ms) => {
    await new Promise(resolve => setTimeout(resolve, ms))
}

export const ask = (value) => { // returns error message or null on OK
    const deadline = Date.now() + 3000 // 3s deadline
    while (Date.now() && !is_running()) { sleep(100) }
    if (is_running()) {
        const error = util.post("./ask", value)
        return error === "OK" ? null : error
    } else {
        return "Model session is not running"
    }
}

export const run = id => {
    util.post("./run", id)
}

export const remove = id => util.post("./remove", id)

export const download = (url) => {
    return util.post("./download", url, null)
}

export const download_remove = (url) => {
    return util.post("./download_remove", url, null)
}

export const poll = () => {
    return util.post("./poll", "", null)
}

export const interrupt = () => {
    return util.post("./poll", "<--interrupt-->", null)
}

export const is_running = () =>  { 
    return util.post("./is_running") === "true"
}

export const is_answering = () => {
    return util.post("./is_answering") === "true"
}

export const erase = () => util.post("./erase")

// DOM loaded
export const loaded = () => util.post("./loaded")

// app.* methods can be called from native code
export const initialized = () => util.post("./initialized")

export const keyboard_frame = () => util.post("./keyboard_frame")

export const quit = () => util.post("./quit") // fatal no return

export const response = (max_tokens) => {
    max_tokens = max_tokens || 1024
    let r = ""
    let chunk = ""
    let tokens = 0
    while (chunk !== "<--done-->" && tokens < max_tokens) {
        chunk = poll()
        if (chunk !== "") {
            if (chunk !== "<--done-->") { r += chunk }
            tokens++
        } else {
            sleep(1)
        }
    }
    while (chunk !== "<--done-->") {
        chunk = poll()
        sleep(1)
    }
    return r
}

export const otr_question_answer = (q, max_tokens) => {
    ask(q)
    let r = response(max_tokens)
    ask("<--otr-->") // off the record
    response(64)
//  console.log(`r: ${r}`)
    const lines = r.trim().split("\n")
    for (let i = 0; i < lines.length; i++) {
        const s = lines[i].trim().replace(/[".]/g, "")
        if (s.length > 3) {
            r = s
            break
        }
    }
//  console.log(`r: ${r}`)
    return r
}

const rephrase_in_three = (s) => {
    let r = otr_question_answer(
`Rephrase "${s}" in three-or-less words
Reply with the output only.
Examples:
Input: "Exploring Hidden Ancient Ruins"
Output: "Ancient ruin exploration"
Input: "Crafting Delicious Homemade Pizza"
Output: "Homemade pizza crafting"
Input: "${s}"
Output:`)
    let wc_s = s.trim().split(/\s+/).filter(Boolean).length;
    console.log(`${s} word count: ${wc_s}`);
    let wc_r = r.trim().split(/\s+/).filter(Boolean).length;
    console.log(`${r} word count: ${wc_r}`);
    return wc_r > 0 && r.length >= 2 &&
           wc_r < wc_s && r.length < s.length ? r : s
}

const word_count = s => s.trim().split(/\s+/).filter(Boolean).length

const before_token = (s, t) => { // t may be ':', ';' or ','
    const idx = s.indexOf(t)
    return idx !== -1 ? s.slice(0, idx).trim() : s.trim()
}

export const title = () => {
    let title = otr_question_answer(
        "Generate a concise three-word-or-less single-sentence title" +
        " for this conversation, delivered as plain text without " +
        " punctuation or special characters. Reply with title text only.", 64)
    let wc = word_count(title)
//  console.log(`title: "${title}":${title.length} words: ${wc}`)
    if (wc > 3 && title.length > 24) {
        const punctuation = [':', ',', ';']
        for (let i = 0; i < punctuation.length; i++) {
            if (title.includes(punctuation[i])) {
                const shorter = before_token(title, punctuation[i])
                let wc_shorter = word_count(shorter)
//              console.log(`shorter: "${shorter}":${shorter.length} ` +
//                          `words: ${wc_shorter}`)
                if (wc_shorter >= 1 && shorter.length >= 3 &&
                                       shorter.length < title.length) {
                    title = shorter
                    break
                }
            }
        }
    }
    wc = word_count(title)
    if (wc > 3 && title.length > 24) {
        title = rephrase_in_three(title)
        wc = word_count(title)
    }
//  console.log(`title: "${title}":${title.length} words: ${wc}`)
    return title
}


