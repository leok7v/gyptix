"use strict"

import * as util from "./util.js"

const server = false

const md =
  "# Lorem ipsum\n\n" +
  "# Dolor sit amet\n\n" +
  "# Consectetur\n\n" +
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, " +
  "sed do eiusmod tempor incididunt ut labore et dolore " +
  "magna aliqua.\n\n" +
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, " +
  "sed do eiusmod tempor incididunt ut labore et dolore " +
  "magna aliqua.\n\n" +
  "### C\n\n" +
  "```c\n" +
  "int main(void) {\n" +
  "    return 0\n" +
  "}\n" +
  "```\n\n" +
  "### Python\n\n" +
  "```python\n" +
  "print(\"Hello, world!\")\n" +
  "```\n\n" +
  "### JavaScript\n\n" +
  "```javascript\n" +
  "console.log(\"Hello, world!\")\n" +
  "```\n\n" +
  "* Lorem\n" +
  "* Ipsum\n" +
  "* Magna\n\n"

let index = 0
let answering = false

const ask = (value) => { // returns error message or null on OK
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

const poll = (command, done) => {
    if (server) {
        return util.post("./poll", command, done)
    } else {
//      console.log("command: " + command)
        if (command === "<-interrupt->") {
            index = md.length + 1 // next poll will end answering
//          console.log("interrupt: " + index)
            return ""
        } else if (index >= md.length) {
            index = 0
            answering = false
            return "<-done->"
        } else { // could return empty string too
            const num = Math.floor(Math.random() * 5)
            const result = md.substring(index, Math.min(index + num, md.length))
            index += num
            return result
        }
    }
}

const is_running = () => {
    if (server) {
        return util.post("./is_running") === "true"
    } else {
        return true
    }
}

const is_answering = () => {
    if (server) {
        return util.post("./is_answering") === "true"
    } else {
        return answering
    }
}

export { is_running, ask, poll, is_answering }
