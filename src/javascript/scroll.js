"use strict"

import * as modal  from "./modal.js"
import * as detect from "./detect.js"

export const scroll_create_wrapper = (list, appending, verbose) => {

    let scrollable = {
        autoscroll: false,
        scroll_to_top: null,
        scroll_to_bottom: null,
    }
    
    const log = verbose ? console.log : () => {}
    
    const create_buttton = (id, content) => {
        const b = document.createElement('button')
        b.id = id
        b.className           = 'scroll-button'
        b.style.position      = 'absolute'
        b.style.display       = 'block'
        b.textContent         = content
        b.style.marginTop     = '0.5rem'
        b.style.marginBottom  = '0.5rem'
        return b
    }
    
    const button_top = create_buttton('scroll-top', '⌅')
    const button_bottom = create_buttton('scroll-bottom', '⌅')
    button_bottom.style.transform = 'rotate(180deg)'
    const position_buttons = () => {
        const right = detect.masOS ? '0.75rem' : '0'
        button_top.style.top       = right
        button_top.style.right     = '0.125rem'
        button_top.title = "Scroll to the Top"
        button_bottom.style.bottom = right
        button_bottom.style.right  = '0.125rem'
        button_bottom.title = "Scroll to the End"
    }
    list.parentElement.appendChild(button_top)
    list.parentElement.appendChild(button_bottom)

    position_buttons()

    window.addEventListener('resize', () => position_buttons())
    document.addEventListener('scroll', () => position_buttons())
    
    const show_hide = (b, e) => {
        if (b) {
            e.classList.add('scroll-button-visible')
        } else {
            e.classList.remove('scroll-button-visible')
        }
        e.disabled = !b
    }

    let is_programmatic_scroll = false
    let user_interacting = false
    let scroll_position = null

    const line_height = (e) => {
        const cs = window.getComputedStyle(e) // computed style
        let h = parseFloat(cs.lineHeight)
        if (isNaN(h)) h = parseFloat(cs.fontSize) * 1.2
        return h
    }

    const scrolled = new CustomEvent('scrolled', {
          detail: { message: 'smooth scroll completed' },
          bubbles: false,
          cancelable: true
    })
    
    let requested_animation_frame = null
    let start = Date.now()

    const force_layout = (e) => { // and cancel smooth scroll
        if (scroll_position !== null) {
            e.scrollTop = scroll_position
            scroll_position = null
            if (requested_animation_frame) {
                cancelAnimationFrame(requested_animation_frame)
            }
            requested_animation_frame = null
        }
        const _ = e.offsetHeight // force layout
    }
    
    const at_the_bottom = (e) => {
        if (e.children.length == 0) { return true }
        const lh = line_height(e)
        const bottom = e.scrollTop + e.clientHeight
        const end = e.scrollHeight - lh
        /*
        log("at_the_bottom() lh: " + lh +
            " bottom: " + bottom + "end: " + end +
            " bottom >= end " + (bottom >= end))
        */
        return bottom >= end
    }
    
    const update_buttons = (e) => {
        const lh = line_height(e)
        show_hide(e.scrollTop >= lh, button_top)
        const bottom = e.scrollTop + e.clientHeight
        const end = e.scrollHeight - lh
        show_hide(!at_the_bottom(e) && !scrollable.autoscroll, button_bottom)
        log("update_buttons up: " + (e.scrollTop >= lh) +
                        " down: " + (!at_the_bottom(e) && !scrollable.autoscroll))
    }

    const scroll_to = (e, p) => { // element, position
        log("scroll_to: " + p)
        is_programmatic_scroll = true
        if (p == scroll_position) { return }
        start = Date.now()
        scroll_position = p
        e.scrollTo({ top: p, behavior: 'smooth' })
        if (requested_animation_frame === null) {
            const check = (time) => {
                log("scroll_to.check p: " + p + " .scrollTop: " + e.scrollTop)
                let done = false
                if (e.scrollTop === scroll_position) {
                    log("scroll_to.check DONE scroll_position: " +
                         scroll_position + " .scrollTop: " + e.scrollTop)
                    done = true
                } else if (Date.now() - start > 1000) {
                    log("scroll_to.check TIMEOUT p: " +
                         scroll_position + " .scrollTop: " + e.scrollTop)
                    done = true
                } else {
                    requested_animation_frame = requestAnimationFrame(check)
                }
                if (done) {
                    is_programmatic_scroll = false
                    force_layout(e)
                    scroll_position = null
                    requested_animation_frame = null
                    requestAnimationFrame(() => update_buttons(e))
                    e.dispatchEvent(scrolled)
                }
            }
            requested_animation_frame = requestAnimationFrame(check)
        }
    }

    const scroll_to_bottom_top_position = (e) =>
        e.scrollHeight - e.clientHeight

    const scroll_to_top = (e) => {
        if (e.children.length == 0) { return }
        log("scroll_to_top")
        scroll_to(e, 0)
        scrollable.autoscroll = false
        log(`scrollable.autoscroll := ${scrollable.autoscroll}`)
    }

    const scroll_to_bottom = (e) => {
        if (e.children.length == 0) { return }
        log("scroll_to_bottom")
        scroll_to(e, scroll_to_bottom_top_position(e))
        if (appending()) {
            scrollable.autoscroll = true
            log(`scrollable.autoscroll := ${scrollable.autoscroll}`)
            show_hide(false, button_bottom)
        }
    }

    const scroll = (e) => {
        if (e.children.length == 0) { return }
        log("scroll() .scrollTop: " + e.scrollTop +
            " user_interacting: " + user_interacting)
        const lh = line_height(e)
        const bottom = e.scrollTop + e.clientHeight
        const end = e.scrollHeight - lh
        if (appending() && at_the_bottom(e) && !scrollable.autoscroll) {
            scrollable.autoscroll = true
            log(`scrollable.autoscroll := ${scrollable.autoscroll}`)
            show_hide(false, button_bottom)
            show_hide(true,  button_top)
        }
        if (user_interacting ||
           !is_programmatic_scroll && appending()) {
            if (scrollable.autoscroll && !at_the_bottom(e)) {
                scrollable.autoscroll = false
                log(`scrollable.autoscroll := ${scrollable.autoscroll}`)
            }
        }
        requestAnimationFrame(() => update_buttons(e))
    }

    let later = null
    
    const update_buttons_later = (e) => {
        if (later) clearTimeout(later)
        later = setTimeout(() => {
            later = null
            update_buttons(e)
        }, 100)
    }

    const touch_move = (e) => {
        if (e.children.length == 0) { return }
        log("user_interacting: " + user_interacting)
        force_layout(e)
        scrollable.autoscroll = at_the_bottom(e)
        log(`scrollable.autoscroll := ${scrollable.autoscroll}`)
        update_buttons_later(e)
    }

    const scroll_end = (e) => {
        if (e.children.length == 0) { return }
        log("user_interacting: " + user_interacting)
        if (later) clearTimeout(later)
        later = setTimeout(() => {
            later = null
            update_buttons(e)
        }, 100)
    }

    list.addEventListener('scroll',     () => scroll(list))
    list.addEventListener('scrolled',   () => scroll_end(list))
    list.addEventListener('touchmove',  () => touch_move(list))
    list.addEventListener('mousemove',  () => touch_move(list))
    list.addEventListener('wheel',      () => touch_move(list))
    list.addEventListener('mousewheel', () => touch_move(list))

    let interaction_timeout = null

    const mark_user_active = () => {
        user_interacting = true
        clearTimeout(interaction_timeout)
        interaction_timeout = setTimeout(() => {
            user_interacting = false
            log("user inactive")
            interaction_timeout = null
        }, 333)
    }

    ['touchstart', 'touchmove', 'touchend', 'touchcancel',
     'mousedown', 'mousemove', 'mouseup',
     'wheel'].forEach(ev => {
        document.addEventListener(ev, mark_user_active, { passive: true })
    })

    const observer = new MutationObserver(function(mutationsList, observer) {
        if (scrollable.autoscroll) {
            scroll_to(list, scroll_to_bottom_top_position(list))
        } else {
            update_buttons_later(list)
        }
    })
    
    const config = {
        childList:     true,  // Observe direct children
        subtree:       true,  // all descendants
        characterData: true,  // changes to text content
        attributes:    false, // attribute changes
    }

    observer.observe(list, config)
    
    button_top.addEventListener('click',    () => scrollable.scroll_to_top())
    button_bottom.addEventListener('click', () => scrollable.scroll_to_bottom())

    update_buttons(list)

    window.addEventListener('app_modal', () => {
        log("app_modal: " + modal.modality)
        if (modal.modality > 0) {
            button_top.style.display    = 'none'
            button_bottom.style.display = 'none'
        } else {
            button_top.style.display    = 'block'
            button_bottom.style.display = 'block'
        }
    })

    scrollable.autoscroll = false
    log(`scrollable.autoscroll := ${scrollable.autoscroll}`)
    scrollable.scroll_to_top    = () => scroll_to_top(list)
    scrollable.scroll_to_bottom = () => scroll_to_bottom(list)
    scrollable.at_the_bottom    = () => at_the_bottom(list)

    return scrollable
}

