"use strict"

import * as util from "./util.js"

let categories = []
let callback = () => {}
let disp = []
let ix = 0

const get = id => document.getElementById(id)

const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const t = a[i]
        a[i] = a[j]
        a[j] = t
    }
    return a
}

const flex_direction = () => {
    return window.innerWidth > window.innerHeight ? "row" : "column"
}

const build = () => {
    let sc = shuffle(categories.slice()).map(cat => {
        let ps = shuffle(cat.prompts.slice())
        return { category: cat.category,
                 prompts: ps,
                 pix: 0, // prompt index
                 div: null }
    })
    disp = sc.slice(0, 2)
    for (let i = 0; i < disp.length; i++) {
        disp[i].pix = util.random_int(0, categories[i].prompts.length - 1)
        console.log(`disp[${i}].pix: ${disp[i].pix}`)
    }
    let container = get("suggestions_container")
    container.innerHTML = ""
    const bc = document.createElement("div")
    bc.id = "suggestion_boxes_container"
    bc.style.display = "flex"
    bc.style.flex = "0 0 auto"
    bc.style.gap = "1em"
    bc.style.flexDirection = flex_direction()
    for (let c of disp) {
        bc.appendChild(create_box(c))
    }
    container.appendChild(bc)
}

window.addEventListener("resize", () => {
    const bc = get("suggestion_boxes_container")
    if (bc) {
        bc.style.flexDirection = flex_direction()
    }
})

const create_box = c => {
    const box = document.createElement("div")
    box.className = "suggestion_box"
    const title = document.createElement("div")
    title.className = "suggestion_title"
    title.innerHTML = `${c.category}`
    const text = document.createElement("div")
    text.className = "suggestion_text"
    const span = document.createElement("span")
    span.textContent = c.prompts[c.pix]
    text.appendChild(span)
    box.appendChild(title)
    box.appendChild(text)
    box.onclick = () => {
        const cur_cat = box.querySelector(".suggestion_title").innerText
        const cur_prompt =
            box.querySelector(".suggestion_text span").textContent
        callback({ category: cur_cat, prompt: cur_prompt })
    }
    c.div = box
    box.style.flex = "1"
    return box
}

export const init = cfg => {
    callback = cfg.callback || (x => console.log("sel:", x))
    categories = cfg.data.slice()
    return '<div id="suggestions_container" ' +
           'class="suggestions_container"></div>'
}

export const cycle = () => {
    if (!disp.length) { return }
    let c = shuffle(categories.slice())[0]
    let a = disp[(ix + 1) % 2].category.category
    while (c.category === a) { // avoid two same categories
        c = shuffle(categories.slice())[0]
    }
    let i = Math.floor(Math.random() * c.prompts.length)
    let p = c.prompts[i]
    let box = disp[ix].div
    let title = box.querySelector(".suggestion_title")
    let text = box.querySelector(".suggestion_text span")
    title.style.transition = "opacity 0.3s ease"
    text.style.transition = "opacity 0.3s ease"
    title.style.opacity = 0
    text.style.opacity = 0
    title.innerHTML = `${c.category}`
    text.textContent = p
    title.style.opacity = 1
    text.style.opacity = 1
    disp[ix] = { category: c.category,
                  prompts: c.prompts,
                  cix: i, div: box }
    ix = (ix + 1) % disp.length
}

export const show = () => {
    if (disp.length === 0) build()
    cycle()
    cycle()
    get("suggest").style.display = "flex"
}

export const hide = () => {
    get("suggest").style.display = "none"
}
