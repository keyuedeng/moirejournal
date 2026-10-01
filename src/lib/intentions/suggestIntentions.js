import prisma from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { embedText } from "@/lib/identity/embeddings/embedText";
import { cosineSimilarity } from "@/lib/utils/similarity";
import { extractIntentions } from "./extractIntentions";

// the extractor decides "same loop" by meaning (it sees the open loops).
// embeddings are a backstop for close wordings it occasionally misses
// ("list the furniture on marketplace" vs "put some furniture on facebook
// marketplace" = 0.76). they can't be the main check: some paraphrases
// score as low as 0.58 ("start running again" vs "get started on running").
// every different-loop pair measured so far is <= 0.65 ("book a haircut"
// vs "book a dentist appointment"), so 0.75 sits just above that.
const SAME_LOOP_THRESHOLD = 0.75
// whole entry vs a loop's text: related 0.32-0.43, unrelated <= 0.17
const RELATED_THRESHOLD = 0.3
const MAX_RELATED = 3

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
- skips ones that repeat an ACTIVE loop, and surfaces that loop as related instead
- flags ACTIVE loops the writer says they've finished (related, finished: true)
- finds other ACTIVE loops the entry is about ("you mentioned this before")
returns: { suggestions, related }
*/
export async function suggestIntentions(userId, entry) {
    // claim the entry so two overlapping requests can't both save suggestions.
    // the slow LLM/embedding calls start at the same time instead of waiting
    // on the claim — if the claim loses (a rare retry), their results are
    // just thrown away. each DB round trip is ~1.3s from Australia to the
    // us-east-2 database, so not waiting on it is a noticeable win locally.
    const claim = prisma.entry.updateMany({
        where: { id: entry.id, userId, intentionsExtractedAt: null },
        data: { intentionsExtractedAt: new Date() },
    })
    const work = prisma.intention.findMany({
        where: { userId, status: "ACTIVE" },
        select: { ...intentionSelect, embedding: true },
        orderBy: { createdAt: "desc" },
    }).then(activeLoops => Promise.all([
        extractIntentions(entry.body, { existing: activeLoops }).then(async ({ items, finishedIds }) => ({
            items: await embedItems(items),
            finishedIds,
        })),
        embedText(entry.body),
        activeLoops,
    ]))
    // the claim is awaited first; don't let a failure in `work` meanwhile
    // surface as an unhandled rejection
    work.catch(() => {})

    const claimed = await claim

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
        const [{ items, finishedIds }, entryEmbedding, activeLoops] = await work

        const repeated = new Set() // active loop ids this entry repeats
        const fresh = []
        for (const item of items) {
            if (item.existingId) {
                repeated.add(item.existingId)
                continue
            }
            const { loop, similarity } = closestLoop(item.embedding, activeLoops)
            if (loop && similarity >= SAME_LOOP_THRESHOLD) {
                repeated.add(loop.id)
            } else {
                fresh.push(item)
            }
        }
        const finished = new Set(finishedIds)

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

        // loops the writer says they finished come first, then ones this
        // entry repeats, then ones it's just about
        const related = activeLoops
            .map(loop => ({
                loop,
                score: finished.has(loop.id) ? 3
                    : repeated.has(loop.id) ? 2
                    : cosineSimilarity(entryEmbedding, loop.embedding),
            }))
            .filter(({ score }) => score >= RELATED_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RELATED)
            .map(({ loop: { embedding, ...loop } }) => ({ ...loop, finished: finished.has(loop.id) }))

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

// all of an entry's items in one embeddings request instead of one each.
// same model and lowercasing as embedText, so they compare like-for-like
// with embeddings made elsewhere (e.g. after an edit)
async function embedItems(items) {
    if (items.length === 0) return []
    const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: items.map(item => item.text.trim().toLowerCase()),
    })
    return items.map((item, i) => ({ ...item, embedding: res.data[i].embedding }))
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
