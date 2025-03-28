"use strict"

let categories = []
let callback = () => {}
let interval = null
let disp = []

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
        return { category: cat.category, prompts: ps, index: 0, div: null }
    })
    disp = sc.slice(0, 2)
    let container = get("suggestions_container")
    if (!container) return
    container.innerHTML = ""
    const invite = document.createElement("div")
    invite.innerHTML =
        "What would you like to discuss today?<br>" +
        "<sup>Using full sentences helps me respond better.</sup>"
    container.appendChild(invite)
    const bc = document.createElement("div")
    bc.id = "suggestion_boxes_container"
    bc.style.display = "flex"
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
    span.textContent = c.prompts[c.index]
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
    if (!disp.length) return
    const idx = Math.floor(Math.random() * disp.length)
    let c = shuffle(categories.slice())[0]
    let i = Math.floor(Math.random() * c.prompts.length)
    let p = c.prompts[i]
    let box = disp[idx].div
    let title = box.querySelector(".suggestion_title")
    let text = box.querySelector(".suggestion_text span")
    title.style.transition = "opacity 0.3s ease"
    text.style.transition = "opacity 0.3s ease"
    title.style.opacity = 0
    text.style.opacity = 0
    setTimeout(() => {
        title.innerHTML = `${c.category}`
        text.textContent = p
        title.style.opacity = 1
        text.style.opacity = 1
        disp[idx] = { category: c.category,
                      prompts: c.prompts,
                      index: i, div: box }
    }, 300)
}

const start = (ms = 5000) => {
    if (interval) clearInterval(interval)
    interval = setInterval(() => { cycle() }, ms)
}

export const show = () => {
    if (disp.length === 0) build()
    cycle()
    cycle()
    get("suggest").style.display = "block"
    start()
}

export const hide = () => {
    get("suggest").style.display = "none"
    if (interval) {
        clearInterval(interval)
        interval = null
    }
}
