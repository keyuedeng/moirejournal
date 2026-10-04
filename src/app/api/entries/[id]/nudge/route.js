import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { isSensitiveTheme } from '@/lib/patterns/patternSuggestions'

// an entry's chunks average below this → it was a heavy entry; don't hand
// someone a goal right after they've poured their heart out
const HEAVY_SENTIMENT = -0.4

/*
The post-save card polls this while it's open: after the entry pipeline
finishes, a theme this entry touched may have become a pattern nudge.
→ { pending: true }  pipeline still running
→ { nudge: null }    nothing to show now (none, or held for the weekly look back)
→ { nudge }          show it under the card
*/
export async function GET(request, { params }) {
    try {
        const { userId } = await auth()
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

        const { id } = await params
        const entry = await prisma.entry.findUnique({ where: { id }, select: { userId: true, status: true, createdAt: true } })
        if (!entry || entry.userId !== userId) return Response.json({ error: "Entry not found" }, { status: 404 })
        if (entry.status === "PENDING") return Response.json({ pending: true })

        const nudge = await prisma.patternSuggestion.findFirst({
            where: { userId, status: "PENDING", createdAt: { gte: entry.createdAt } },
            orderBy: { createdAt: "desc" },
            select: { id: true, observation: true, goalText: true, quote: true, node: { select: { categories: true } } },
        })
        if (!nudge) return Response.json({ nudge: null })

        // heavy entry, or a feelings/wellbeing theme: it waits for the weekly look back
        const insights = await prisma.insight.findMany({ where: { entryId: id }, select: { sentiment: true } })
        const sentiment = insights.length ? insights.reduce((sum, i) => sum + i.sentiment, 0) / insights.length : 0
        if (sentiment < HEAVY_SENTIMENT || isSensitiveTheme(nudge.node)) return Response.json({ nudge: null })

        const { node, ...rest } = nudge
        return Response.json({ nudge: rest })
    } catch (error) {
        console.error("Failed to load pattern nudge:", error)
        return Response.json({ error: "Failed to load pattern nudge" }, { status: 500 })
    }
}
