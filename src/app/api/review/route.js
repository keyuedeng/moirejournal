import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { getWeekLoops, getWeekReflection } from '@/lib/review/weeklyReview'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// GET /api/review?start=<ISO>&part=loops|reflection&current=1
// start is the user's local Monday 00:00 (the browser knows their timezone).
// part=loops is database-only and fast; part=reflection may call the model,
// so the page asks for both at once and shows the loops first.
// current=1 when this is the week being looked back on now: marks the look
// back as opened (hides the journal's "your week is ready" card) and lets
// the reflection part create a pattern nudge.
export async function GET(request) {
    try {
        const { userId } = await auth()
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

        const { searchParams } = new URL(request.url)
        const start = new Date(searchParams.get("start"))
        if (isNaN(start.getTime())) return Response.json({ error: "Invalid start" }, { status: 400 })
        const end = new Date(start.getTime() + WEEK_MS)
        const current = searchParams.get("current") === "1"

        if (searchParams.get("part") === "reflection") {
            return Response.json(await getWeekReflection(userId, start, end, { current }))
        }
        const [loops] = await Promise.all([
            getWeekLoops(userId, start, end),
            current && prisma.user.updateMany({ where: { id: userId }, data: { lastReviewOpenedAt: new Date() } }),
        ])
        return Response.json(loops)
    } catch (error) {
        console.error("Failed to load weekly review:", error)
        return Response.json({ error: "Failed to load weekly review" }, { status: 500 })
    }
}
