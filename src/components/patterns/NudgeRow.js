"use client"
import { useState } from "react"
import { scheduleFor } from "@/lib/intentions/schedule"
import { ChoiceButton, ResolvedLine } from "@/components/intentions/ui"

async function answer(id, body) {
    const res = await fetch(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
}

/*
a gentle pattern nudge: what keeps coming up, in the writer's own words,
and an offer to make it a goal. answers show straight away and save in
the background. onAnswered(ok) lets the parent refresh or move on.
*/
export default function NudgeRow({ nudge, onAnswered }) {
    const [message, setMessage] = useState(null)

    function respond(body, doneMessage) {
        setMessage(doneMessage)
        answer(nudge.id, body).then(
            () => onAnswered?.(true),
            err => {
                console.error("Failed to answer pattern nudge", err)
                setMessage("Couldn’t save that. It’ll be in your weekly look back.")
                onAnswered?.(false)
            },
        )
    }

    if (message) return <ResolvedLine message={message} />

    return (
        <div className="rounded-xl border border-brand/15 bg-brand-soft/60 p-4">
            <p className="text-[15px] text-ink">{nudge.observation}</p>
            <p className="text-sm italic text-soft mt-1">“{nudge.quote}”</p>
            <p className="text-sm text-soft mt-3">
                Want to make it a goal? <span className="text-ink font-bold">{nudge.goalText}</span>
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                <ChoiceButton
                    highlighted
                    onClick={() => respond(
                        { action: "accept", horizon: "WEEK", nextCheckInAt: scheduleFor("GOAL", "WEEK").nextCheckInAt },
                        "Added to your open loops as a goal"
                    )}
                >
                    Make it a goal
                </ChoiceButton>
                <ChoiceButton onClick={() => respond({ action: "notNow" }, "Okay, I won’t bring this up for a while")}>
                    Not now
                </ChoiceButton>
                <button
                    onClick={() => respond({ action: "mute" }, "Got it, I won’t suggest this again")}
                    className="text-sm px-2.5 py-1.5 text-faint hover:text-soft transition"
                >
                    Don’t suggest this
                </button>
            </div>
        </div>
    )
}
