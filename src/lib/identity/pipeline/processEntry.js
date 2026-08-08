import { semanticChunk } from "../chunking/chunking";
import { extractInsight } from "../insights/extractInsight";
import { canonicaliseTopicAlias } from "../canonicalisation/canonicaliseTopicAlias";
import { createOrUpdateEdges } from "../graph/createOrUpdateEdges";
import prisma from "@/lib/prisma";

export async function processEntry(userId, entryId, entrybody) {
    console.log("Processing entry:", { userId, entryId, bodyLength: entrybody?.length })

    const chunks = await semanticChunk(entrybody)
    console.log("got chunks", chunks.length)

    const allTouchedNodes = new Set(); //track all nodes touched by this entry

    // Each chunk's insight extraction is an independent OpenAI call, so run
    // them concurrently instead of one-at-a-time — this is the biggest lever
    // on wall-clock time for multi-chunk entries.
    const chunkAnalyses = await Promise.all(
        chunks.map(async (chunk) => ({
            chunk,
            analysis: await extractInsight(chunk.text),
        }))
    )

    // Persisting the insight rows is also independent per chunk.
    await Promise.all(
        chunkAnalyses.map(({ chunk, analysis }) =>
            prisma.insight.create({
                data: {
                    entryId,
                    topics: analysis.topics || [],
                    sentiment: analysis.sentiment || 0,
                    chunkIndex: chunk.index,
                }
            })
        )
    )

    // Topic -> node canonicalisation has to stay sequential: it reads the
    // current set of nodes to decide whether to reuse or create one, and
    // running that concurrently can create duplicate nodes for the same
    // topic (a classic check-then-act race).
    for (const { chunk, analysis } of chunkAnalyses) {
        const chunkText = chunk.text
        const topics = analysis.topics || []
        const sentiment = analysis.sentiment || 0

        const chunkNodeIds = []

        //process topics -> nodes
        for (const topic of topics) {
            const nodeId = await canonicaliseTopicAlias({
                userId,
                rawTopic: topic,
                snippet: chunkText,
                entryId,
                sentiment,
            })

            chunkNodeIds.push(nodeId)
            allTouchedNodes.add(nodeId)
        }

        // UPDATE EDGES
        await createOrUpdateEdges(userId, chunkNodeIds, 1)
    }
    // entry level edges - broader connections across whole entry
    const entryNodeIds = Array.from(allTouchedNodes)

    if (entryNodeIds.length > 1) {
        await createOrUpdateEdges(userId, entryNodeIds, 0.3)
    }

    return entryNodeIds
}