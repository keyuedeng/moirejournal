import prisma from "@/lib/prisma";
import { generateNodeSummary } from "@/lib/identity/nodes/generateNodeSummary";
import { auth } from '@clerk/nextjs/server'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function GET(request, { params }) {
    try {
        const { userId } = await auth()

        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { id } = await params

        // fetch node with related data
        const node = await prisma.node.findUnique({
            where: {
                id,
                userId
            },
            include: {
                topicAliases: {
                    select: {
                        id: true,
                        topic: true
                    }
                },
                outgoingEdges: {
                    include: {
                        target: {
                            select: {
                                id: true,
                                label: true,
                                count: true
                            }
                        }
                    },
                    orderBy: { weight: 'desc' },
                    take: 10
                },
                incomingEdges: {
                    include: {
                        source: {
                            select: {
                                id: true,
                                label: true,
                                count: true
                            }
                        }
                    },
                    orderBy: { weight: 'desc' },
                    take: 10
                }
            }
        })

        if (!node) {
            return Response.json({ error: "Node not found" }, { status: 404 })
        }

        const uniqueEntryIds = new Set(node.contexts.map(c => c.entryId))

        // Real dates for each moment this theme appears — contexts only
        // store an entryId, not a timestamp, so this resolves them against
        // the entries themselves. Powers both the chronological excerpts
        // and the mood/trajectory reads below.
        const entryDates = await prisma.entry.findMany({
            where: { id: { in: Array.from(uniqueEntryIds) } },
            select: { id: true, createdAt: true }
        })
        const entryDateMap = new Map(entryDates.map(e => [e.id, e.createdAt]))

        const datedContexts = node.contexts
            .map(c => ({ ...c, createdAt: entryDateMap.get(c.entryId) || null }))
            .filter(c => c.createdAt)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) // oldest -> newest

        // Show the excerpts as a small chronological arc rather than an
        // unordered dump — the 5 most recent, oldest of those first.
        const excerpts = datedContexts.slice(-5)

        // Emotional tone — every context already carries a sentiment score
        // from the extraction pipeline; it just never made it to the UI.
        const sentiments = datedContexts.map(c => c.sentiment).filter(s => typeof s === 'number')
        let mood = null
        if (sentiments.length > 0) {
            const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length
            if (avg > 0.25) mood = "Mostly warm"
            else if (avg < -0.25) mood = "Often heavy"
            else mood = "Mixed feelings"
        }

        // Trajectory — a rough read on recent pattern from the touches we
        // actually have on hand (contexts are capped at the 10 most recent),
        // not a precise historical count. Good enough to answer "is this
        // growing, steady, or fading" without needing new schema/tracking.
        let trajectory = null
        if (datedContexts.length >= 3) {
            const now = Date.now()
            const recentCount = datedContexts.filter(c => now - new Date(c.createdAt).getTime() <= THIRTY_DAYS_MS).length
            const daysSinceLast = (now - new Date(datedContexts[datedContexts.length - 1].createdAt).getTime()) / (24 * 60 * 60 * 1000)

            if (daysSinceLast > 45) trajectory = "Quieter lately"
            else if (recentCount / datedContexts.length >= 0.6) trajectory = "Increasingly present"
            else trajectory = "A steady presence"
        }

        //build connections summary
        const connections = {
            outgoing: node.outgoingEdges.map(edge => ({
                nodeId: edge.target.id,
                label: edge.target.label,
                weight: edge.weight,
                count: edge.target.count
            })),
            incoming: node.incomingEdges.map(edge => ({
                nodeId: edge.source.id,
                label: edge.source.label,
                weight: edge.weight,
                count: edge.source.count
            }))
        }

        // generate insights with more human, reflective language
        const generatedInsights = []

        // Frequency insight
        if (uniqueEntryIds.size > 3) {
            generatedInsights.push(`This comes up often in your reflections`)
        } else if (uniqueEntryIds.size === 1) {
            generatedInsights.push(`You mentioned this recently`)
        }

        // Connection insights - make them feel meaningful
        if (connections.outgoing.length > 0) {
            const topConnection = connections.outgoing[0]
            if (topConnection.weight > 3) {
                generatedInsights.push(
                    `Closely tied to how you think about **${topConnection.label}**`
                )
            } else {
                generatedInsights.push(
                    `Connected to **${topConnection.label}**`
                )
            }
        }

        if (connections.incoming.length > 1) {
            const topTwo = connections.incoming.slice(0, 2).map(c => c.label)
            generatedInsights.push(
                `Often comes up when you write about **${topTwo[0]}** and **${topTwo[1]}**`
            )
        } else if (connections.incoming.length > 0) {
            generatedInsights.push(
                `Tends to appear alongside **${connections.incoming[0].label}**`
            )
        }

        // Pattern insight based on count
        if (node.count > 5) {
            generatedInsights.push(`This is a recurring theme in your life`)
        }

        // summary
        const summary = {
            label: node.label,
            categories: node.categories,
            count: node.count,
            entryCount: uniqueEntryIds.size,
            since: node.createdAt,
        }

        // Use stored LLM summary or generate if missing
        let llmSummary = node.llmSummary

        // If no stored summary but node qualifies (count >= 2), generate one
        if (!llmSummary && node.count >= 2) {
            const result = await generateNodeSummary(node)

            // Store it for future use
            if (result) {
                await prisma.node.update({
                    where: { id },
                    data: {
                        llmSummary: result.summary,
                        bulletPoints: result.bulletPoints
                    }
                })
                llmSummary = result.summary
            }
        }

        return Response.json({
            summary,
            llmSummary,
            insights: generatedInsights,
            mood,
            trajectory,
            excerpts,
            connections
        })
    } catch (error) {
        console.error("Failed to fetch node insights:", error)
        return Response.json({error: "Failed to fetch node insights"}, {status: 500})
    }
}
