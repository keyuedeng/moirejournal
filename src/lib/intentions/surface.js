// Decides which open loops come back on the journal page, and why.
// Pure functions (no DB) so the rules are easy to read and test.

const DAY_MS = 24 * 60 * 60 * 1000

export const MAX_SURFACED = 3
// once shown, an item stays in the strip for the rest of that sitting
// (and if you come back later the same day) instead of flickering away
const STICKY_MS = 16 * 60 * 60 * 1000
// ignored items back off: 1, 2, 4, 8 days
const MAX_COOLDOWN_DAYS = 8
const STALE_DAYS = 21
const STALE_IGNORES = 3
// away this long → "since you were last here"
export const RETURN_AFTER_DAYS = 3

const days = ms => ms / DAY_MS

function lastTouched(item) {
    return item.lastInteractedAt ?? item.createdAt
}

// shown before and nothing done with it since → it was ignored
export function wasIgnored(item) {
    if (!item.lastSurfacedAt) return false
    return !item.lastInteractedAt || item.lastInteractedAt < item.lastSurfacedAt
}

// recently shown and not acted on yet. once you act on it ("keep",
// "made progress"), it leaves until it has a new reason to come back
function isSticky(item, now) {
    if (!item.lastSurfacedAt || now - item.lastSurfacedAt >= STICKY_MS) return false
    return !item.lastInteractedAt || item.lastInteractedAt < item.lastSurfacedAt
}

function cooldownOver(item, now) {
    if (!item.lastSurfacedAt) return true
    const cooldownDays = Math.min(2 ** item.ignoredCount, MAX_COOLDOWN_DAYS)
    return days(now - item.lastSurfacedAt) >= cooldownDays
}

/*
why an item deserves attention right now, and how much:
- overdue / due  → tasks near or past their due date
- checkIn        → goals whose check-in date has come
- stale          → untouched for 3 weeks, or ignored 3 times → "still want this?"
returns { reason, score } — reason null means nothing pressing
*/
export function assess(item, now = new Date()) {
    const sinceTouched = days(now - lastTouched(item))
    const neglect = Math.min(sinceTouched / 7, 1)
    const fatigue = 0.5 * item.ignoredCount

    if (sinceTouched >= STALE_DAYS || item.ignoredCount >= STALE_IGNORES) {
        return { reason: "stale", score: 1.5 + neglect }
    }

    let reason = null
    let urgency = 0
    if (item.kind === "TASK" && item.dueAt) {
        const left = days(item.dueAt - now)
        if (left <= 0) { reason = "overdue"; urgency = 3 }
        else if (left <= 2) { reason = "due"; urgency = 2 }
        else if (left <= 4) { reason = "due"; urgency = 1 }
    } else if (item.kind === "GOAL" && item.nextCheckInAt && item.nextCheckInAt <= now) {
        reason = "checkIn"
        urgency = 2
    }

    if (!reason) return { reason: null, score: 0 }
    return { reason, score: urgency + neglect - fatigue }
}

/*
picks up to MAX_SURFACED active loops for the strip.
- items already shown in this sitting stay (so the strip doesn't reshuffle)
- otherwise an item needs a reason, a score >= 1, no snooze, and its cooldown over
returns [{ item, reason, isNew }] — isNew = being surfaced now (not sticky)
*/
export function pickSurfaced(activeItems, now = new Date()) {
    const sticky = []
    const candidates = []

    for (const item of activeItems) {
        if (item.snoozeUntil && item.snoozeUntil > now) continue
        const { reason, score } = assess(item, now)

        if (isSticky(item, now)) {
            // keep it in the strip; fall back to a neutral reason if it's
            // no longer pressing (e.g. its due date was just pushed out)
            sticky.push({ item, reason: reason ?? "open", score: Infinity, isNew: false })
        } else if (reason && score >= 1 && cooldownOver(item, now)) {
            candidates.push({ item, reason, score, isNew: true })
        }
    }

    candidates.sort((a, b) => b.score - a.score)
    return [...sticky, ...candidates].slice(0, MAX_SURFACED)
}
