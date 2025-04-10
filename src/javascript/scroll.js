"use strict"

export const scroll_create_wrapper = (list, appending, verbose) => {
    
    let scrollable = {
        autoscroll: false,
        scroll_to_top: null,
        scroll_to_bottom: null,
    }
    
    const log = verbose ? console.log : () => {}
    
    const create_buttton = (id, content) => {
        const b = document.createElement('button')
        b.style.position = 'absolute'
        b.style.display = 'block'
        b.id = id
        b.className = 'scroll-button'
        b.textContent = content
        return b
    }
    
    const button_top = create_buttton('scroll-top', '⌅')
    const button_bottom = create_buttton('scroll-bottom', '⌅')
    button_bottom.style.transform = 'rotate(180deg)'
    const position_buttons = () => {
        button_top.style.top       = '0.5rem'
        button_top.style.right     = '0.5rem'
        button_bottom.style.bottom = '0.5rem'
        button_bottom.style.right  = '0.5rem'
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
    
    const update_buttons = (e) => {
        const lh = line_height(e)
        show_hide(e.scrollTop >= lh, button_top)
        const bottom = e.scrollTop + e.clientHeight
        const end = e.scrollHeight - lh
        show_hide(bottom < end && !scrollable.autoscroll, button_bottom)
        log("update_buttons up: " + (e.scrollTop >= lh) +
                        " down: " + (bottom < end && !scrollable.autoscroll))
    }

    const scroll_to = (e, p) => { // element, position
        log("scroll_to: " + p)
        is_programmatic_scroll = true
        if (p == scroll_position) return
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
        log("scroll_to_top")
        scroll_to(e, 0)
        scrollable.autoscroll = false
    }

    const scroll_to_bottom = (e) => {
        log("scroll_to_bottom")
        scroll_to(e, scroll_to_bottom_top_position(e))
        if (appending()) {
            scrollable.autoscroll = true
            show_hide(false, button_bottom)
        }
    }

    const scroll = (e) => {
        log("scroll() .scrollTop: " + e.scrollTop)
        const lh = line_height(e)
        const bottom = e.scrollTop + e.clientHeight
        const end = e.scrollHeight - lh
        if (appending() && bottom >= end && !scrollable.autoscroll) {
            scrollable.autoscroll = true
            show_hide(false, button_bottom)
            show_hide(true,  button_top)
        }
        if (!is_programmatic_scroll && appending()) {
            if (scrollable.autoscroll && bottom < end) {
                scrollable.autoscroll = false
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
        log("touch_move")
        force_layout(e)
        scrollable.autoscroll = false
        update_buttons_later(e)
    }

    const scroll_end = (e) => {
        log("scroll_end")
        if (later) clearTimeout(later)
        later = setTimeout(() => {
            later = null
            update_buttons(e)
        }, 100)
    }

    list.addEventListener('scroll',    () => scroll(list))
    list.addEventListener('scrolled',  () => scroll_end(list))
    list.addEventListener('touchmove', () => touch_move(list))

    const observer = new MutationObserver(function(mutationsList, observer) {
        /*
        let log_mutation = console.log
        log_mutation = () => {}
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                log_mutation('Child list change:', mutation);
                mutation.addedNodes.forEach(node => {
                    log_mutation("Added node:", node)
                })
                mutation.removedNodes.forEach(node => {
                    log_mutation("Removed node:", node)
                })
            } else if (mutation.type === 'characterData') {
                log_mutation("Text content change:", mutation)
            } else if (mutation.type === 'attributes') {
                log_mutation("Attribute change:", mutation)
            }
        }
        */
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

    observer.observe(list, config);
    
    scrollable.autoscroll = false
    scrollable.scroll_to_top    = () => scroll_to_top(list)
    scrollable.scroll_to_bottom = () => scroll_to_bottom(list)
    
    button_top.addEventListener('click',    () => scrollable.scroll_to_top())
    button_bottom.addEventListener('click', () => scrollable.scroll_to_bottom())

    update_buttons(list)

    return scrollable
}

