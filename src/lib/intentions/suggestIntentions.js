import prisma from "@/lib/prisma";
import { embedText } from "@/lib/identity/embeddings/embedText";
import { cosineSimilarity } from "@/lib/utils/similarity";
import { extractIntentions } from "./extractIntentions";

// thresholds measured with text-embedding-3-small:
// paraphrases of the same loop score 0.77-0.93, while different-but-similar
// loops ("book a haircut" vs "book a dentist appointment") score ~0.65.
// a wrong merge loses a task, a missed one just shows twice — so err high.
const SAME_LOOP_THRESHOLD = 0.75
// whole entry vs a loop's text: related 0.32-0.43, unrelated <= 0.17
const RELATED_THRESHOLD = 0.3
const MAX_RELATED = 2

// what the client gets — never the embedding
export const intentionSelect = {
    id: true,
    text: true,
    sourceQuote: true,
    kind: true,
    suggestedStep: true,
    suggestedHorizon: true,
    horizon: true,
    status: true,
    dueAt: true,
    nextCheckInAt: true,
    entryId: true,
    createdAt: true,
}

/*
runs once per entry, right after it's saved:
- extracts open loops from the entry and saves new ones as SUGGESTED
- skips ones that duplicate an ACTIVE loop, and surfaces that loop as related instead
- finds other ACTIVE loops the entry is about ("you mentioned this before")
returns: { suggestions, related }
*/
export async function suggestIntentions(userId, entry) {
    // claim the entry first so two overlapping requests can't both extract
    const claimed = await prisma.entry.updateMany({
        where: { id: entry.id, userId, intentionsExtractedAt: null },
        data: { intentionsExtractedAt: new Date() },
    })

    if (claimed.count === 0) {
        // already extracted (a retry or reload) — return what's still waiting on the user
        const suggestions = await prisma.intention.findMany({
            where: { entryId: entry.id, status: "SUGGESTED" },
            select: intentionSelect,
            orderBy: { createdAt: "asc" },
        })
        return { suggestions, related: [] }
    }

    try {
        const [extracted, entryEmbedding, activeLoops] = await Promise.all([
            extractIntentions(entry.body),
            embedText(entry.body),
            prisma.intention.findMany({
                where: { userId, status: "ACTIVE" },
                select: { ...intentionSelect, embedding: true },
            }),
        ])

        const embedded = await Promise.all(
            extracted.map(async item => ({ ...item, embedding: await embedText(item.text) }))
        )

        const duplicateOf = new Map() // active loop id -> similarity
        const fresh = []
        for (const item of embedded) {
            const { loop, similarity } = closestLoop(item.embedding, activeLoops)
            if (loop && similarity >= SAME_LOOP_THRESHOLD) {
                duplicateOf.set(loop.id, Math.max(similarity, duplicateOf.get(loop.id) ?? 0))
            } else {
                fresh.push(item)
            }
        }

        // createMany doesn't return rows on postgres in this prisma version,
        // so create one by one inside a transaction to keep the order
        const suggestions = await prisma.$transaction(
            fresh.map(item => prisma.intention.create({
                data: {
                    userId,
                    entryId: entry.id,
                    text: item.text,
                    sourceQuote: item.sourceQuote,
                    suggestedStep: item.suggestedStep,
                    kind: item.kind,
                    suggestedHorizon: item.suggestedHorizon,
                    embedding: item.embedding,
                },
                select: intentionSelect,
            }))
        )

        // loops this entry repeats come first, then ones it's just about
        const related = activeLoops
            .map(loop => ({
                loop,
                score: duplicateOf.has(loop.id)
                    ? 1 + duplicateOf.get(loop.id)
                    : cosineSimilarity(entryEmbedding, loop.embedding),
            }))
            .filter(({ score }) => score >= RELATED_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RELATED)
            .map(({ loop: { embedding, ...loop } }) => loop)

        return { suggestions, related }
    } catch (error) {
        // release the claim so the next request can try again
        await prisma.entry.update({
            where: { id: entry.id },
            data: { intentionsExtractedAt: null },
        }).catch(() => {})
        throw error
    }
}

function closestLoop(embedding, loops) {
    let loop = null
    let similarity = -Infinity
    for (const candidate of loops) {
        if (!candidate.embedding?.length) continue
        const sim = cosineSimilarity(embedding, candidate.embedding)
        if (sim > similarity) {
            similarity = sim
            loop = candidate
        }
    }
    return { loop, similarity }
}
