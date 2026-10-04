import prisma from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { normaliseText } from "@/lib/utils/normaliseText";

const DAY_MS = 24 * 60 * 60 * 1000

// themes about feelings and wellbeing need more evidence before Moiré
// suggests turning them into a goal
const SENSITIVE_CATEGORIES = ["emotional_state", "wellbeing"]
const MIN_ENTRIES = 3
const MIN_ENTRIES_SENSITIVE = 5
const MIN_SPAN_DAYS = 7          // the mentions must spread over at least a week
const GLOBAL_COOLDOWN_DAYS = 7   // at most one nudge a week, across everything
const THEME_COOLDOWN_DAYS = 28   // and not the same theme again for ~a month
const MAX_LLM_TRIES = 2
// when the model decides a theme isn't worth suggesting, don't ask about
// that theme again for a while — otherwise every look-back visit and every
// entry would re-ask the same question (an LLM call each time)
const DECLINED_RECHECK_DAYS = 14

export const isSensitiveTheme = node => (node.categories ?? []).some(c => SENSITIVE_CATEGORIES.includes(c))

/*
looks for one recurring theme worth gently offering as a goal, and saves it
as a PENDING PatternSuggestion. returns it, or null.
nodeIds: only consider these themes (e.g. the ones the entry just written
touched); null = any theme (used by the weekly look back).
*/
export async function maybeSuggestPattern(userId, { nodeIds = null, now = new Date() } = {}) {
    // everything this needs, in one round trip (relations are fetched as
    // separate queries rather than nested includes, which Prisma would run
    // one after another)
    const [recent, nodes, caught, suggestedLately] = await Promise.all([
        prisma.patternSuggestion.findFirst({
            where: { userId, createdAt: { gte: new Date(now - GLOBAL_COOLDOWN_DAYS * DAY_MS) } },
            select: { id: true },
        }),
        prisma.node.findMany({
            where: {
                userId,
                ...(nodeIds && { id: { in: nodeIds } }),
                suggestionsMutedAt: null,
                OR: [{ suggestionSnoozedUntil: null }, { suggestionSnoozedUntil: { lte: now } }],
            },
            select: { id: true, label: true, categories: true, contexts: true },
        }),
        // a theme that already has an open (or just-suggested) loop has been caught
        prisma.intention.findMany({
            where: { userId, status: { in: ["ACTIVE", "SUGGESTED"] }, nodeId: { not: null } },
            select: { nodeId: true },
        }),
        prisma.patternSuggestion.findMany({
            where: { userId, createdAt: { gte: new Date(now - THEME_COOLDOWN_DAYS * DAY_MS) } },
            select: { nodeId: true },
        }),
    ])
    if (recent) return null

    const skip = new Set([...caught.map(i => i.nodeId), ...suggestedLately.map(s => s.nodeId)])
    const distinctEntries = node => new Set((node.contexts ?? []).map(c => c?.entryId).filter(Boolean)).size
    // only themes that could possibly qualify — usually none, which skips
    // the date lookup below entirely
    const open = nodes.filter(n => !skip.has(n.id) && distinctEntries(n) >= MIN_ENTRIES)
    if (open.length === 0) return null

    // when did each theme come up? contexts only store the entry id
    const entryIds = [...new Set(open.flatMap(n => (n.contexts ?? []).map(c => c?.entryId).filter(Boolean)))]
    const entries = await prisma.entry.findMany({ where: { id: { in: entryIds }, userId }, select: { id: true, createdAt: true } })
    const entryDate = new Map(entries.map(e => [e.id, e.createdAt]))

    const candidates = open
        .map(node => {
            const passages = (node.contexts ?? [])
                .filter(c => c?.text && entryDate.has(c.entryId))
                .map(c => ({ text: c.text, entryId: c.entryId, date: entryDate.get(c.entryId) }))
                .sort((a, b) => a.date - b.date)
            const distinctEntries = new Set(passages.map(p => p.entryId)).size
            const span = passages.length ? (passages.at(-1).date - passages[0].date) / DAY_MS : 0
            return { node, passages, distinctEntries, span }
        })
        .filter(c => c.distinctEntries >= (isSensitiveTheme(c.node) ? MIN_ENTRIES_SENSITIVE : MIN_ENTRIES) && c.span >= MIN_SPAN_DAYS)
        .sort((a, b) => b.distinctEntries - a.distinctEntries)

    for (const candidate of candidates.slice(0, MAX_LLM_TRIES)) {
        const written = await writeSuggestion(candidate)
        if (!written) {
            await prisma.node.update({
                where: { id: candidate.node.id },
                data: { suggestionSnoozedUntil: new Date(now.getTime() + DECLINED_RECHECK_DAYS * DAY_MS) },
            })
            continue
        }
        return prisma.patternSuggestion.create({
            data: {
                userId,
                nodeId: candidate.node.id,
                observation: written.observation,
                goalText: written.goalText,
                quote: written.quote,
                entryId: written.entryId,
            },
        })
    }
    return null
}

/*
asks the model whether this recurring theme is something the writer seems
to want to change (not just a part of their life they describe), and if so
writes the nudge. returns { observation, goalText, quote, entryId } or null.
*/
async function writeSuggestion({ node, passages, distinctEntries }) {
    const shown = passages.slice(-6)
    const prompt =
`
A person keeps a private journal. One theme keeps coming up in their writing.
Decide whether it is worth gently asking if they'd like to make it a goal.

Theme: "${node.label}"
It appears in ${distinctEntries} separate entries. Passages, oldest first:
${shown.map((p, i) => `${i + 1}. """${p.text}"""`).join("\n")}

Only suggest (suggest: true) if the passages show the writer wants something to change,
is dissatisfied with how it is, or keeps wishing for something.
If the theme is just part of their life that they describe (a friend, their job, a hobby they enjoy),
or it's mostly venting with no wish for change, return suggest: false.

If suggesting:
- "observation": ONE factual sentence in second person about what keeps coming up and how often,
  using the number above ("This is the third time you've written about feeling stuck.").
  No diagnosis, no advice, no "should", no labels like "anxiety" unless the writer used them.
- "goalText": a gentle goal in the writer's own terms, max 8 words ("Find one thing to work towards").
- "quote": ONE sentence copied exactly, character for character, from the passages that shows it.

Return ONLY valid JSON:
{ "suggest": boolean, "observation": string|null, "goalText": string|null, "quote": string|null }
`
    const result = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
    })
    const parsed = JSON.parse(result.choices[0].message.content)
    if (!parsed.suggest || !parsed.observation?.trim() || !parsed.goalText?.trim()) return null

    // the quote is shown as the writer's own words, so it must be real
    const match = findPassage(parsed.quote, shown)
    if (!match) return null

    return {
        observation: parsed.observation.trim(),
        goalText: parsed.goalText.trim().replace(/\.$/, ""),
        quote: match.quote,
        entryId: match.entryId,
    }
}

// finds the passage the quote came from (most of its words in one sentence)
function findPassage(quote, passages) {
    if (typeof quote !== "string" || !quote.trim()) return null
    const words = s => normaliseText(s).split(" ").filter(Boolean)
    const quoteWords = words(quote)
    for (const p of passages) {
        const sentences = p.text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean)
        for (const sentence of sentences) {
            const set = new Set(words(sentence))
            if (quoteWords.length && quoteWords.filter(w => set.has(w)).length / quoteWords.length >= 0.7) {
                return { quote: sentence, entryId: p.entryId }
            }
        }
    }
    return null
}
