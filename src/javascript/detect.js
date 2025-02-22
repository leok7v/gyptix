"use strict"

export let ua = "mozilla/5.0 (macintosh; intel mac os x 10_15_7) applewebkit/605.1.15"
export let platform = "macintel"
export let apple = true
export let bro = "safari"
export let macOS  = false
export let iPhone = false
export let iPad   = false
export let iOS    = false

export const init = () => {
    const html = document.documentElement
    ua = navigator.userAgent.toLowerCase()
    platform = navigator.platform ? navigator.platform.toLowerCase() : ""
    apple =
        /iphone|ipad|macintosh/.test(ua) ||
        (platform.includes("mac") && navigator.maxTouchPoints > 1) ||
        (ua.includes("macintosh") &&
         ua.includes("applewebkit") &&
        !ua.includes("chrome"))
    bro = apple ? "safari" : "chrome"
    macOS  = /\(macintosh;/.test(ua)
    iPhone = /\(iphone;/.test(ua)
    iPad   = /\(ipad;/.test(ua)
    if (macOS && navigator.maxTouchPoints && navigator.maxTouchPoints === 5) {
        // Incorrect UserAgent in iPad OS WebKit
        macOS = false
        iPad = true
    }
    iOS = iPad || iPhone
    html.setAttribute("data-bro", bro)
    if (macOS)  html.setAttribute("data-macOS",  "true")
    if (iPhone) html.setAttribute("data-iPhone", "true")
    if (iPad)   html.setAttribute("data-iPad",   "true")
    if (iOS)    html.setAttribute("data-iOS",    "true")
}

init() // immediately before DOM page load

