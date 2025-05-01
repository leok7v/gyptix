"use strict" // can be used as
// import * as widgets from "./widgets.js"

import * as detect from "./detect.js"
import * as ui     from "./ui.js"

export const init_theme = () => {
    let theme = localStorage.getItem("settings.theme")
    if (!theme) {
        theme = "dark"  // default theme
        localStorage.setItem("settings.theme", theme)
    }
    document.documentElement.setAttribute("data-theme", theme)
}

export const toggle_theme = () => {
    const html = document.documentElement
    let current = html.getAttribute("data-theme")
    let theme = current === "dark" ? "light" : "dark"
    html.setAttribute("data-theme", theme)
    localStorage.setItem("settings.theme", theme)
}

const default_font_size = () => {
    let fs = 100
    if (detect.iPhone) { fs = 110 }
    if (detect.iPad)   { fs = 150 }
    if (detect.macOS)  { fs = 100 }
    return fs;
}

const min_font_size = () => {
    let fs = 70
    if (detect.iPhone) { fs = 90 }
    if (detect.iPad)   { fs = 70 }
    if (detect.macOS)  { fs = 90 }
    return fs;
}

const max_font_size = () => {
    let fs = 200
    if (detect.iPhone) { fs = 150 }
    if (detect.iPad)   { fs = 200 }
    if (detect.macOS)  { fs = 180 }
    return fs;
}

const get_font_size = () => {
    let df = default_font_size()
    let fs = parseInt(localStorage.getItem("settings.font-size")) || df;
    return fs
}

export const init_font_size = () => {
    let font_size = get_font_size();
    document.body.style.fontSize = font_size + "%";
    localStorage.setItem("settings.font-size", font_size);
}

export const decrease_font_size = () => {
    let font_size = get_font_size();
    const min_font = min_font_size()
    font_size = Math.max(min_font, font_size - 10);
    document.body.style.fontSize = font_size + "%";
    localStorage.setItem("settings.font-size", font_size);
}

export const increase_font_size = () => {
    let font_size = get_font_size();
    const max_font =  max_font_size()
    font_size = Math.min(max_font, font_size + 10);
    document.body.style.fontSize = font_size + "%";
    localStorage.setItem("settings.font-size", font_size);
}

export const progress = (value) => {
      const progress = document.getElementById('progress')
      const ratio = document.getElementById('ratio')
      ratio.style.width = (value * 100) + '%'
      ui.show_hide(value < 1, progress)
}
