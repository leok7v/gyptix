"use strict"

export const word_count = s => s.trim().split(/\s+/).filter(Boolean).length

export const capitalize = (s) => {
    const cp = s.codePointAt(0)
    const fc = String.fromCodePoint(cp)
    return fc.toLocaleUpperCase() + s.slice(fc.length)
}

export const timestamp_label = (timestamp) => {
    const d = new Date(timestamp)
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    const options = { hour: "2-digit", minute: "2-digit",
                    second: "2-digit", hour12: true }
    const time = d.toLocaleTimeString(undefined, options) ||
                 `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
    return `${days[d.getDay()]} ${time}`
}

const stop_words = new Set([
        "were", "this", "that", "there", "which", "their", "would",
        "could", "with", "should", "about", "because", "after", "before",
        "where", "while", "again", "said", "says", "from", "into", "over",
        "what", "when", "more", "less", "ever", "your"
])

const shorten_the_sentence = (str, limit) => {
    const words = str.split(/\s+/).filter(Boolean) // Remove empty words
    let result = ""
    for (let word of words) {
        if ((result.length + word.length + (result ? 1 : 0)) > limit) break
        result += (result ? " " : "") + word
    }
    return result
}

export const summarize = (str) => {
    // three most frequent words
    if (typeof str !== "string") { return timestamp_label(timestamp()) }
    const words = str.toLowerCase().match(/\b\w+\b/g) || []
    if (words.length === 0) { return timestamp_label(timestamp()) }
    let map = new Map()
    for (let word of words) {
        if (word.endsWith("s")) {
            let singular = word.slice(0, -1)
            if (map.has(singular)) {
                word = singular
            }
        }
        if (word.length <= 3 || word.startsWith("the") || stop_words.has(word)) {
            continue
        }
        map.set(word, (map.get(word) || 0) + 1)
    }
    const sorted = [...map.entries()]
        .sort((a, b) => b[1] - a[1] ||
                       a[0].localeCompare(b[0]))
    for (let i = 0; i < sorted.length; i++) {
        let [w, c] = sorted[i] // `w` word, `c` count
        if (c < 3) break
        console.log(`${w} ${c}`)
    }
    let s = [...map.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(entry => entry[0])
        .join(" ")
    s = shorten_the_sentence(s, 24)
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export const substitutions = (text) => {
    // `text` input string
    const now = new Date()
    const replacements = {
        '[insert current date]': now.toLocaleDateString(),
        '[insert day of the week]': now.toLocaleDateString(undefined, {
            weekday: 'long'
        }),
        '[insert current time]': now.toLocaleTimeString()
    }
    const pattern = new RegExp(
        Object.keys(replacements)
            .map(k => k.replace(/[\[\]]/g, '\\$&'))
            .join('|'),
        'gi'
    )
    text = text.replace(pattern,
        match => replacements[match.toLowerCase()] || match
    )
    // strip remaining bracketed text except markdown markdown links:
    text = text.replace(
        /(\[[^\]]+\]\([^)]*\))|(\[[^\]]+\])/g,
        (match, link) => link ? match : ''
    )
    return text
}

export const long_title = s0 => {
    let s = substitutions(s0)
    let r = ""
    for (let line of s.trim().split("\n")) {
        let t = line.trim()
          .replace(/['".]/g, '')   // strip ', ", .
          .replace(/[#*_~]+/g, '') // strip markdown chars
          // remove leading “title” (case-insensitive)
          // with optional dot/spaces/colon
          .replace(/^\s*\.?\s*title\s*:?\s*/i, '')
          .trim()
        if (t.length >= 4) { 
            r = t
            break
        }
    }
    return capitalize(r)
}

// en_dash: '\u2013' == '–'
// em_dash: '\u2014' == '—'

const punctuation = ',:;\u2013\u2014'

export const short_title = (s, maximum) => {
    for (let i = 0; i < punctuation.length; i++) {
        const ix = s.indexOf(punctuation.charAt(i))
        if (ix >= 4) { s = s.slice(0, ix).trim() }
    }
    const words = s.split(/\s+/);
    let out = '';
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const n = i < words.length - 1 ? words[i + 1] : '';
        if (out === '') {
            if (w.length <= maximum) {
                out = w;
            } else {
                out = w.slice(0, maximum);
                break;
            }
        } else if (i > 0 && w.length <= 3 && n != '') {
            // do not end with short words hanging:
            if (out.length + 1 + w.length + 1 + n.length <= maximum) {
                out += ' ' + w;
            } else {
                break;
            }
        } else if (out.length + 1 + w.length <= maximum) {
            out += ' ' + w;
        } else {
            break;
        }
    }
//  console.log(`out: "${out}":${out.length}`)
    return capitalize(out)
}
