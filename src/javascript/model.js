"use strict"

import * as util from "./util.js"

const server = true //set to false to debug

const md =
  "# Lorem ipsum\n" +
  "## Dolor sit amet\n" +
  "### Consectetur\n" +
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, " +
  "sed do eiusmod tempor incididunt ut labore et dolore " +
  "magna aliqua.\n\n" +
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, " +
  "sed do eiusmod tempor incididunt ut labore et dolore " +
  "magna aliqua.\n\n" +
  "### C\n" +
  "```c\n" +
  "int main(void) {\n" +
  "    return 0\n" +
  "}\n" +
  "```\n" +
  "### Python\n" +
  "```python\n" +
  "print(\"Hello, world!\")\n" +
  "```\n" +
  "### JavaScript\n" +
  "```javascript\n" +
  "console.log(\"Hello, world!\")\n" +
  "```\n" +
  "* Lorem\n" +
  "* Ipsum\n" +
  "* Magna\n\n"

let index = 0
let answering = false

export const ask = (value) => { // returns error message or null on OK
    if (server) {
        const text = util.post("./ask", value)
        answering = text === "OK"
        return answering ? null : text
    } else {
        index = 0
        answering = true
        return null;
    }
}

export const save = (id) => {
    if (server) {
        util.post("./save", id)
    }
}

export const load = (id) => {
    if (server) {
        util.post("./load", id)
    }
}

export const poll = (command, done) => {
    if (server) {
        return util.post("./poll", command, done)
    } else {
//      console.log("command: " + command)
        if (command === "<--interrupt-->") {
            index = md.length + 1 // next poll will end answering
//          console.log("interrupt: " + index)
            return ""
        } else if (index >= md.length) {
            index = 0
            answering = false
            return "<--done-->"
        } else { // could return empty string too
            const num = Math.floor(Math.random() * 5)
            const result = md.substring(index, Math.min(index + num, md.length))
            index += num
            return result
        }
    }
}

export const is_running = () => {
    if (server) {
        return util.post("./is_running") === "true"
    } else {
        return true
    }
}

export const is_answering = () => {
    if (server) {
        return util.post("./is_answering") === "true"
    } else {
        return answering
    }
}

export const quit = () => {
    if (server) {
        util.post("./quit")
    } else {
        // nothing
    }
}
