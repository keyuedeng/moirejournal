"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Check } from "lucide-react"
import { scheduleFor } from "@/lib/intentions/schedule"
import { patchIntention } from "@/components/intentions/api"
import { ChoiceButton, ResolvedLine } from "@/components/intentions/ui"
import NudgeRow from "@/components/patterns/NudgeRow"
import { addWeeks, formatWeek, relativeWeekLabel, reviewWeekStart } from "@/lib/review/week"

const KIND_DOT = { TASK: "bg-brand", GOAL: "bg-sage", WISH: "bg-lilac" }

async function fetchPart(part, weekStart, current) {
    const params = new URLSearchParams({ start: weekStart.toISOString(), part, ...(current && { current: "1" }) })
    const res = await fetch(`/api/review?${params}`)
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

/*
The weekly look back: a calm way to wrap up a week. First a quiet moment
(a short reflection and a line you wrote), then the practical part (what
you closed, tidying what's still open, a pattern nudge), then a gentle
look ahead. No stats, streaks or scores.

The loops come straight from the database and show at once; the
reflection may need the model, so it fills in when it's ready.
Past weeks are read-only — tidying is about your loops as they are now.
*/
export default function WeeklyReview() {
    const [weekStart, setWeekStart] = useState(() => reviewWeekStart())
    const [loops, setLoops] = useState(null)
    const [reflection, setReflection] = useState(null)
    const [error, setError] = useState(false)
    const isCurrent = weekStart.getTime() === reviewWeekStart().getTime()
    // the week the page is showing now — a slow response for a week the
    // user has already clicked away from is ignored
    const shownWeek = useRef(weekStart)

    // fetch only — clearing the old week's data happens where the week
    // changes (showWeek / retry), not inside the effect
    const load = useCallback(() => {
        const week = weekStart
        shownWeek.current = week
        const stillShown = () => shownWeek.current === week
        fetchPart("loops", week, isCurrent)
            .then(data => stillShown() && setLoops(data))
            .catch(err => { console.error("Failed to load the week's loops", err); if (stillShown()) setError(true) })
        fetchPart("reflection", week, isCurrent)
            .then(data => stillShown() && setReflection(data))
            .catch(err => { console.error("Failed to load the week's reflection", err); if (stillShown()) setReflection({ failed: true }) })
    }, [weekStart, isCurrent])

    useEffect(() => {
        load()
    }, [load])

    function clear() {
        setLoops(null)
        setReflection(null)
        setError(false)
    }

    function showWeek(offset) {
        clear()
        setWeekStart(w => addWeeks(w, offset))
    }

    return (
        <div>
            <header className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="font-display text-[34px] leading-tight font-medium text-ink">Your week</h1>
                    <p className="text-[15px] text-soft mt-1">
                        <span className="text-brand">{relativeWeekLabel(weekStart)}</span> · {formatWeek(weekStart)}
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    <WeekButton label="Previous week" onClick={() => showWeek(-1)}><ChevronLeft className="w-4 h-4" /></WeekButton>
                    <WeekButton label="Next week" disabled={isCurrent} onClick={() => showWeek(1)}><ChevronRight className="w-4 h-4" /></WeekButton>
                </div>
            </header>

            {error ? (
                <div className="py-16">
                    <p className="text-soft mb-3">Couldn’t load this week.</p>
                    <button onClick={() => { clear(); load() }} className="text-sm px-4 py-1.5 rounded-full border border-line text-soft hover:bg-hush transition">Try again</button>
                </div>
            ) : (
                // two columns on wide screens: the reflective part on the left,
                // the practical part (closed, tidy, nudge) on the right
                <div className="mt-8 grid lg:grid-cols-2 gap-x-10 gap-y-10 items-start">
                    <div className="space-y-6 min-w-0">
                        <Moment reflection={reflection} />
                        {isCurrent && <LookingAhead />}
                    </div>

                    <div className="space-y-10 min-w-0">
                        {!loops ? <LoopsSkeleton /> : (
                            <>
                                <Closed loops={loops} isCurrent={isCurrent} />
                                {isCurrent && <StillOpen loops={loops.stillOpen} nextWeekStart={addWeeks(weekStart, 1)} />}
                            </>
                        )}

                        {isCurrent && reflection?.nudge && (
                            <Section title="Something that keeps coming up">
                                <NudgeRow nudge={reflection.nudge} />
                            </Section>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// the quiet part: what this week held, and one line you wrote
function Moment({ reflection }) {
    const quote = reflection?.reflection?.quote
    return (
        <section className="rounded-2xl border border-line bg-surface shadow-soft p-6 md:p-7">
            {!reflection ? (
                <div className="space-y-3 animate-pulse" role="status" aria-live="polite">
                    <p className="text-sm italic text-faint">Looking back at your week…</p>
                    <div className="h-4 rounded bg-hush w-4/5" />
                    <div className="h-4 rounded bg-hush w-3/5" />
                </div>
            ) : reflection.reflection ? (
                <p className="text-lg leading-relaxed text-ink">{reflection.reflection.text}</p>
            ) : (
                <p className="text-base italic text-soft">
                    {reflection.entryCount === 0 ? "You didn’t write this week. That’s okay." : "Couldn’t put this week into words just now."}
                </p>
            )}

            {quote && (
                <div className="mt-6 pt-5 border-t border-hush">
                    <p className="text-xs text-faint mb-1.5">A line from your week</p>
                    <p className="text-base italic text-ink">“{quote}”</p>
                    {reflection.reflection.quoteDate && (
                        <p className="text-xs text-faint mt-1.5">
                            {new Date(reflection.reflection.quoteDate).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                        </p>
                    )}
                </div>
            )}
        </section>
    )
}

function Closed({ loops, isCurrent }) {
    const { closed, letGo } = loops
    if (closed.length === 0 && letGo.length === 0) {
        // past weeks with nothing closed just skip the section
        return isCurrent ? (
            <Section title="Closed">
                <p className="text-soft px-1">Nothing closed this week. That’s okay.</p>
            </Section>
        ) : null
    }
    return (
        <Section title="Closed" hint={closed.length > 0 ? `${closed.length} ${closed.length === 1 ? "loop" : "loops"}` : null}>
            {closed.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {closed.map(loop => (
                        <span key={loop.id} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border border-line bg-surface text-soft">
                            <Check className="w-3.5 h-3.5 text-brand" strokeWidth={2.5} /> {loop.text}
                        </span>
                    ))}
                </div>
            )}
            {letGo.length > 0 && (
                <p className="text-sm text-faint mt-3 px-1">
                    Let go: {letGo.map(l => l.text).join(", ")}. That counts too.
                </p>
            )}
        </Section>
    )
}

// tidying what's still open, with a sense of getting to the end of it
function StillOpen({ loops, nextWeekStart }) {
    const [sorted, setSorted] = useState(() => new Set())
    if (loops.length === 0) return null

    const mark = (id, isSorted) => setSorted(prev => {
        const next = new Set(prev)
        isSorted ? next.add(id) : next.delete(id)
        return next
    })
    const allSorted = sorted.size >= loops.length

    return (
        <Section title="Still open" hint={allSorted ? null : `${sorted.size} of ${loops.length} sorted`}>
            <ul className="rounded-2xl border border-line bg-surface shadow-soft px-5 divide-y divide-hush">
                {loops.map(loop => (
                    <TidyRow key={loop.id} loop={loop} nextWeekStart={nextWeekStart} onSorted={isSorted => mark(loop.id, isSorted)} />
                ))}
            </ul>
            {allSorted && (
                <p className="flex items-center gap-2 mt-4 px-1 text-ink animate-in fade-in">
                    <span className="w-5 h-5 rounded-full bg-brand flex items-center justify-center"><Check className="w-3 h-3 text-white" strokeWidth={3} /></span>
                    All sorted. You’re set for the week.
                </p>
            )}
        </Section>
    )
}

function LookingAhead() {
    return (
        <section className="rounded-2xl border border-line bg-surface shadow-soft p-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
                <p className="font-display text-[22px] font-medium text-ink">Anything you want to carry into next week?</p>
                <p className="text-sm text-soft mt-0.5">A few lines now can make Monday easier.</p>
            </div>
            <Link
                href={`/journal?theme=${encodeURIComponent("Looking ahead")}`}
                className="px-5 py-2 text-sm bg-brand text-white rounded-full hover:bg-brand-deep transition shrink-0"
            >
                Write it down
            </Link>
        </section>
    )
}

function Section({ title, hint, children }) {
    return (
        <section>
            <div className="flex items-baseline gap-2.5 mb-3 px-1">
                <h2 className="font-display text-[22px] font-medium text-ink">{title}</h2>
                {hint && <span className="text-sm text-faint">{hint}</span>}
            </div>
            {children}
        </section>
    )
}

function WeekButton({ label, onClick, disabled = false, children }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className="p-2 rounded-full border border-line text-soft hover:bg-hush transition disabled:opacity-30 disabled:hover:bg-transparent"
        >
            {children}
        </button>
    )
}

function LoopsSkeleton() {
    return (
        <div className="space-y-3 animate-pulse">
            <div className="h-5 rounded bg-hush w-24" />
            <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
                <div className="h-4 rounded bg-hush w-2/3" />
                <div className="h-4 rounded bg-hush w-1/2" />
            </div>
        </div>
    )
}

/*
one open loop to tidy: carry it into next week, move it to someday, or let
it go. Answers show straight away and save in the background; onSorted
keeps the "x of n sorted" count honest if a save fails.
*/
function TidyRow({ loop, nextWeekStart, onSorted }) {
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(false)

    function act(body, doneMessage) {
        setMessage(doneMessage)
        setError(false)
        onSorted(true)
        patchIntention(loop.id, body).catch(err => {
            console.error("Failed to update open loop", err)
            setMessage(null)
            setError(true)
            onSorted(false)
        })
    }

    const confirm = (horizon, doneMessage) => {
        // "next week" is scheduled from the start of next week, not today
        const { dueAt, nextCheckInAt } = scheduleFor(loop.kind, horizon, horizon === "WEEK" ? nextWeekStart : new Date())
        act({ action: "confirm", horizon, dueAt, nextCheckInAt }, doneMessage)
    }

    return (
        <li className="py-3.5">
            {message ? (
                <ResolvedLine message={message} />
            ) : (
                // stacked on phones, one line on wider screens
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                    <span className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${KIND_DOT[loop.kind]}`} />
                        <span className="text-[15px] text-ink">{loop.text}</span>
                    </span>
                    <span className="flex items-center gap-1.5 pl-4 sm:pl-0 shrink-0">
                        {loop.kind === "WISH" ? (
                            <ChoiceButton onClick={() => act({ action: "keep" }, "Kept for someday")}>Keep</ChoiceButton>
                        ) : (
                            <>
                                <ChoiceButton onClick={() => confirm("WEEK", "Carried into next week")}>Next week</ChoiceButton>
                                <ChoiceButton onClick={() => confirm("SOMEDAY", "Moved to someday")}>Someday</ChoiceButton>
                            </>
                        )}
                        <button
                            onClick={() => act({ action: "drop" }, "Let go. That counts too")}
                            className="text-sm px-2.5 py-1.5 text-faint hover:text-soft transition"
                        >
                            Let it go
                        </button>
                    </span>
                </div>
            )}
            {error && <p className="text-sm text-brand-deep mt-1">Couldn’t save that, try again?</p>}
        </li>
    )
}
