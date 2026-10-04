// Week maths for the weekly look back, in the browser's own timezone.
// Weeks run Monday to Sunday.

const DAY_MS = 24 * 60 * 60 * 1000

export function mondayOf(date) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return d
}

export function addWeeks(monday, n) {
    const d = new Date(monday)
    d.setDate(d.getDate() + 7 * n)
    return d
}

/*
which week the look back is about, today:
- Sunday: this week (it's ending)
- Monday: last week (it just ended)
- otherwise: this week so far
*/
export function reviewWeekStart(now = new Date()) {
    const monday = mondayOf(now)
    return now.getDay() === 1 ? addWeeks(monday, -1) : monday
}

// the journal shows "your week is ready" on Sundays and Mondays, until opened
export function isReviewDay(now = new Date()) {
    return now.getDay() === 0 || now.getDay() === 1
}

export function formatWeek(monday) {
    const sunday = new Date(monday.getTime() + 6 * DAY_MS)
    const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    return `${fmt(monday)} – ${fmt(sunday)}`
}

// "This week", "Last week", "3 weeks ago" — relative to the real calendar
export function relativeWeekLabel(monday, now = new Date()) {
    const weeks = Math.round((mondayOf(now) - monday) / (7 * DAY_MS))
    if (weeks <= 0) return "This week"
    if (weeks === 1) return "Last week"
    return `${weeks} weeks ago`
}
