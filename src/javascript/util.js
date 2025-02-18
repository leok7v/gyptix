"use strict"

export const toast = s => {
    const div = document.createElement("div")
    div.style.position  = "fixed"
    div.style.top       = "10px"
    div.style.left      = "50%"
    div.style.transform = "translateX(-50%)"
    div.style.color     = "white"
    div.style.padding   = "10px 20px"
    div.style.zIndex    = "10000"
    div.style.backgroundColor = "rgba(255,0,0,0.9)"
    div.textContent   = s
    document.body.appendChild(div)
    setTimeout(() => document.body.removeChild(div), 3300)
}

const http = (url, method, req = "", done = null) => {
    let error = null
    let text = `Failed to load ${url}`
    try {
        const request = new XMLHttpRequest()
        request.open(method, url, false) // false = synchronous
        request.setRequestHeader("Content-Type", "text/plain")
        if (method === "POST") {
            request.send(req)
        } else {
            request.send()
        }
        if (request.status === 200) {
            text = request.responseText
            if (done) done(text)
        } else {
            error = new Error(`${url} ${method} failed: ${request.status}`)
        }
    } catch (e) {
        error = new Error(`${url} ${method} failed: ${e}`)
    }
    if (error) throw error
    return text
}

export const load = (url) => http(url, "GET")

export const post = (url, req = "", done = null) => http(url, "POST", req, done)

export function rename(element, old_name) {
    return new Promise(resolve => {
        const parent = element.parentElement;
        const orig_display = parent.style.display;
        let rect = element.getBoundingClientRect();
        const computed = window.getComputedStyle(element);
        const input = document.createElement("input");
        input.type = "text";
        input.value = old_name;
        input.style.position = "fixed";
        input.style.top = rect.top + "px";
        input.style.left = rect.left + "px";
        input.style.width = (parent
            ? parent.getBoundingClientRect().width
            : rect.width) + "px";
        input.style.zIndex = 9999;
        input.style.fontSize = computed.fontSize;
        input.style.fontFamily = computed.fontFamily;
        input.style.fontWeight = computed.fontWeight;
        input.style.color = computed.color;
        input.style.backgroundColor = computed.backgroundColor;
        document.body.appendChild(input);
        input.focus();
        input.select();
        parent.style.display = "none";
        const finish = value => {
            document.body.removeChild(input);
            parent.style.display = orig_display;
            resolve(value);
        };
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                finish(input.value.trim() || old_name);
            } else if (event.key === "Escape") {
                event.preventDefault();
                finish(null);
            }
        });
        input.addEventListener("blur", () => finish(null));
    });
}

