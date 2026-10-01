import prisma from '@/lib/prisma'
import { suggestIntentions } from '@/lib/intentions/suggestIntentions'
import { auth } from '@clerk/nextjs/server'

export const maxDuration = 60

// Called by the journal page right after an entry is saved. Runs separately
// from the main entry pipeline so the post-entry card shows up in a few
// seconds instead of waiting on topic/node processing. Safe to call twice:
// the second call just returns the suggestions from the first.
export async function POST(request, { params }) {
    try {
        const { userId } = await auth()

        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { id } = await params

        const entry = await prisma.entry.findUnique({
            where: { id },
            select: { id: true, userId: true, body: true },
        })

        if (!entry || entry.userId !== userId) {
            return Response.json({ error: "Entry not found" }, { status: 404 })
        }

        const { suggestions, related } = await suggestIntentions(userId, entry)

        return Response.json({ suggestions, related })
    } catch (error) {
        console.error("Failed to suggest intentions:", error)
        return Response.json({ error: "Failed to suggest intentions" }, { status: 500 })
    }
}
