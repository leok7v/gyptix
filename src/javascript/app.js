import { app }               from "hyperapp://./hyperapp.js"
import { every, delay, now } from "hyperapp://./hyperapp.time.js"
/*
import { focus, blur }       from "hyperapp://./hyperapp.dom.js"
import { onMouseMove }       from "hyperapp://./hyperapp.events.js"
import { ellipse }           from "hyperapp://./hyperapp.svg.js"
*/

import {
    main, h1, ul, li, section, div, button, text, input
} from "hyperapp://./hyperapp.html.js"

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
    const ul = document.querySelector("ul");
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

const answer = async (value) => {
    console.log("answer(value:" + value + ")");
    try {
        const response = await fetch("hyperapp://./answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value }),
        });
        if (response.ok) {
            const text = await response.text();
            console.log(`Response text: ${text}`);
            return text;
        }
        console.error(`HTTP error: ${response.status}`)
        throw new Error(`HTTP error: ${response.status}`)
    } catch (error) {
        console.error("Fetch error:", error)
        return "I don't know."
    }
}

const refresh = (state, { question, answer }) => {
    console.log("UpdateList");
    console.log("answer" + answer);
    const e = [
        { type: "question", text: question },
        { type: "answer", text: answer },
    ];
    console.log("List length:", state.list.length);
    return {
        ...state,
        list: state.list.concat(e),
        value: "",
    }
}

const effect = (dispatch, { value }) => {
    answer(value).then((answer) => {
        dispatch(refresh, { question: value, answer })
    })
}

const add = (state) => [
    state,
    [effect, { value: state.value }],
    delay(33, scroll)
];

app({
    init: {
        list: [],
        value: ""
    },
    subscriptions: (state) => [
        [update, { value: state.value }]
    ],
    view: ({ list, value }) =>
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
                        button({ class: "up-arrow-icon",
                            disabled: value.trim() === "",
                            onclick: add
                        }),
                    ])
                ]),
            ])
        ]),
    node: document.getElementById("app"),
})
