"use strict"

export let is_debugger_attached = false

export const set_debugger_attached = (attached) => {
    is_debugger_attached = attached
//  console.log("set_debugger_attached(" + attached + ")")
}

export const timestamp = () => Date.now() // UTC timestamp in milliseconds

export const random_int = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min

