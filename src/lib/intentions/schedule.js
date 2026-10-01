// Turns a horizon ("this week") into real dates. Runs in the browser so
// "end of the week" means the user's own Sunday night, not the server's.

const DAY_MS = 24 * 60 * 60 * 1000

// how often a confirmed goal gets a "how's it going?" check-in
const GOAL_CHECK_IN_DAYS = { WEEK: 3, MONTH: 7, SOMEDAY: 14 }

// end of the coming Sunday. On a Sunday that means next Sunday, so
// "this week" never turns into "by tonight".
export function endOfWeek(now = new Date()) {
    const d = new Date(now)
    const daysUntilSunday = (7 - d.getDay()) % 7 || 7
    d.setDate(d.getDate() + daysUntilSunday)
    d.setHours(23, 59, 59, 999)
    return d
}

export function endOfMonth(now = new Date()) {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
}

export function addDays(days, now = new Date()) {
    return new Date(now.getTime() + days * DAY_MS)
}

/*
dates for a loop the user just confirmed (or checked in on):
- TASK: a due date at the end of the week/month, none for someday
- GOAL: the next check-in, every few days depending on the horizon
- WISH: no dates — it only comes back through context or the weekly review
*/
export function scheduleFor(kind, horizon, now = new Date()) {
    if (kind === "TASK") {
        if (horizon === "WEEK") return { dueAt: endOfWeek(now), nextCheckInAt: null }
        if (horizon === "MONTH") return { dueAt: endOfMonth(now), nextCheckInAt: null }
        return { dueAt: null, nextCheckInAt: null }
    }
    if (kind === "GOAL") {
        return { dueAt: null, nextCheckInAt: addDays(GOAL_CHECK_IN_DAYS[horizon] ?? GOAL_CHECK_IN_DAYS.SOMEDAY, now) }
    }
    return { dueAt: null, nextCheckInAt: null }
}
