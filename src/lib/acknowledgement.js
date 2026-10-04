// The short, warm line shown right after an entry is saved. Specific and
// true ("That's your third entry this week") rather than generic praise,
// which goes hollow fast. Never mentions breaking streaks or anything that
// adds pressure. No AI: it's instant.

const DAY_MS = 24 * 60 * 60 * 1000
const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 300, 365, 500]
const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh"]
const NUMBERS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"]

const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

function mondayOf(date) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return d
}

// consecutive days with an entry, counting back from today
function daysInARow(dates, now) {
    const days = new Set(dates.map(dayKey))
    let streak = 0
    const cursor = new Date(now)
    while (days.has(dayKey(cursor))) {
        streak++
        cursor.setDate(cursor.getDate() - 1)
    }
    return streak
}

/*
previousEntries: the entries that existed before this one (with createdAt)
body: what was just written. returns one short line.
*/
export function acknowledgementFor(previousEntries, body, now = new Date()) {
    const dates = previousEntries.map(e => new Date(e.createdAt))
    const total = dates.length + 1
    const words = body.trim().split(/\s+/).filter(Boolean).length
    const last = dates.length ? new Date(Math.max(...dates)) : null
    const thisWeek = dates.filter(d => d >= mondayOf(now)).length + 1
    const streak = daysInARow([...dates, now], now)
    const hour = now.getHours()

    if (total === 1) return "Your first entry. This is where it starts."
    if (last && now - last >= 5 * DAY_MS) return "Welcome back. Good to see you writing again."
    if (MILESTONES.includes(total)) return `That’s your ${total}th entry. It’s quietly adding up.`
    if (streak >= 3) return `${NUMBERS[streak] ?? streak} days in a row. Nice rhythm.`
    if (words >= 300) return "That was a lot to get out. Glad it’s on the page."
    // from the third entry of a week — "second entry this week" would fire too often to mean anything
    if (thisWeek >= 3 && thisWeek < ORDINALS.length) return `That’s your ${ORDINALS[thisWeek]} entry this week.`
    if (hour >= 21 || hour < 3) return "A good way to close out the day."
    if (hour >= 5 && hour < 10) return "A good start to the day."

    // something simple, varied by how many entries there are so it doesn't repeat every time
    const simple = ["Got it all down.", "Written and saved.", "Out of your head and onto the page.", "All saved. Nice one."]
    return simple[total % simple.length]
}
