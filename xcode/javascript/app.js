import { app }               from "gyptix://./hyperapp.js"
import { every, delay, now } from "gyptix://./hyperapp.time.js"
/*
import { focus, blur }       from "gyptix://./hyperapp.dom.js"
import { onMouseMove }       from "gyptix://./hyperapp.events.js"
import { ellipse }           from "gyptix://./hyperapp.svg.js"
*/

import {
    main, h1, ul, li, section, div, button, text, input
} from "gyptix://./hyperapp.html.js"

const lucky = (state) => {
    const value =
        "Yes, an electronic brain a simple one would suffice.\r\n" +
        "You'd just have to program it to say..."
    return {
        ...state,
        value
    }
}

const changed = (state, event) => ({
    ...state,
    value: event.target.innerText,
    answering: false
})

const multiline = (txt) =>
    txt.split("\n").map((line) => div(text(line)))

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

const search  = (state) => {
    return state
}

const restart = (state) => ({
    ...state,
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
    console.log("UpdateList")
    console.log("answer" + answer)
    const e = [
        { type: "question", text: question },
        { type: "answer", text: answer },
    ]
    console.log("List length:", state.list.length)
    return {
        ...state,
        list: state.list.concat(e),
        value: "",
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
//      console.log(`Poll response: ${text}`)
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
    [effect, { value: state.value }],
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

const add_or_stop = (state) => {
    return  state.answering ? stop(state) : add(state)
}

app({
    init: {
        list: [],
        value: "",
        answering: false
    },
    subscriptions: (state) => [
        [update, { value: state.value }]
    ],
    view: ({ list, value, answering }) =>
        main([
            div({ class: "header" }, [
                button({ class: "magnifying-glass-icon",
                    disabled: list.length === 0,
                    onclick: search }),
                button({ class: "pen-to-square-icon",
                    disabled: list.length === 0,
                    onclick: restart }),
            ]),
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
                        button({ class: "lucky",
                            disabled: value.trim() !== "",
                            onclick: lucky
                        }, text("💬")),
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
