import * as util  from "./util.js"
import * as model from "./model.js"
import { random_prompt }     from "./prompts.js"
import { app }               from "./hyperapp.js"
import { every, delay, now } from "./hyperapp.time.js"
/*
import { focus, blur }       from "./hyperapp.dom.js"
import { onMouseMove }       from "./hyperapp.events.js"
import { ellipse }           from "./hyperapp.svg.js"
*/

import {
    main, h1, ul, li, section, div, button, text, input, img
} from "./hyperapp.html.js"

const lucky = (state) => {
    const value = random_prompt()
    return {
        ...state,
        lucky_clicked: true,
        showMenu: false,
        value,
    }
}

const changed = (state, event) => {
    return {
        ...state,
        value: event.target.innerText,
        answering: false,
        showMenu: false,
   }
}

const multiline = (txt) =>
    txt.split("\n").map((line) => div({ class: "para" }, text(line)))

const update = (dispatch, { value }) => {
    const editable = document.querySelector(".editable")
    if (editable && editable.innerText !== value) {
        editable.innerText = value
    }
    return () => {}
}

const scroll = (state) => {
    const ul = document.querySelector("ul")
    if (ul) { ul.scrollTo({ top: ul.scrollHeight, behavior: "smooth" }) }
    return state
}

const toggleMenu = (state) => ({
    ...state,
    showMenu: !state.showMenu
})

const toggleAbout = (state) => ({
    ...state,
    showAbout: !state.showAbout
})

const toggleLicenses = (state) => ({
    ...state,
    showLicenses: !state.showLicenses
})

const about = (state) => {
    return toggleAbout(toggleMenu(state))
}

const licenses = (state) => {
    return toggleLicenses(toggleMenu(state))
}

const search  = (state) => {
    return state
}

const info  = (state) => {
    return toggleMenu(state)
}

const restart = (state) => ({
    ...state,
    showMenu: false,
    list: [],
})

const setAnswering = (state, answering) => ({
    ...state,
    answering
})

const ask = async (value) => {
    try {
        const response = await fetch("./ask", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: value,
        })
        if (response.ok) {
            const text = await response.text()
            return text === "OK" ? null : text
        }
        console.error(`error: ${response.status}`)
        throw new Error(`error: ${response.status}`)
    } catch (error) {
        console.error("error:", error)
        return "I don't know."
    }
}

const refresh = (state, { question, answer }) => {
    const e = [
        { type: "question", text: question },
        { type: "answer", text: answer },
    ]
    return {
        ...state,
        list: state.list.concat(e),
        value: "",
        lucky_clicked: false,
    }
}

const append = (state, newText) => { // append to latest answer
    if (state.list.length === 0) { return state }
    let list = [...state.list]
    let lastIndex = list.length - 1
    if (list[lastIndex].type !== "answer") {
        return state
    }
    list[lastIndex] = {
        ...list[lastIndex],
        text: list[lastIndex].text + newText
    }
    requestAnimationFrame(() => {
        const ul = document.querySelector("ul")
        if (ul) ul.scrollTo({ top: ul.scrollHeight, behavior: "smooth" })
    })
    return { ...state, list }
}

const poll = (dispatch, getState) => {
    fetch("gyptix://./poll", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "",
    })
    .then(response => response.text())
    .then(text => {
        if (text === "<--done-->") {
            dispatch(setAnswering, false)
        } else {
            if (text !== "") {
                dispatch(append, text)
            }
            setTimeout(() => poll(dispatch, getState), 10)
        }
    })
    .catch(error => {
        console.error("poll failed:", error)
        dispatch(setAnswering, false)
    })
}

const effect = (dispatch, { value }) => {
    dispatch(refresh, { question: value, answer: "" })
    ask(value).then((answer) => {
        if (answer === null) {
            dispatch(setAnswering, true)
            poll(dispatch)
        } else {
            dispatch(append, answer)
        }
    })
}

const add = (state) => [
    state,
    [effect, { value: state.value, lucky_clicked: false, showMenu: false }],
    delay(33, scroll)
]

const interrupt = (dispatch, { answering }) => {
    fetch("gyptix://./poll", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "<--interrupt-->",
    })
    .then(() => {
        dispatch(setAnswering, true)
    })
    .catch(error => {
        console.error("poll failed:", error)
    })
}

const stop = (state) => [
    state,
    [interrupt, { showMenu: false, answering: state.answering } ],
    delay(33, scroll)
]

const erase = (state) => {
    const editable = document.querySelector(".editable")
    if (editable) {
        editable.innerText = ""
    }
    return { ...state, value: "", lucky_clicked: false }
}

const add_or_stop = (state) => {
    return state.answering ? stop(state) : add(state)
}

