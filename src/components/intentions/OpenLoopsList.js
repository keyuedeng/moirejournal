"use client"
import { useCallback, useEffect, useState } from "react"
import { Check } from "lucide-react"
import { LoopItem } from "./OpenLoops"
import { SuggestionRow, ResolvedLine } from "./PostEntryCard"

const DAY_MS = 24 * 60 * 60 * 1000

// same grouping as the journal panel, so a loop lives in the same place in both
function groupActive(active) {
    const now = Date.now()
    const dueThisWeek = item => item.dueAt && new Date(item.dueAt) - now <= 7 * DAY_MS
    const byDue = (a, b) => (new Date(a.dueAt ?? 8.64e15)) - (new Date(b.dueAt ?? 8.64e15))
    return [
        { key: "week", title: "This week", dot: "bg-brand", items: active.filter(i => i.kind === "TASK" && dueThisWeek(i)).sort(byDue) },
        { key: "ongoing", title: "Ongoing", dot: "bg-sage", items: active.filter(i => i.kind === "GOAL") },
        { key: "later", title: "Later", dot: "bg-stone-300", items: active.filter(i => i.kind === "TASK" && !dueThisWeek(i)).sort(byDue) },
        { key: "someday", title: "Someday", dot: "bg-lilac", items: active.filter(i => i.kind === "WISH") },
    ].filter(g => g.items.length > 0)
}

// "letting one go counts too" only makes sense when there's something to let go
function summaryLine(activeCount, closedThisWeek) {
    const closed = closedThisWeek === 1 ? "1 loop" : `${closedThisWeek} loops`
    if (activeCount === 0) {
        return closedThisWeek > 0
            ? `You're not holding any loops right now, and you closed ${closed} this week.`
            : "You're not holding any loops right now."
    }
    const holding = `You're holding ${activeCount} ${activeCount === 1 ? "loop" : "loops"}`
    return closedThisWeek > 0
        ? `${holding} and closed ${closedThisWeek} this week. Letting one go counts too.`
        : `${holding}. Letting one go counts too.`
}

// splits sections into two columns of roughly equal length (each section
// goes to whichever column is shorter so far), keeping their order
function balanceColumns(sections) {
    const columns = [[], []]
    const heights = [0, 0]
    for (const section of sections) {
        const i = heights[0] <= heights[1] ? 0 : 1
        columns[i].push(section)
        heights[i] += section.size + 1.5 // + the heading
    }
    return columns
}

/*
the body of the /loops page: a one-line summary, suggestions you never
answered, your loops grouped like the journal panel, and what you
closed lately (so finishing things feels like progress)
*/
export default function OpenLoopsList({ onWriteAbout }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState(false)
    const [answered, setAnswered] = useState({}) // suggestion id -> message

    const load = useCallback(async () => {
        setError(false)
        try {
            const res = await fetch("/api/intentions")
            if (!res.ok) throw new Error(await res.text())
            setData(await res.json())
        } catch (err) {
            console.error("Failed to load open loops", err)
            setError(true)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    if (error) {
        return (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-soft">Couldn't load your open loops.</p>
                <button onClick={load} className="text-sm px-4 py-1.5 rounded-full border border-line text-soft hover:bg-hush transition">
                    Try again
                </button>
            </div>
        )
    }

    if (!data) return <p className="italic text-base text-faint">Loading your open loops…</p>

    const { active, suggested, closed } = data
    const closedThisWeek = closed.filter(item => Date.now() - new Date(item.completedAt) <= 7 * DAY_MS).length

    if (active.length === 0 && suggested.length === 0 && closed.length === 0) {
        return (
            <div className="py-12 max-w-md">
                <p className="italic text-lg text-soft">No open loops yet.</p>
                <p className="text-soft mt-2">
                    When you write about something you want or need to do, you'll be asked if you want to hold onto it.
                </p>
            </div>
        )
    }

    return (
        <div>
            <p className="text-[15px] text-soft mt-3">{summaryLine(active.length, closedThisWeek)}</p>

            {suggested.length > 0 && (
                <section className="mt-6 rounded-2xl border border-brand/20 bg-brand-soft/50 px-5 py-1">
                    <p className="text-sm text-soft pt-3">
                        {suggested.length === 1 ? "1 thing you haven't decided on" : `${suggested.length} things you haven't decided on`}
                    </p>
                    <ul className="divide-y divide-brand/15">
                        {suggested.map(item => (
                            <li key={item.id} className="py-3">
                                {answered[item.id] ? (
                                    <ResolvedLine message={answered[item.id]} />
                                ) : (
                                    <SuggestionRow
                                        item={item}
                                        onResolved={(message, saved) => {
                                            setAnswered(prev => ({ ...prev, [item.id]: message }))
                                            saved.then(ok => {
                                                if (ok) load()
                                                else setAnswered(prev => ({ ...prev, [item.id]: "Couldn't save that, try again" }))
                                            })
                                        }}
                                    />
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* two balanced columns on wide screens so rows don't stretch edge to edge */}
            <div className="mt-2 grid lg:grid-cols-2 gap-x-8 items-start">
                {balanceColumns([
                    ...groupActive(active).map(group => ({
                        key: group.key,
                        size: group.items.length * 2,
                        node: (
                            <section key={group.key} className="mt-6">
                                <div className="flex items-center gap-2 mb-1.5 px-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${group.dot}`} />
                                    <h2 className="font-display text-[22px] font-medium text-ink">{group.title}</h2>
                                    <span className="text-sm text-faint">{group.items.length}</span>
                                </div>
                                <ul className="rounded-2xl border border-line bg-surface shadow-soft px-4 divide-y divide-hush">
                                    {group.items.map(item => (
                                        <LoopItem key={item.id} item={item} detailed onChanged={load} onWriteAbout={onWriteAbout} />
                                    ))}
                                </ul>
                            </section>
                        ),
                    })),
                    ...(closed.length > 0 ? [{
                        key: "closed",
                        size: closed.length,
                        node: (
                            <section key="closed" className="mt-6 px-1">
                                <h2 className="text-sm text-faint mb-2">Closed lately</h2>
                                <ul className="space-y-1.5">
                                    {closed.map(item => (
                                        <li key={item.id} className="flex items-center gap-2.5 text-sm text-faint">
                                            <span className="w-[18px] h-[18px] rounded-full bg-brand/80 flex items-center justify-center shrink-0">
                                                <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                            </span>
                                            <span className="line-through decoration-stone-300 min-w-0 truncate">{item.text}</span>
                                            <span className="text-xs ml-auto shrink-0 tabular-nums">
                                                {new Date(item.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ),
                    }] : []),
                ]).map((column, i) => (
                    <div key={i} className="min-w-0">{column.map(section => section.node)}</div>
                ))}
            </div>
        </div>
    )
}
