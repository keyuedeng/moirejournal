import prisma from "@/lib/prisma";
import { cosineSimilarity } from "@/lib/utils/similarity";
import { normaliseText } from "@/lib/utils/normaliseText";

// share of a loop's quote words that must appear in a theme's stored passage
const QUOTE_IN_PASSAGE = 0.7

const words = s => new Set(normaliseText(s ?? "").split(" ").filter(Boolean))

function passageContains(passage, quote) {
    const passageWords = words(passage)
    const quoteWords = [...words(quote)]
    if (quoteWords.length === 0) return false
    return quoteWords.filter(w => passageWords.has(w)).length / quoteWords.length >= QUOTE_IN_PASSAGE
}

/*
links an entry's open loops to the theme (map node) each one is about.
safe to call more than once and from either side of the race — it only
touches loops that aren't linked yet:
- after the entry pipeline finishes (themes now exist)
- after loop extraction, if the pipeline already finished first

each theme stores the passages (chunks) of entries it came from, so:
1. candidates = themes whose passage from this entry contains the loop's quote
2. if none, any theme this entry touched
3. pick the candidate whose meaning is closest to the loop's text
*/
export async function linkIntentionsToNodes(userId, entryId) {
    const intentions = await prisma.intention.findMany({
        where: { userId, entryId, nodeId: null },
        select: { id: true, sourceQuote: true, embedding: true },
    })
    if (intentions.length === 0) return 0

    const nodes = await prisma.node.findMany({
        where: { userId },
        select: { id: true, embedding: true, contexts: true },
    })
    const fromThisEntry = nodes
        .map(node => ({
            ...node,
            passages: (node.contexts ?? []).filter(c => c?.entryId === entryId).map(c => c.text),
        }))
        .filter(node => node.passages.length > 0)
    if (fromThisEntry.length === 0) return 0

    let linked = 0
    for (const intention of intentions) {
        const inPassage = fromThisEntry.filter(node => node.passages.some(p => passageContains(p, intention.sourceQuote)))
        const candidates = inPassage.length > 0 ? inPassage : fromThisEntry

        let best = null
        let bestSim = -Infinity
        for (const node of candidates) {
            if (!node.embedding?.length || !intention.embedding?.length) continue
            const sim = cosineSimilarity(intention.embedding, node.embedding)
            if (sim > bestSim) {
                bestSim = sim
                best = node
            }
        }
        // no embeddings to compare: a single passage match is still a confident link
        if (!best && candidates.length === 1) best = candidates[0]
        if (!best) continue

        await prisma.intention.update({ where: { id: intention.id }, data: { nodeId: best.id } })
        linked++
    }
    return linked
}
