import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { embedText } from '@/lib/identity/embeddings/embedText'
import { intentionSelect } from '@/lib/intentions/suggestIntentions'

const HORIZONS = ["WEEK", "MONTH", "SOMEDAY"]

// Dates are computed in the browser (it knows the user's timezone) and
// sent as ISO strings; anything missing or unparseable becomes null.
function parseDate(value) {
    if (!value) return null
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
}

/*
one route for everything the user can do to an open loop.
body: { action, ...fields }
- confirm   { horizon, dueAt?, nextCheckInAt?, text?, useSuggestedStep? }  SUGGESTED -> ACTIVE
- dismiss   "not a to-do"                                                   SUGGESTED -> DISMISSED
- done / drop                                                               -> DONE / DROPPED
- reopen    undo a done/drop (the panel's checkbox has an undo)               -> ACTIVE
- snooze    { until }
- keep      "still on it" — counts as an interaction, nothing else changes
- checkIn   { nextCheckInAt }  goal check-in, schedules the next one
- edit      { text }
*/
export async function PATCH(request, { params }) {
    try {
        const { userId } = await auth()

        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { id } = await params
        const body = await request.json()

        const intention = await prisma.intention.findUnique({ where: { id } })

        if (!intention || intention.userId !== userId) {
            return Response.json({ error: "Intention not found" }, { status: 404 })
        }

        const now = new Date()
        // any action counts as the user engaging with it, which resets the
        // "shown but ignored" backoff used when resurfacing
        const data = { lastInteractedAt: now, ignoredCount: 0 }

        switch (body.action) {
            case "confirm": {
                if (!HORIZONS.includes(body.horizon)) {
                    return Response.json({ error: "Invalid horizon" }, { status: 400 })
                }
                data.status = "ACTIVE"
                data.horizon = body.horizon
                data.dueAt = parseDate(body.dueAt)
                data.nextCheckInAt = parseDate(body.nextCheckInAt)
                // "Try: <step>" on a wish turns it into a concrete task;
                // the original quote stays so it still reads as their words
                if (body.useSuggestedStep && intention.suggestedStep) {
                    data.text = intention.suggestedStep
                    data.kind = "TASK"
                } else if (typeof body.text === "string" && body.text.trim()) {
                    data.text = body.text.trim()
                }
                break
            }
            case "dismiss":
                data.status = "DISMISSED"
                break
            case "done":
                data.status = "DONE"
                data.completedAt = now
                break
            case "drop":
                data.status = "DROPPED"
                break
            case "reopen":
                data.status = "ACTIVE"
                data.completedAt = null
                break
            case "snooze": {
                const until = parseDate(body.until)
                if (!until || until <= now) {
                    return Response.json({ error: "Invalid snooze date" }, { status: 400 })
                }
                data.snoozeUntil = until
                break
            }
            case "keep":
                break
            case "checkIn":
                data.nextCheckInAt = parseDate(body.nextCheckInAt)
                break
            case "edit":
                if (typeof body.text !== "string" || !body.text.trim()) {
                    return Response.json({ error: "Text cannot be empty" }, { status: 400 })
                }
                data.text = body.text.trim()
                break
            default:
                return Response.json({ error: "Unknown action" }, { status: 400 })
        }

        // the embedding is what duplicate detection and "related" matching
        // compare against, so it has to follow the text
        if (data.text && data.text !== intention.text) {
            data.embedding = await embedText(data.text)
        }

        const updated = await prisma.intention.update({
            where: { id },
            data,
            select: intentionSelect,
        })

        return Response.json(updated)
    } catch (error) {
        console.error("Failed to update intention:", error)
        return Response.json({ error: "Failed to update intention" }, { status: 500 })
    }
}
