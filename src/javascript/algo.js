"use strict"

export const longest_duplicate_substring = s => {
    const mod  = 2147483647          // 2**31 – 1
    const base = 256
    const search = len => {
        let h = 0                   // `h` rolling hash
        let p = 1                   // `p` base^len mod `mod`
        for (let i = 0; i < len; i++) {
            h = (h * base + s.charCodeAt(i)) % mod
            p = (p * base) % mod
        }
        const seen = new Map()      // hash → [index]
        seen.set(h, [0])
        for (let i = len; i < s.length; i++) {
            h = (h * base + s.charCodeAt(i)) % mod
            h = (h -
                  (s.charCodeAt(i - len) * p) % mod +
                  mod) % mod
            if (seen.has(h)) {
                for (let j of seen.get(h)) {
                    if (s.slice(j, j + len) ===
                        s.slice(i - len + 1, i + 1)) return j
                }
                seen.get(h).push(i - len + 1)
            } else {
                seen.set(h, [i - len + 1])
            }
        }
        return -1
    }
    let lo = 1
    let hi = s.length - 1
    let pos = -1
    while (lo <= hi) {
        let mid = (lo + hi) >> 1
        let idx = search(mid)
        if (idx !== -1) { pos = idx; lo = mid + 1 }
        else            { hi = mid - 1 }
    }
    return pos === -1 ? '' : s.slice(pos, pos + lo - 1)
}

/*

    longest_duplicate_substring

    https://algomaster.io/practice/dsa-patterns
    https://github.com/AlgoMaster-io/leetcode-solutions/blob/main/typescript/longest-duplicate-substring.md

    Time: O(n log n) average / expected
        We binary‑search the answer length (log n iterations).
        For each candidate length ℓ, the search(ℓ) routine slides
        a window once across the string (O(n)), maintaining a
        rolling hash (O(1) per shift). A real substring comparison
        is done only when hashes collide; with a good 32‑bit modulus
        the expected number of collisions is constant, so the expected
        cost per search remains O(n). Hence O(n) · O(log n) overall.
        In a contrived worst case with many hash collisions,
        the extra slice comparisons could push the bound toward O(n²),
        but that is atypical.
    Space: O(n)
        In the worst step of the search we keep a Map whose size is
        at most the number of windows scanned (≤ n). A few scalar
        variables are O(1), so total auxiliary space is linear
        in the input length.

    UTF-16:
    
    const base = 65536 // 2¹⁶   covers every UTF‑16 code‑unit
    Leave it at 256?
        You can keep base = 256; collisions just become 256 × more likely.
        Because the code already does a substring equality check when
        hashes match, the algorithm remains correct; only the expected
        running time grows by the extra (still tiny) collision rate.
        For most practical inputs you will not notice a slowdown.
        
    Collision rate / speed: If you process a lot of non‑ASCII text
        or want the mathematically “clean” version, switch the base
        to 65536 (or another prime > 65535). Otherwise leaving it
        at 256 is usually fine.
        
*/

