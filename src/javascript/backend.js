"use strict"

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

export const log = (...args) => {
    return post("./log", args.join(''), null)
}

export const load = (url) => http(url, "GET")

export const post = (url, req = "", done = null) => http(url, "POST", req, done)

export const ask = (value) => { // returns error message or null on OK
    if (is_running()) {
        const result = post("./ask", value)
        return result === "OK" ? null : new Error(result)
    } else {
        return new Error("not running")
    }
}

export const run = id => {
    post("./run", id)
}

export const remove = id => post("./remove", id)

export const download = (url) => {
    return post("./download", url, null)
}

export const download_remove = (url) => {
    return post("./download_remove", url, null)
}

export const poll = () => {
    return post("./poll", "", null)
}

export const stat = () => { // see info definition at the end of file
    const json = post("./info", "", null)
//  console.log(`json:\n${json}\n`)
    return JSON.parse(json);
}

export const interrupt = () => {
    return post("./poll", "<--interrupt-->", null)
}

/* is_running() is_answering() round trip is <= 1ms */

export const is_running = () =>  {
    return post("./is_running") === "true"
}

export const is_answering = () => {
    return post("./is_answering") === "true"
}

export const erase = () => post("./erase")

// app.* methods can be called from native code
export const initialized = () => post("./initialized")

export const quit = () => post("./quit") // fatal no return

export const console_log = console.log

const start = performance.now() // high precision but in milliseconds

console.log = (...args) => {
    try {
        throw new Error()
    } catch (e) {
        const dt = (performance.now() - start) / 1000.0 // seconds
        const lines = e.stack.split('\n')
        let f = lines[1] || ''
        if (f.includes('backend.js')) f = lines[2] || ''
        let func = f.includes('@') ? f.substring(0, f.indexOf('@')) : ''
        if (func != '') func = ' ' + func + '()'
        let m = f.match(/@(.*?):(\d+):\d+/) || // @gyptix://./modal.js:67:46
                f.match(/(.*?):(\d+):\d+/)
        if (m) { // m.length > 1 guaranteed by regexes above
            const file = m[1].split('/').pop()
            const line = m[2]
            const s = `${dt.toFixed(3)} ${file}:${line}${func} ${args.join("\x20")}`
            log(s)
            console_log(s)
        } else {
            if (f != '') log(f)
            log(...args)
            console_log(...args)
        }
    }
    /*  dt.toFixed(3): (delta timeWebKit) on iOS currently coarsens
        performance.now() to whole-millisecond steps (and in non-isolated
        pages you only get 100 µs resolution at best) (April, 2025)
    */
}

/*

    stat() returns:
    {
        "context_tokens": 131072,
        "session_tokens": 549,
        "generated": 549,
        "progress": 1.000000,
        "average_token": 4.357,
        "tps": 56.613,
        "logits_bytes": 27190490,
        "sum": 2392,
        "time": 9.697398,
        "platform": "macOS",
        "ram": 25769803776,
        "storage": 964298293248,
        "gpu": {
            "recommended_max_working_set_size": 17179885568,
            "has_unified_memory": 1
        },
        "is_iOS_app_on_mac": 0,
        "is_mac_catalyst_app": 0,
        "cpu": 8,
        "active_cpu": 8
    }

*/