const agreeEula = (state) => {
    localStorage.setItem("eula_agreed", "true")
    return { ...state }
}

const eula = (state) => [
    {
        ...state,
        agreeEnabled: false
    }
]

const showEula = () => {
    localStorage.setItem("eula_agreed", "false") // DEBUG
    return localStorage.getItem("eula_agreed") !== "true"
}

const pasted = (state, event) => {
    event.preventDefault()
    let text = (event.clipboardData || window.clipboardData).getData("text/plain")
    const editable = document.querySelector(".editable")
    if (text && editable) {
        const selection = window.getSelection()
        const range = selection.getRangeAt(0)
        range.deleteContents()
        range.insertNode(document.createTextNode(text))
        range.setStartAfter(range.endContainer)
        range.setEndAfter(range.endContainer)
        selection.removeAllRanges()
        selection.addRange(range)
        // TODO: lost focus; next line suppose to refocus but it does not
        setTimeout(() => { editable.focus() }, 500)
        return {...state, value: editable.innerText}
    }
    return state
}

const split = s => {
    console.log("s: " + s)
    console.log("s: " + s.split('\n'))
    return s.split('\n')
}

app({
    init: {
        list: [],
        value: "",
        answering: false,
        showMenu: false,
        aboutText: util.load("./about.md"),
        licensesText: util.load("./licenses.md"),
        showAbout: false,
        showLicenses: false,
        lucky_clicked: false,
    },
    subscriptions: (state) => [
        [update, { value: state.value }]
    ],
    view: ({ state, list, value, answering, showMenu,
             aboutText, licensesText, showAbout, showLicenses, lucky_clicked }) =>
        main([
            showEula() ?
            div({ class: "page" }, [
                div({ class: "page-content" }, [
                    ul(split(util.load("./eula.md")).map(line => li({}, text(line)))),
                    div({ class: "agree-container" }, [
                        button({
                            class: "OK",
                            onclick: agreeEula
                        }, text("I AGREE"))
                    ])
                ])
            ]) :
            showAbout ? div({ class: "page" }, [
                div({ class: "page-content" }, [
                    ul(aboutText.split("\n").map(line => li({}, text(line)))),
                    div({ class: "agree-container" }, [
                        button({
                            class: "OK",
                            onclick: toggleAbout
                        }, text("ⓧ"))
                    ])
                ])
            ]) :
            showLicenses ? div({ class: "page" }, [
                div({ class: "page-content" }, [
                    ul(licensesText.split("\n").map(line => li({}, text(line)))),
                    div({ class: "agree-container" }, [
                        button({
                            class: "OK",
                            onclick: toggleLicenses
                        }, text("ⓧ"))
                    ])
                ])
            ]) :
            div({ class: "header" }, [
                button({
                    class: "info",
                    onclick: info
                }, [
                   text("☰ 𝔾𝑦ℙ𝕋𝑖𝑥"), // 𝔊𝑦𝔓𝔗𝑖𝑥
                   img({ src: "gyptix://./GyPTix-256x256.png",
                         class: "logo"})
                ]),
//              button({ class: "magnifying-glass-icon",
//                  disabled: list.length === 0,
//                  onclick: search }),
                button({
                    class: "lucky",
                    disabled: value.trim() !== "",
                    title: "Need inspiration? Click on 🤷‍♂️",
                    onclick: lucky
                }, text("🤷‍♂️")),
                button({ class: "pen-to-square-icon",
                    disabled: list.length === 0,
                    title: "Start new conversation",
                    onclick: restart }),
            ]),
            showMenu ?
            div({ class: "pure-modal" }, [
                div({ class: "pure-modal-content" }, [
                    button({ class: "info", onclick: info }, text("ˆ")),
                    ul([
                        li({ onclick: about }, text("About")),
                        li({ onclick: licenses }, text("Licenses")),
                    ])
                ]),
            ]) : null,
            ul(list.map(e => li({class: e.type}, multiline(e.text)))),
            section( {}, [
                div( { class: "editor" }, [
                    div({
                        class: "editable",
                        contenteditable: "true",
                        placeholder: "Ask anything...",
                        oninput: changed,
                        onpaste: pasted,
                    }),
                    div({ class: "editor_tools" }, [
                        lucky_clicked ?
                        button({ class: "erase", onclick: erase }, text("✖")) :
                        div({},[]),
                        button({ class: answering ?
                            "circle-stop-icon" : "up-arrow-icon",
                            disabled: value.trim() === "" && !answering,
                            title: !answering ?
                                "Submit your question" : "Stop",
                            onclick: add_or_stop
                        }),
                    ])
                ]),
            ])
        ]),
    node: document.getElementById("app"),
})
