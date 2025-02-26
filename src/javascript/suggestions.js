"use strict"

let categories = []
let callback = () => {}
let interval = null
let disp = []

/*
 TODO: left and right of category title add button:"◀" title button:"▶"
 TODO: left and right of prompt add button:"▲" title button:"▼"
 if any of these buttons is clicked random cycle stops and the buttons
 allow user manually scroll thru categories and thru pprompts in the category
 .css already defines .button and .glyph styles for buttons customization
 <button id="id"  class="button"
     title="Hint"
     ><span class="glyph">◀</span></button>
 */

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
        const curCat = box.querySelector(".suggestion_title").innerText
        const curPrompt = box.querySelector(".suggestion_text span").textContent
        callback({ category: curCat, prompt: curPrompt })
    }
    c.div = box
    return box
}

export const init = cfg => {
    callback = cfg.callback || (x => console.log("sel:", x))
    categories = cfg.data.slice()
    return `
        <div id="suggestions_container" class="suggestions_container"></div>
    `.replace(/\s+/g, " ").trim()
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
    invite.innerHTML = "What would you like to discuss today?<br>" +
        "<sup>Using full sentences helps me respond better.</sup>"
    container.appendChild(invite)
    for (let c of disp) {
        container.appendChild(create_box(c))
    }
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
        disp[idx] = {
            category: c.category,
            prompts: c.prompts,
            index: i,
            div: box
        }
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
