"use strict"

let categories = []
let callback = () => {}
let interval = null
let disp = []
let next = 0

const get = id => document.getElementById(id)

const shuffle = array => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = array[i]
        array[i] = array[j]
        array[j] = temp
    }
    return array
}

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
        const category = box.querySelector(".suggestion_title").innerText
        const prompt = box.querySelector(".suggestion_text span").textContent
        callback({ category: category, prompt: prompt })
    }
    c.div = box
    return box
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
    for (let c of disp) {
        container.appendChild(create_box(c))
    }
}

export const init = cfg => {
    callback = cfg.callback || (x => console.log("sel:", x))
    categories = cfg.data.slice()
    return `
        <div id="suggestions_container" class="suggestions_container"></div>
    `.replace(/\s+/g, " ").trim()
}


export const cycle = () => {
    if (!disp.length) return
    let c = shuffle(categories.slice())[0]
    let p = c.prompts[Math.floor(Math.random() * c.prompts.length)]
    let box = disp[next].div
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
        disp[next] = {
            category: c.category,
            prompts: c.prompts,
            index: 0,
            div: box
        }
    }, 300)
    next = (next +  1) % disp.length
}

export const start = (ms = 5000) => {
    if (interval) clearInterval(interval)
    interval = setInterval(() => { cycle() }, ms)
}

export const show = () => {
    let container = get("suggestions_container")
    if (disp.length === 0) build()
    if (container) container.style.display = "flex"
}

export const hide = () => {
    let container = get("suggestions_container")
    if (container) container.style.display = "none"
    if (interval) {
        clearInterval(interval)
        interval = null
    }
}
