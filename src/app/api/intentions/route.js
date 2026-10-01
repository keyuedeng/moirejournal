import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { intentionSelect } from '@/lib/intentions/suggestIntentions'

const RECENT_MS = 14 * 24 * 60 * 60 * 1000

// Everything for the "see all" dialog: open loops, suggestions the user
// never answered (so closing the post-entry card doesn't lose them), and
// what they closed recently.
export async function GET() {
    try {
        const { userId } = await auth()

        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const since = new Date(Date.now() - RECENT_MS)

        const [active, suggested, closed] = await Promise.all([
            prisma.intention.findMany({
                where: { userId, status: "ACTIVE" },
                select: { ...intentionSelect, snoozeUntil: true },
                orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
            }),
            prisma.intention.findMany({
                where: { userId, status: "SUGGESTED", createdAt: { gte: since } },
                select: intentionSelect,
                orderBy: { createdAt: "desc" },
            }),
            prisma.intention.findMany({
                where: { userId, status: "DONE", completedAt: { gte: since } },
                select: { ...intentionSelect, completedAt: true },
                orderBy: { completedAt: "desc" },
            }),
        ])

        return Response.json({ active, suggested, closed })
    } catch (error) {
        console.error("Failed to fetch open loops:", error)
        return Response.json({ error: "Failed to fetch open loops" }, { status: 500 })
    }
}
