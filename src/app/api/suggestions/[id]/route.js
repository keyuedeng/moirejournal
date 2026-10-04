import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { embedText } from '@/lib/identity/embeddings/embedText'

const DAY_MS = 24 * 60 * 60 * 1000
const SNOOZE_DAYS = 28
const HORIZONS = ["WEEK", "MONTH", "SOMEDAY"]

function parseDate(value) {
    if (!value) return null
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
}

/*
answering a pattern nudge. body: { action, ...fields }
- accept  { horizon, nextCheckInAt }  becomes an active GOAL loop, in the writer's words
- notNow                              this theme stays quiet for ~4 weeks
- mute                                never suggest about this theme again
*/
export async function PATCH(request, { params }) {
    try {
        const { userId } = await auth()
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

        const { id } = await params
        const body = await request.json()
        const suggestion = await prisma.patternSuggestion.findUnique({ where: { id } })
        if (!suggestion || suggestion.userId !== userId) return Response.json({ error: "Suggestion not found" }, { status: 404 })
        if (suggestion.status !== "PENDING") return Response.json({ error: "Already answered" }, { status: 409 })

        const now = new Date()
        switch (body.action) {
            case "accept": {
                const horizon = HORIZONS.includes(body.horizon) ? body.horizon : "WEEK"
                const intention = await prisma.intention.create({
                    data: {
                        userId,
                        entryId: suggestion.entryId,
                        nodeId: suggestion.nodeId,
                        text: suggestion.goalText,
                        sourceQuote: suggestion.quote,
                        kind: "GOAL",
                        horizon,
                        status: "ACTIVE",
                        nextCheckInAt: parseDate(body.nextCheckInAt),
                        lastInteractedAt: now,
                        // duplicate detection compares against this
                        embedding: await embedText(suggestion.goalText),
                    },
                    select: { id: true },
                })
                await prisma.patternSuggestion.update({ where: { id }, data: { status: "ACCEPTED", intentionId: intention.id } })
                break
            }
            case "notNow":
                await prisma.$transaction([
                    prisma.patternSuggestion.update({ where: { id }, data: { status: "DISMISSED" } }),
                    prisma.node.update({ where: { id: suggestion.nodeId }, data: { suggestionSnoozedUntil: new Date(now.getTime() + SNOOZE_DAYS * DAY_MS) } }),
                ])
                break
            case "mute":
                await prisma.$transaction([
                    prisma.patternSuggestion.update({ where: { id }, data: { status: "MUTED" } }),
                    prisma.node.update({ where: { id: suggestion.nodeId }, data: { suggestionsMutedAt: now } }),
                ])
                break
            default:
                return Response.json({ error: "Unknown action" }, { status: 400 })
        }
        return Response.json({ ok: true })
    } catch (error) {
        console.error("Failed to answer pattern suggestion:", error)
        return Response.json({ error: "Failed to answer pattern suggestion" }, { status: 500 })
    }
}
