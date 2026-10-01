"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Check, MoreHorizontal } from "lucide-react"
import { scheduleFor, addDays } from "@/lib/intentions/schedule"
import { patchIntention, DAY_MS } from "./api"
import { ChoiceButton } from "./PostEntryCard"

const SNOOZE_DAYS = 2
// how long a ticked-off loop stays (crossed out, with Undo) before it goes
const UNDO_MS = 4000

/*
The open loops card on the journal page (top of the right-hand rail, or
under the editor on narrower screens). A short version of /loops: what you
said you'd do this week, your ongoing goals, and a glimpse of what's later.
Prompts ("how's it going?") show inline on the row they belong to.
data: shape returned by GET /api/intentions/surface
*/
export default function OpenLoops({ data, onChanged, onWriteAbout, className = "" }) {
    if (!data || data.activeCount === 0) return null

    const { thisWeek, ongoing, later, moreThisWeek, moreLater, wishCount, closedThisWeek } = data
    const nothingListed = thisWeek.length + ongoing.length + later.length === 0
    const row = item => (
        <LoopItem key={item.id} item={item} onChanged={onChanged} onWriteAbout={onWriteAbout} />
    )

    return (
        <section
            className={`border border-line rounded-2xl p-5 bg-surface shadow-soft ${className}`}
            aria-label="Open loops"
        >
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-xl font-medium text-ink">
                    {data.mode === "return" ? "Since you were last here" : "Open loops"}
                </h3>
                <Link href="/loops" className="text-xs text-faint hover:text-soft transition shrink-0">
                    See all {data.activeCount} →
                </Link>
            </div>
            <p className="text-xs text-faint">
                {closedThisWeek > 0
                    ? <><span className="text-brand-deep">{closedThisWeek} closed</span> this week</>
                    : "Things you said you'd do"}
            </p>

            {thisWeek.length > 0 && (
                <PanelSection title="This week" dot="bg-brand" more={moreThisWeek}>{thisWeek.map(row)}</PanelSection>
            )}
            {ongoing.length > 0 && (
                <PanelSection title="Ongoing" dot="bg-sage">{ongoing.map(row)}</PanelSection>
            )}
            {later.length > 0 && (
                <PanelSection title="Later" dot="bg-stone-300" more={moreLater}>{later.map(row)}</PanelSection>
            )}

            {nothingListed && <p className="mt-3 italic text-sm text-soft">Nothing due this week.</p>}
            {wishCount > 0 && (
                <Link href="/loops" className="flex items-center gap-2 mt-4 text-xs text-faint hover:text-soft transition">
                    <span className="w-1.5 h-1.5 rounded-full bg-lilac" />
                    + {wishCount} {wishCount === 1 ? "wish" : "wishes"} for someday
                </Link>
            )}
        </section>
    )
}

function PanelSection({ title, dot, more = 0, children }) {
    return (
        <div className="mt-4">
            <h4 className="flex items-center gap-2 text-xs text-faint mb-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                {title}
            </h4>
            <ul>{children}</ul>
            {more > 0 && (
                <Link href="/loops" className="text-xs text-faint hover:text-soft transition pl-7">
                    + {more} more
                </Link>
            )}
        </div>
    )
}

function dueLabel(dueAt) {
    if (!dueAt) return null
    const due = new Date(dueAt)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dueDay = new Date(due)
    dueDay.setHours(0, 0, 0, 0)
    const days = Math.round((dueDay - today) / DAY_MS)
    if (due < new Date()) return { text: "overdue", overdue: true }
    if (days === 0) return { text: "today" }
    if (days === 1) return { text: "tomorrow" }
    if (days < 7) return { text: due.toLocaleDateString("en-US", { weekday: "short" }) }
    return { text: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }) }
}

const CADENCE = { WEEK: "weekly", MONTH: "monthly" }

