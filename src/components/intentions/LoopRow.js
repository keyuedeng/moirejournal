"use client"
import { useState } from "react"
import { scheduleFor, addDays } from "@/lib/intentions/schedule"
import { patchIntention, DAY_MS } from "./api"
import { ChoiceButton, KindTag, ResolvedLine } from "./PostEntryCard"

const SNOOZE_DAYS = 2

function dueLabel(dueAt) {
    if (!dueAt) return null
    const due = new Date(dueAt)
    const daysLeft = (due - Date.now()) / DAY_MS
    if (daysLeft < 0) return "Overdue"
    if (daysLeft < 7) return `Due ${due.toLocaleDateString("en-US", { weekday: "short" })}`
    return `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

// the small grey note next to an item: why it's here right now
function reasonLabel(item) {
    switch (item.reason) {
        case "checkIn": return "How's it going?"
        case "stale": return "Still want this?"
        default: return dueLabel(item.dueAt)
    }
}

/*
one confirmed open loop, with the actions that fit why it's showing:
- a goal check-in → made progress / not yet / write about it
- stale → keep / let it go
- anything else → done / snooze / drop
onSettled is called after the confirmation has shown for a moment
*/
export default function LoopRow({ item, showKind = false, onSettled, onWriteAbout }) {
    const [message, setMessage] = useState(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(false)

    async function act(body, doneMessage) {
        setSaving(true)
        setError(false)
        try {
            await patchIntention(item.id, body)
            setMessage(doneMessage)
            setTimeout(() => onSettled?.(), 1200)
        } catch (err) {
            console.error("Failed to update open loop", err)
            setError(true)
            setSaving(false)
        }
    }

    if (message) return <ResolvedLine message={message} />

    const nextCheckIn = () => scheduleFor("GOAL", item.horizon ?? "WEEK").nextCheckInAt
    const note = reasonLabel(item)
    const overdue = note === "Overdue"

    let actions
    if (item.reason === "checkIn") {
        actions = (
            <>
                <ChoiceButton onClick={() => act({ action: "checkIn", nextCheckInAt: nextCheckIn() }, "Nice, keep going")}>Made progress</ChoiceButton>
                <ChoiceButton onClick={() => act({ action: "checkIn", nextCheckInAt: nextCheckIn() }, "No worries, I'll check back later")}>Not yet</ChoiceButton>
                {onWriteAbout && <ChoiceButton onClick={() => onWriteAbout(item.text)}>Write about it</ChoiceButton>}
            </>
        )
    } else if (item.reason === "stale") {
        actions = (
            <>
                <ChoiceButton onClick={() => act({ action: "keep" }, "Kept open")}>Keep</ChoiceButton>
                <ChoiceButton onClick={() => act({ action: "drop" }, "Let go. That's a closed loop too")}>Let it go</ChoiceButton>
            </>
        )
    } else {
        actions = (
            <>
                <ChoiceButton onClick={() => act({ action: "done" }, "Loop closed")}>Done</ChoiceButton>
                {/* a wish has no date, so there's nothing to snooze */}
                {item.kind !== "WISH" && (
                    <ChoiceButton onClick={() => act({ action: "snooze", until: addDays(SNOOZE_DAYS) }, `Snoozed for ${SNOOZE_DAYS} days`)}>Snooze</ChoiceButton>
                )}
                <button
                    onClick={() => act({ action: "drop" }, "Let go. That's a closed loop too")}
                    className="text-xs px-2 py-1 text-neutral-400 hover:text-neutral-600 transition"
                >
                    Drop
                </button>
            </>
        )
    }

    return (
        <div className={`flex items-center justify-between gap-x-3 gap-y-1.5 flex-wrap ${saving ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="flex items-center gap-2 min-w-0">
                {showKind && <KindTag kind={item.kind} />}
                <span className="text-neutral-800">{item.text}</span>
                {note && (
                    <span className={`text-xs shrink-0 ${overdue ? "text-amber-600/80" : "text-neutral-400"}`}>{note}</span>
                )}
            </div>
            <div className="flex items-center gap-1.5">{actions}</div>
            {error && <p className="w-full text-xs text-red-400">Couldn't save that, try again?</p>}
        </div>
    )
}
