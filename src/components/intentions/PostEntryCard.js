"use client"
import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import TextareaAutosize from "react-textarea-autosize"
import { scheduleFor } from "@/lib/intentions/schedule"
import { patchIntention } from "./api"

// shows a choice's result straight away and saves in the background (a
// database round trip can take over a second). onResolved gets the message
// and a promise of whether the save worked, so the parent can refresh once
// it's landed or replace the message if it failed.
function saveInBackground(id, body, message, onResolved) {
    const saved = patchIntention(id, body).then(() => true, err => {
        console.error("Failed to update open loop", err)
        return false
    })
    onResolved(message, saved)
}

const SAVE_FAILED = "Couldn't save that. It's still under Not decided yet on Open loops"

// more than this and the card stops feeling like relief after a brain dump
const VISIBLE_SUGGESTIONS = 4
// how long "no open loops this time" stays before the editor comes back
const EMPTY_LINGER_MS = 2200
// how long the confirmations stay once everything has an answer
const DONE_LINGER_MS = 1800

const HORIZON_LABELS = {
    TASK: { WEEK: "This week", MONTH: "This month", SOMEDAY: "Someday" },
    GOAL: { WEEK: "Weekly", MONTH: "Monthly", SOMEDAY: "Someday" },
}

/*
What the editor box turns into right after saving, so finding open loops
feels like part of saving instead of something easy to walk away from.
state: { preview, saving: true }                 the entry itself is still saving
     | { entryId, preview, loading: true }         saved, looking for open loops
     | { entryId, preview, suggestions, related }
onClose: back to a fresh editor. onChange: a loop was confirmed/closed (refresh the strip).
*/
export default function PostEntryCard({ state, onClose, onChange }) {
    const [resolved, setResolved] = useState({}) // intention id -> message shown in its place
    const [showAll, setShowAll] = useState(false)

    const suggestions = state.suggestions ?? []
    const related = state.related ?? []
    const total = suggestions.length + related.length
    const waiting = state.saving || state.loading
    const isEmpty = !waiting && total === 0
    const allResolved = total > 0 && Object.keys(resolved).length >= total

    useEffect(() => {
        if (!isEmpty && !allResolved) return
        const timeout = setTimeout(onClose, isEmpty ? EMPTY_LINGER_MS : DONE_LINGER_MS)
        return () => clearTimeout(timeout)
    }, [isEmpty, allResolved, onClose])

    const resolve = (id, message, saved) => {
        setResolved(prev => ({ ...prev, [id]: message }))
        saved.then(ok => {
            if (ok) onChange?.()
            else setResolved(prev => ({ ...prev, [id]: SAVE_FAILED }))
        })
    }
    const visible = showAll ? suggestions : suggestions.slice(0, VISIBLE_SUGGESTIONS)
    const hiddenCount = suggestions.length - visible.length

    return (
        <div className="animate-in fade-in">
            <div className="flex items-center justify-between gap-4 pb-3">
                <p className="flex items-center gap-2 min-w-0 text-sm text-faint">
                    {state.saving ? (
                        <span className="w-1.5 h-1.5 mx-1 rounded-full bg-faint animate-pulse shrink-0" />
                    ) : (
                        <Check className="w-4 h-4 text-brand shrink-0" />
                    )}
                    <span className="shrink-0">{state.saving ? "Saving…" : "Saved"}</span>
                    {state.preview && <span className="truncate">· “{state.preview}”</span>}
                </p>
                <button
                    onClick={onClose}
                    className="text-sm px-4 py-1.5 rounded-full border border-line text-soft hover:bg-hush transition shrink-0"
                >
                    New entry
                </button>
            </div>

            {waiting ? (
                <div role="status" aria-live="polite">
                    <p className="italic text-base text-soft mt-3 mb-2">Reading for open loops…</p>
                    <SkeletonRow />
                    <SkeletonRow short />
                </div>
            ) : isEmpty ? (
                <p className="italic text-base text-soft mt-3 animate-in fade-in">No open loops this time.</p>
            ) : (
                <>
                    {suggestions.length > 0 && (
                        <>
                            <h3 className="font-display text-[26px] font-medium text-ink mt-3">Want to hold onto any of these?</h3>
                            <p className="text-sm text-faint">Open loops from what you just wrote</p>
                            <ul className="divide-y divide-hush">
                                {visible.map(item => (
                                    <li key={item.id} className="py-4">
                                        {resolved[item.id] ? (
                                            <ResolvedLine message={resolved[item.id]} />
                                        ) : (
                                            <SuggestionRow item={item} onResolved={(message, saved) => resolve(item.id, message, saved)} />
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {hiddenCount > 0 && (
                                <button
                                    onClick={() => setShowAll(true)}
                                    className="text-sm text-faint hover:text-soft transition"
                                >
                                    +{hiddenCount} more
                                </button>
                            )}
                        </>
                    )}

                    {related.length > 0 && (
                        <div className={suggestions.length > 0 ? "mt-4 pt-4 border-t border-hush" : "mt-3"}>
                            <p className="font-display text-xl font-medium text-ink mb-1">You mentioned this before</p>
                            <ul className="divide-y divide-hush">
                                {related.map(item => (
                                    <li key={item.id} className="py-2.5">
                                        {resolved[item.id] ? (
                                            <ResolvedLine message={resolved[item.id]} />
                                        ) : (
                                            <RelatedRow item={item} onResolved={(message, saved) => resolve(item.id, message, saved)} />
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// placeholder shaped like a real row, so it reads as "something specific is coming"
function SkeletonRow({ short = false }) {
    return (
        <div className="py-2.5 space-y-2 animate-pulse">
            <div className={`h-3 rounded bg-hush ${short ? "w-1/2" : "w-3/4"}`} />
            <div className={`h-4 rounded bg-stone-200 ${short ? "w-1/3" : "w-2/5"}`} />
            <div className="flex gap-1.5">
                <div className="h-6 w-20 rounded-full bg-stone-100" />
                <div className="h-6 w-20 rounded-full bg-stone-100" />
                <div className="h-6 w-16 rounded-full bg-stone-100" />
            </div>
        </div>
    )
}

// also used in the "see all" dialog for suggestions that were never answered
export function SuggestionRow({ item, onResolved }) {
    const [text, setText] = useState(item.text)

    const act = (body, message) => saveInBackground(item.id, body, message, onResolved)

    function confirm(horizon, { useSuggestedStep = false } = {}) {
        const kind = useSuggestedStep ? "TASK" : item.kind
        const { dueAt, nextCheckInAt } = scheduleFor(kind, horizon)
        act(
            { action: "confirm", horizon, dueAt, nextCheckInAt, text, useSuggestedStep },
            "Added to open loops"
        )
    }

    const dismiss = () => act({ action: "dismiss" }, "Okay, not a to-do")

    return (
        <div>
            <p className="italic text-[15px] text-soft mb-1">“{item.sourceQuote}”</p>
            <div className="flex items-start gap-2 mb-3">
                <span className="mt-1"><KindTag kind={item.kind} /></span>
                {/* wraps instead of cutting off long text on narrow screens */}
                <TextareaAutosize
                    value={text}
                    onChange={e => setText(e.target.value.replace(/\n/g, " "))}
                    onKeyDown={e => { if (e.key === "Enter") e.preventDefault() }}
                    aria-label="Open loop text"
                    minRows={1}
                    className="flex-1 min-w-0 resize-none text-ink font-bold text-[15px] bg-transparent rounded px-1 -mx-1 focus:outline-none focus:bg-hush/60"
                />
            </div>

            <div className="flex flex-wrap gap-1.5">
                {item.kind === "WISH" ? (
                    <>
                        {item.suggestedStep && (
                            <ChoiceButton highlighted onClick={() => confirm("WEEK", { useSuggestedStep: true })}>
                                Try: {item.suggestedStep}
                            </ChoiceButton>
                        )}
                        <ChoiceButton onClick={() => confirm("SOMEDAY")}>Keep as wish</ChoiceButton>
                    </>
                ) : (
                    Object.entries(HORIZON_LABELS[item.kind]).map(([horizon, label]) => (
                        <ChoiceButton
                            key={horizon}
                            highlighted={horizon === item.suggestedHorizon}
                            onClick={() => confirm(horizon)}
                        >
                            {label}
                        </ChoiceButton>
                    ))
                )}
                <button
                    onClick={dismiss}
                    className="text-sm px-2.5 py-1.5 rounded-full text-faint hover:text-soft transition"
                >
                    Not a to-do
                </button>
            </div>
        </div>
    )
}

function RelatedRow({ item, onResolved }) {
    const act = (action, message) => saveInBackground(item.id, { action }, message, onResolved)

    return (
        <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="flex items-baseline gap-2 min-w-0">
                <span className="text-ink">{item.text}</span>
                {item.finished && <span className="italic text-sm text-brand-deep shrink-0">sounds like you did this</span>}
            </span>
            <div className="flex gap-1.5">
                <ChoiceButton highlighted={item.finished} onClick={() => act("done", "Loop closed")}>Done</ChoiceButton>
                <ChoiceButton onClick={() => act("keep", "Still open")}>Still on it</ChoiceButton>
            </div>
        </div>
    )
}

// same dot colours as the /loops sections: brand = task, sage = goal, lilac = wish
const KIND_DOT = { TASK: "bg-brand", GOAL: "bg-sage", WISH: "bg-lilac" }

export function KindTag({ kind }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-faint shrink-0 capitalize">
            <span className={`w-1.5 h-1.5 rounded-full ${KIND_DOT[kind]}`} />
            {kind.toLowerCase()}
        </span>
    )
}

// the extractor's guess (e.g. "this week" for "before I leave") gets a
// stronger outline so the likely answer is one obvious tap
export function ChoiceButton({ highlighted = false, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className={`text-sm px-3.5 py-1.5 rounded-full border transition text-left ${
                highlighted
                    ? "border-brand/30 bg-brand-soft text-brand-deep hover:bg-brand/20"
                    : "border-line text-soft hover:bg-hush"
            }`}
        >
            {children}
        </button>
    )
}

export function ResolvedLine({ message }) {
    return (
        <p className="flex items-center gap-2 text-sm text-soft animate-in fade-in">
            <Check className="w-4 h-4 text-brand" />
            {message}
        </p>
    )
}
