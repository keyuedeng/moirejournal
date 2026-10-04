"use client"
import { useMemo } from "react"

const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// The last 5 calendar weeks (about a month, rolling — this week plus the
// four before), laid out like a calendar: each row is one week,
// Monday to Sunday left to right; rows run oldest (top) to newest (bottom).
// Days after today are null (left blank), so every column is always the
// same weekday.
const ACTIVITY_WEEKS = 7

function buildActivityWeeks(entries) {
    const counts = new Map()
    entries.forEach(e => {
        const key = dateKey(new Date(e.createdAt))
        counts.set(key, (counts.get(key) || 0) + 1)
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const thisMonday = new Date(today)
    thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7))

    const weeks = []
    for (let w = ACTIVITY_WEEKS - 1; w >= 0; w--) {
        const monday = new Date(thisMonday)
        monday.setDate(monday.getDate() - 7 * w)
        const week = []
        for (let d = 0; d < 7; d++) {
            const day = new Date(monday)
            day.setDate(day.getDate() + d)
            const key = dateKey(day)
            week.push(day > today ? null : { key, date: day, count: counts.get(key) || 0 })
        }
        weeks.push({ monday, days: week })
    }
    return weeks
}

function activityColor(count) {
    if (count === 0) return "bg-hush"
    if (count === 1) return "bg-brand/35"
    if (count === 2) return "bg-brand/65"
    return "bg-brand"
}

// "Your rhythm" on the journal page
export default function ActivityStrip({ entries, compact = false }) {
    const weeks = useMemo(() => buildActivityWeeks(entries), [entries])
    // the right-hand rail is narrow, so the squares can be bigger there
    const cell = compact ? "w-4 h-4 rounded-[3px]" : "w-3 h-3 rounded-[2px]"
    const gap = compact ? "gap-1" : "gap-[3px]"

    // a month name beside the first week that starts in that month
    const monthLabel = (week, i) => {
        const prev = weeks[i - 1]
        if (i > 0 && prev.monday.getMonth() === week.monday.getMonth()) return ""
        return week.monday.toLocaleDateString("en-US", { month: "short" })
    }

    // Show the grid from day one — an all-empty grid still communicates
    // "this is where your rhythm will show up," which is more useful than
    // the widget (and its rail-card title) just not being there yet.
    return (
        <div className={compact ? "space-y-2" : "mb-6 flex items-end gap-4 px-1"}>
            {/* in the rail card, nudged in from the left so it doesn't leave a gap on the right */}
            <div className={`flex flex-col ${gap} ${compact ? "pl-5" : ""}`}>
                {/* weekday headings */}
                <div className={`flex ${gap} text-[10px] leading-3 text-faint`}>
                    {/* same spacer as the month labels, so the letters sit over their columns */}
                    <span className="w-8 shrink-0" />
                    {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                        <span key={i} className={`${compact ? "w-4" : "w-3"} text-center`}>{d}</span>
                    ))}
                </div>
                {weeks.map((week, wi) => (
                    <div key={wi} className={`flex items-center ${gap}`}>
                        <span className="w-8 shrink-0 text-[10px] leading-3 text-faint">{monthLabel(week, wi)}</span>
                        {week.days.map((day, di) => day ? (
                            <div
                                key={day.key}
                                title={`${day.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${day.count ? ` · ${day.count} ${day.count === 1 ? 'entry' : 'entries'}` : ''}`}
                                className={`${cell} ${activityColor(day.count)}`}
                            />
                        ) : (
                            <div key={`future-${di}`} className={cell} />
                        ))}
                    </div>
                ))}
            </div>
            {/* follows ACTIVITY_WEEKS, so it stays right if that changes */}
            <span className={`block text-sm text-faint shrink-0 ${compact ? "pl-5" : ""}`}>
                last {ACTIVITY_WEEKS} weeks
            </span>
        </div>
    )
}