/*
one loop: a circle to tick it off (with a few seconds to undo), the loop,
when it's due (or how often, for a goal), a … menu for snooze/drop,
and an inline prompt when the surfacing rules gave it one.
detailed (the /loops page): roomier, with the user's quote underneath,
or a wish's first step
*/
export function LoopItem({ item, onChanged, onWriteAbout, detailed = false }) {
    const [state, setState] = useState("open") // open | closing | gone
    const [promptMessage, setPromptMessage] = useState(null)
    const [error, setError] = useState(false)
    const goneTimer = useRef(null)
    // this row's saves, in order — so an Undo can't overtake the "done" it undoes
    const pending = useRef(Promise.resolve(true))

    useEffect(() => () => clearTimeout(goneTimer.current), [])

    // Every action shows its result straight away and saves in the background
    // (a round trip to the database can take over a second). Resolves to
    // whether the save worked, so the caller can roll back if it didn't.
    function save(body) {
        setError(false)
        const run = pending.current.then(() => patchIntention(item.id, body).then(
            () => true,
            err => {
                console.error("Failed to update open loop", err)
                setError(true)
                return false
            },
        ))
        pending.current = run
        return run
    }

    // leave quietly after a moment, then let the panel refetch — once the
    // save has landed, so the refetch doesn't bring the row straight back
    function leaveAfter(ms) {
        clearTimeout(goneTimer.current)
        goneTimer.current = setTimeout(async () => {
            await pending.current
            setState("gone")
            onChanged?.()
        }, ms)
    }

    function tickOff() {
        setState("closing")
        leaveAfter(UNDO_MS)
        save({ action: "done" }).then(ok => {
            if (!ok) {
                clearTimeout(goneTimer.current)
                setState("open")
            }
        })
    }

    function undo() {
        clearTimeout(goneTimer.current)
        setState("open")
        save({ action: "reopen" }).then(ok => {
            // couldn't reopen: it's still done on the server, so let it go
            if (!ok) leaveAfter(1500)
        })
    }

    function fromMenu(body) {
        setState("gone")
        save(body).then(ok => {
            if (ok) onChanged?.()
            else setState("open")
        })
    }

    function answerPrompt(body, message) {
        setPromptMessage(message)
        save(body).then(ok => {
            if (ok) setTimeout(() => onChanged?.(), 1500)
            else setPromptMessage(null)
        })
    }

    if (state === "gone") return null

    const closing = state === "closing"
    const due = dueLabel(item.dueAt)
    const meta = item.kind === "GOAL" ? CADENCE[item.horizon] : due?.text
    const nextCheckIn = () => scheduleFor("GOAL", item.horizon ?? "WEEK").nextCheckInAt

    return (
        <li className={`${detailed ? "py-3" : "py-1.5"} transition-opacity`}>
            <div className="flex items-start gap-2.5">
                <button
                    onClick={closing ? undo : tickOff}
                   
                    aria-label={closing ? `Undo closing "${item.text}"` : `Close loop: ${item.text}`}
                    title={closing ? "Undo" : "Done"}
                    className={`mt-0.5 w-[18px] h-[18px] rounded-full border-[1.5px] shrink-0 flex items-center justify-center transition ${
                        closing
                            ? "bg-brand border-brand"
                            : `${item.kind === "GOAL" ? "border-dashed" : ""} border-neutral-300 hover:border-brand hover:bg-brand-soft`
                    }`}
                >
                    {closing && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </button>

                <span className="flex-1 min-w-0">
                    <span
                        title={!detailed && item.sourceQuote ? `“${item.sourceQuote}”` : undefined}
                        className={`block leading-snug ${detailed ? "text-[15px] font-bold" : "text-sm"} ${closing ? "text-faint line-through" : "text-ink"}`}
                    >
                        {item.text}
                    </span>
                    {detailed && (item.kind === "WISH" && item.suggestedStep ? (
                        <span className="block text-sm text-soft mt-0.5">First step: {item.suggestedStep}</span>
                    ) : item.sourceQuote && (
                        <span className="block italic text-sm text-soft mt-0.5 truncate">“{item.sourceQuote}”</span>
                    ))}
                </span>

                {closing ? (
                    <button onClick={undo} className="text-xs text-faint hover:text-soft shrink-0">
                        Undo
                    </button>
                ) : (
                    <>
                        {meta && (
                            <span className={`text-xs shrink-0 mt-px ${due?.overdue ? "text-brand-deep" : "text-faint"}`}>
                                {meta}
                            </span>
                        )}
                        <RowMenu
                            canSnooze={item.kind !== "WISH"}
                            onSnooze={() => fromMenu({ action: "snooze", until: addDays(SNOOZE_DAYS) })}
                            onDrop={() => fromMenu({ action: "drop" })}
                        />
                    </>
                )}
            </div>

            {!closing && item.prompt && (
                <div className="pl-7 mt-1">
                    {promptMessage ? (
                        <p className="text-xs text-soft">{promptMessage}</p>
                    ) : item.prompt === "checkIn" ? (
                        <>
                            <p className="italic text-sm text-soft mb-1.5">How's it going?</p>
                            <div className="flex flex-wrap gap-1">
                                <ChoiceButton onClick={() => answerPrompt({ action: "checkIn", nextCheckInAt: nextCheckIn() }, "Nice, keep going")}>Made progress</ChoiceButton>
                                <ChoiceButton onClick={() => answerPrompt({ action: "checkIn", nextCheckInAt: nextCheckIn() }, "No worries, I'll check back later")}>Not yet</ChoiceButton>
                                {onWriteAbout && <ChoiceButton onClick={() => onWriteAbout(item.text)}>Write about it</ChoiceButton>}
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="italic text-sm text-soft mb-1.5">Still want this?</p>
                            <div className="flex flex-wrap gap-1">
                                <ChoiceButton onClick={() => answerPrompt({ action: "keep" }, "Kept open")}>Keep</ChoiceButton>
                                <ChoiceButton onClick={() => answerPrompt({ action: "drop" }, "Let go. That's a closed loop too")}>Let it go</ChoiceButton>
                            </div>
                        </>
                    )}
                </div>
            )}
            {error && <p className="pl-7 text-xs text-brand-deep mt-0.5">Couldn't save that, try again?</p>}
        </li>
    )
}

function RowMenu({ canSnooze, onSnooze, onDrop }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return
        const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
        const onKey = e => { if (e.key === "Escape") setOpen(false) }
        document.addEventListener("mousedown", close)
        document.addEventListener("keydown", onKey)
        return () => {
            document.removeEventListener("mousedown", close)
            document.removeEventListener("keydown", onKey)
        }
    }, [open])

    const item = "block w-full text-left px-3 py-1.5 text-sm text-soft rounded-lg hover:bg-hush"

    return (
        <div className="relative shrink-0" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                aria-label="More options"
                aria-expanded={open}
                className="text-stone-300 hover:text-soft transition -mt-0.5"
            >
                <MoreHorizontal className="w-4 h-4" />
            </button>
            {open && (
                <div className="absolute right-0 top-5 z-10 w-36 p-1 rounded-xl border border-line bg-surface shadow-soft">
                    {canSnooze && (
                        <button className={item} onClick={() => { setOpen(false); onSnooze() }}>
                            Snooze {SNOOZE_DAYS} days
                        </button>
                    )}
                    <button className={item} onClick={() => { setOpen(false); onDrop() }}>
                        Let it go
                    </button>
                </div>
            )}
        </div>
    )
}
