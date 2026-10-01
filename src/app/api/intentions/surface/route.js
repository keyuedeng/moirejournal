import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { intentionSelect } from '@/lib/intentions/suggestIntentions'
import { pickSurfaced, wasIgnored, RETURN_AFTER_DAYS } from '@/lib/intentions/surface'

const DAY_MS = 24 * 60 * 60 * 1000

// The "Open loops" strip above the editor. Picks what to show (rules in
// lib/intentions/surface.js) and records that it was shown, which is how
// ignored items back off over time. GET because the page just loads it,
// even though it writes a little bookkeeping.
export async function GET() {
    try {
        const { userId } = await auth()

        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const now = new Date()

        const [user, active] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId }, select: { lastSeenAt: true } }),
            prisma.intention.findMany({
                where: { userId, status: "ACTIVE" },
                select: {
                    ...intentionSelect,
                    snoozeUntil: true,
                    lastSurfacedAt: true,
                    lastInteractedAt: true,
                    ignoredCount: true,
                },
            }),
        ])

        const picked = pickSurfaced(active, now)

        // newly surfaced items: if they were shown last time and nothing was
        // done with them, that counts as an ignore (the cooldown doubles)
        const newlySurfaced = picked.filter(p => p.isNew).map(p => p.item)
        await Promise.all([
            ...newlySurfaced.map(item => prisma.intention.update({
                where: { id: item.id },
                data: {
                    lastSurfacedAt: now,
                    ...(wasIgnored(item) && { ignoredCount: { increment: 1 } }),
                },
            })),
            // user row may not exist yet if they've never saved an entry
            prisma.user.updateMany({ where: { id: userId }, data: { lastSeenAt: now } }),
        ])

        const awayDays = user?.lastSeenAt ? (now - user.lastSeenAt) / DAY_MS : 0

        return Response.json({
            mode: awayDays >= RETURN_AFTER_DAYS ? "return" : "daily",
            activeCount: active.length,
            items: picked.map(({ item, reason }) => ({
                id: item.id,
                text: item.text,
                kind: item.kind,
                horizon: item.horizon,
                dueAt: item.dueAt,
                nextCheckInAt: item.nextCheckInAt,
                sourceQuote: item.sourceQuote,
                entryId: item.entryId,
                reason,
            })),
        })
    } catch (error) {
        console.error("Failed to surface open loops:", error)
        return Response.json({ error: "Failed to surface open loops" }, { status: 500 })
    }
}
