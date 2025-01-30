import { random_prompt }     from "gyptix://./prompts.js"
import { app }               from "gyptix://./hyperapp.js"
import { every, delay, now } from "gyptix://./hyperapp.time.js"
/*
import { focus, blur }       from "gyptix://./hyperapp.dom.js"
import { onMouseMove }       from "gyptix://./hyperapp.events.js"
import { ellipse }           from "gyptix://./hyperapp.svg.js"
*/

import {
    main, h1, ul, li, section, div, button, text, input, img
} from "gyptix://./hyperapp.html.js"

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

const get = (page) => {
    let text = "Failed to load " + page
    const request = new XMLHttpRequest()
    request.open("GET", "gyptix://./" + page + ".html", false) // Synchronous GET
    request.send(null)
    if (request.status === 200) { text = request.responseText }
    return text
}

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

const answer = async (value) => {
    try {
        const response = await fetch("gyptix://./ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value }),
        })
        if (response.ok) {
            const text = await response.text()
            return text === "OK" ? null : text
        }
        console.error(`HTTP error: ${response.status}`)
        throw new Error(`HTTP error: ${response.status}`)
    } catch (error) {
        console.error("Fetch error:", error)
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
        headers: { "Content-Type": "application/json" },
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
    answer(value).then((answer) => {
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
    [effect, { value: state.value, lucky_clicked: false }],
    delay(33, scroll)
]

const interrupt = (dispatch, { answering }) => {
    fetch("gyptix://./poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    [interrupt, { answering: state.answering} ],
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
    return  state.answering ? stop(state) : add(state)
}

const agreeEula = (state) => {
    localStorage.setItem("eula_agreed", "true")
    return { ...state, showEula: false }
}

const eula = (state) => [
    {
        ...state,
        eulaText: get("eula"),
        showEula: true,
        agreeEnabled: false
    }
]

const checkEula = (state) => {
//  localStorage.setItem("eula_agreed", "false") // DEBUG
    if (localStorage.getItem("eula_agreed") === "true") {
        return state
    }
    return eula(state)
}

app({
    init: checkEula({
        list: [],
        value: "",
        answering: false,
        showMenu: false,
        showEula: false,
        eulaText: get("eula"),
        aboutText: get("about"),
        licensesText: get("licenses"),
        showAbout: false,
        showLicenses: false,
        lucky_clicked: false,
    }),
    subscriptions: (state) => [
        [update, { value: state.value }]
    ],
    view: ({ state, list, value, answering, showMenu, showEula, eulaText,
             aboutText, licensesText, showAbout, showLicenses, lucky_clicked }) =>
        main([
            showEula ?
            div({ class: "page" }, [
                div({ class: "page-content" }, [
                    ul(eulaText.split("\n").map(line => li({}, text(line)))),
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
                button({ class: "info", onclick: info }, text("☰")),
//              button({ class: "magnifying-glass-icon",
//                  disabled: list.length === 0,
//                  onclick: search }),
                button({
                    class: "lucky",
                    disabled: value.trim() !== "",
                    onclick: lucky
                }, text("🤷‍♂️💬")),
                button({ class: "pen-to-square-icon",
                    disabled: list.length === 0,
                    onclick: restart }),
            ]),
            showMenu ?
            div({ class: "pure-modal" }, [
                div({ class: "pure-modal-content" }, [
                    button({ class: "info", onclick: info }, text("☰")),
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
                    }),
                    div({ class: "editor_tools" }, [
                        lucky_clicked ?
                        button({ class: "erase", onclick: erase }, text("✖")) :
                        div({},[]),
                        button({ class: answering ?
                            "circle-stop-icon" : "up-arrow-icon",
                            disabled: value.trim() === "" && !answering,
                            onclick: add_or_stop
                        }),
                    ])
                ]),
            ])
        ]),
    node: document.getElementById("app"),
})
