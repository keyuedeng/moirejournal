"use client"
import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import TextareaAutosize from "react-textarea-autosize"
import { scheduleFor } from "@/lib/intentions/schedule"
import { patchIntention } from "./api"

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

    const resolve = (id, message) => {
        setResolved(prev => ({ ...prev, [id]: message }))
        onChange?.()
    }
    const visible = showAll ? suggestions : suggestions.slice(0, VISIBLE_SUGGESTIONS)
    const hiddenCount = suggestions.length - visible.length

    return (
        <div className="animate-in fade-in">
            <div className="flex items-center justify-between gap-4 pb-3">
                <p className="flex items-center gap-2 min-w-0 text-sm text-neutral-500">
                    {state.saving ? (
                        <span className="w-1.5 h-1.5 mx-1 rounded-full bg-neutral-400 animate-pulse shrink-0" />
                    ) : (
                        <Check className="w-4 h-4 text-[#b88998] shrink-0" />
                    )}
                    <span className="shrink-0">{state.saving ? "Saving…" : "Saved"}</span>
                    {state.preview && <span className="truncate text-neutral-400">· “{state.preview}”</span>}
                </p>
                <button
                    onClick={onClose}
                    className="text-sm px-3 py-1 rounded-xl border border-stone-300 text-neutral-600 hover:bg-stone-100 transition shrink-0"
                >
                    New entry
                </button>
            </div>

            {waiting ? (
                <div role="status" aria-live="polite">
                    <p className="text-neutral-600 mb-3">Reading for open loops…</p>
                    <SkeletonRow />
                    <SkeletonRow short />
                </div>
            ) : isEmpty ? (
                <p className="text-neutral-500 animate-in fade-in">No open loops this time.</p>
            ) : (
                <>
                    {suggestions.length > 0 && (
                        <>
                            <h3 className="text-neutral-700 font-medium">Want to hold onto any of these?</h3>
                            <p className="text-xs text-neutral-400 mt-0.5">Open loops from what you just wrote</p>
                            <ul className="divide-y divide-stone-100">
                                {visible.map(item => (
                                    <li key={item.id} className="py-3">
                                        {resolved[item.id] ? (
                                            <ResolvedLine message={resolved[item.id]} />
                                        ) : (
                                            <SuggestionRow item={item} onResolved={message => resolve(item.id, message)} />
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {hiddenCount > 0 && (
                                <button
                                    onClick={() => setShowAll(true)}
                                    className="text-xs text-neutral-400 hover:text-neutral-600 transition"
                                >
                                    +{hiddenCount} more
                                </button>
                            )}
                        </>
                    )}

                    {related.length > 0 && (
                        <div className={suggestions.length > 0 ? "mt-3 pt-3 border-t border-stone-200" : ""}>
                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">You mentioned this before</p>
                            <ul className="divide-y divide-stone-100">
                                {related.map(item => (
                                    <li key={item.id} className="py-2.5">
                                        {resolved[item.id] ? (
                                            <ResolvedLine message={resolved[item.id]} />
                                        ) : (
                                            <RelatedRow item={item} onResolved={message => resolve(item.id, message)} />
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
            <div className={`h-3 rounded bg-stone-200/80 ${short ? "w-1/2" : "w-3/4"}`} />
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
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(false)

    async function act(body, message) {
        setSaving(true)
        setError(false)
        try {
            await patchIntention(item.id, body)
            onResolved(message)
        } catch (err) {
            console.error("Failed to update open loop", err)
            setError(true)
            setSaving(false)
        }
    }

    function confirm(horizon, { useSuggestedStep = false } = {}) {
        const kind = useSuggestedStep ? "TASK" : item.kind
        const { dueAt, nextCheckInAt } = scheduleFor(kind, horizon)
        act(
            { action: "confirm", horizon, dueAt, nextCheckInAt, text, useSuggestedStep },
            "Added to open loops ↑"
        )
    }

    const dismiss = () => act({ action: "dismiss" }, "Okay, not a to-do")

    return (
        <div className={saving ? "opacity-50 pointer-events-none transition" : "transition"}>
            <p className="text-sm italic text-neutral-500 mb-1">“{item.sourceQuote}”</p>
            <div className="flex items-start gap-2 mb-2">
                <span className="mt-0.5"><KindTag kind={item.kind} /></span>
                {/* wraps instead of cutting off long text on narrow screens */}
                <TextareaAutosize
                    value={text}
                    onChange={e => setText(e.target.value.replace(/\n/g, " "))}
                    onKeyDown={e => { if (e.key === "Enter") e.preventDefault() }}
                    aria-label="Open loop text"
                    minRows={1}
                    className="flex-1 min-w-0 resize-none text-neutral-800 font-medium bg-transparent rounded px-1 -mx-1 focus:outline-none focus:bg-stone-50"
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
                    className="text-xs px-2.5 py-1 rounded-full text-neutral-400 hover:text-neutral-600 transition"
                >
                    Not a to-do
                </button>
            </div>
            {error && <p className="text-xs text-red-400 mt-1.5">Couldn't save that, try again?</p>}
        </div>
    )
}

function RelatedRow({ item, onResolved }) {
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(false)

    async function act(action, message) {
        setSaving(true)
        setError(false)
        try {
            await patchIntention(item.id, { action })
            onResolved(message)
        } catch (err) {
            console.error("Failed to update open loop", err)
            setError(true)
            setSaving(false)
        }
    }

    return (
        <div className={`flex items-center justify-between gap-3 flex-wrap ${saving ? "opacity-50 pointer-events-none" : ""}`}>
            <span className="flex items-baseline gap-2 min-w-0">
                <span className="text-neutral-700">{item.text}</span>
                {item.finished && <span className="text-xs text-[#8a6270] shrink-0">Sounds like you did this</span>}
            </span>
            <div className="flex gap-1.5">
                <ChoiceButton highlighted={item.finished} onClick={() => act("done", "Loop closed")}>Done</ChoiceButton>
                <ChoiceButton onClick={() => act("keep", "Still open")}>Still on it</ChoiceButton>
            </div>
            {error && <p className="w-full text-xs text-red-400">Couldn't save that, try again?</p>}
        </div>
    )
}

export function KindTag({ kind }) {
    return (
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-stone-100 text-neutral-500 shrink-0 capitalize">
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
            className={`text-xs px-2.5 py-1 rounded-full border transition text-left ${
                highlighted
                    ? "border-[#b88998]/60 bg-[#b88998]/15 text-[#8a6270] hover:bg-[#b88998]/25"
                    : "border-stone-200 text-neutral-600 hover:bg-stone-100"
            }`}
        >
            {children}
        </button>
    )
}

export function ResolvedLine({ message }) {
    return (
        <p className="flex items-center gap-2 text-sm text-neutral-500 animate-in fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-[#b88998]" />
            {message}
        </p>
    )
}
