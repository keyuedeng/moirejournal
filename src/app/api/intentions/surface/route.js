import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { intentionSelect } from '@/lib/intentions/suggestIntentions'
import { assess, pickSurfaced, wasIgnored, RETURN_AFTER_DAYS } from '@/lib/intentions/surface'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_THIS_WEEK = 5
const MAX_ONGOING = 3
const MAX_LATER = 2

/*
The open loops panel on the journal page. Your near-term loops are always
visible (seeing them is what makes the journal trustworthy); what's held
back is *prompting* — "how's it going?" / "still want this?" only appear on
the rows the surfacing rules pick (lib/intentions/surface.js), and showing
a prompt is recorded so ignored ones back off. Snoozed loops are hidden.

returns {
    mode, activeCount, closedThisWeek,
    thisWeek: tasks due within 7 days or overdue, soonest first
    ongoing:  goals, check-ins first
    later:    other tasks (and any wish with a prompt), soonest first
    moreThisWeek, moreLater, wishCount: what didn't fit, for "+N more"
}
each item carries `prompt`: null | "checkIn" | "stale"
*/
export async function GET() {
    try {
        const { userId } = await auth()

        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const now = new Date()

        const [user, active, closedThisWeek] = await Promise.all([
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
            prisma.intention.count({
                where: { userId, status: "DONE", completedAt: { gte: new Date(now - 7 * DAY_MS) } },
            }),
        ])

        // which rows get a prompt right now. only check-ins and stale loops
        // compete for the few prompt slots — a due/overdue task needs no
        // prompt, its due label already says it
        const PROMPTS = ["checkIn", "stale"]
        const picked = pickSurfaced(active.filter(item => PROMPTS.includes(assess(item, now).reason)), now)
            .filter(p => PROMPTS.includes(p.reason))
        const promptFor = new Map(picked.map(p => [p.item.id, p.reason]))

        // record prompts that are newly shown; one shown last time and not
        // acted on counts as ignored, which doubles its cooldown
        const newlyPrompted = picked.filter(p => p.isNew).map(p => p.item)
        await Promise.all([
            ...newlyPrompted.map(item => prisma.intention.update({
                where: { id: item.id },
                data: {
                    lastSurfacedAt: now,
                    ...(wasIgnored(item) && { ignoredCount: { increment: 1 } }),
                },
            })),
            // user row may not exist yet if they've never saved an entry
            prisma.user.updateMany({ where: { id: userId }, data: { lastSeenAt: now } }),
        ])

        const visible = active.filter(item => !item.snoozeUntil || item.snoozeUntil <= now)
        const toClient = item => ({
            id: item.id,
            text: item.text,
            kind: item.kind,
            horizon: item.horizon,
            dueAt: item.dueAt,
            entryId: item.entryId,
            sourceQuote: item.sourceQuote,
            prompt: promptFor.get(item.id) ?? null,
        })
        const byDue = (a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.createdAt - b.createdAt
        const dueThisWeek = item => item.dueAt && item.dueAt - now <= 7 * DAY_MS

        const thisWeekAll = visible.filter(i => i.kind === "TASK" && dueThisWeek(i)).sort(byDue)
        const ongoingAll = visible
            .filter(i => i.kind === "GOAL")
            .sort((a, b) => (promptFor.has(b.id) - promptFor.has(a.id)) || a.createdAt - b.createdAt)
        const laterAll = visible
            .filter(i => (i.kind === "TASK" && !dueThisWeek(i)) || (i.kind === "WISH" && promptFor.has(i.id)))
            .sort((a, b) => (promptFor.has(b.id) - promptFor.has(a.id)) || byDue(a, b))
        const wishCount = visible.filter(i => i.kind === "WISH" && !promptFor.has(i.id)).length

        const awayDays = user?.lastSeenAt ? (now - user.lastSeenAt) / DAY_MS : 0

        return Response.json({
            mode: awayDays >= RETURN_AFTER_DAYS ? "return" : "daily",
            activeCount: active.length,
            closedThisWeek,
            thisWeek: thisWeekAll.slice(0, MAX_THIS_WEEK).map(toClient),
            moreThisWeek: Math.max(0, thisWeekAll.length - MAX_THIS_WEEK),
            ongoing: ongoingAll.slice(0, MAX_ONGOING).map(toClient),
            later: laterAll.slice(0, MAX_LATER).map(toClient),
            moreLater: Math.max(0, laterAll.length - MAX_LATER) + Math.max(0, ongoingAll.length - MAX_ONGOING),
            wishCount,
        })
    } catch (error) {
        console.error("Failed to surface open loops:", error)
        return Response.json({ error: "Failed to surface open loops" }, { status: 500 })
    }
}
