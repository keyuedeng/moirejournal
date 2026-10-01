import { openai } from "@/lib/openai";
import { normaliseText } from "@/lib/utils/normaliseText";

const KINDS = ["TASK", "GOAL", "WISH"]
const HORIZONS = ["WEEK", "MONTH", "SOMEDAY"]
// 0.6 is where the model parks "maybe" items (e.g. a parent's suggestion
// the writer hasn't agreed to); real intentions come back at 0.7+
const MIN_CONFIDENCE = 0.65
// share of a quote's words that must appear in one sentence of the entry
const QUOTE_MATCH = 0.7
const MAX_ITEMS = 8

/*
extracts "open loops" from a whole journal entry:
things the writer says THEY want, need or intend to do.
runs on the whole entry (not per chunk) because an intention
often spans a few sentences.
returns: [{ text, sourceQuote, kind, suggestedStep, suggestedHorizon, confidence }]
most important first
*/
export async function extractIntentions(body, { now = new Date(), onRejected } = {}) {
    const today = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

    const prompt =
`
You read a personal journal entry or brain dump and find its "open loops":
things the WRITER says they want, need or intend to do themselves, that are not done yet.

Today is ${today}.

For each candidate return:
- "basis": decide this FIRST. Whose intention is it, really?
    • "writer" = the writer says in their own words that THEY want, need, plan or intend to do it
    • "someone_else" = it is another person's idea, request, plan or opinion, and the writer hasn't clearly taken it on
    • "problem_only" = the writer describes a problem or feeling but never says they want to do something about it
- "text": a short imperative in the writer's own terms, max 8 words ("Book a haircut", "Get back into hobbies").
  It must make sense on its own weeks later, without the entry: "Book a uni counselling session", not "Book a session".
- "sourceQuote": the exact words from the entry it came from, copied character for character. One sentence or less.
- "kind":
    • "TASK" = concrete and finishable ("email tutor about the extension", "call grandma")
    • "GOAL" = ongoing, repeated or a habit ("go to the gym 3 times a week", "stop scrolling in bed", "practise leetcode")
    • "WISH" = something wanted but vague or far off ("get back into hobbies", "live in Japan one day")
    Anything about deciding, figuring out or setting goals ("set some goals", "reevaluate my life",
    "figure out what I want") is a WISH, even when phrased as an action — it has no clear finish line.
- "suggestedStep": for WISH (and for a GOAL with no clear action), ONE small, concrete first step that could be done this week.
  If the writer already proposed a step, use theirs. Otherwise null.
- "suggestedHorizon": when it should happen, judged from the entry and today's date:
    • "WEEK" = within about 7 days ("before I leave next week", "by Friday", "this weekend", "tomorrow")
    • "MONTH" = within about a month
    • "SOMEDAY" = no time pressure
    • null = can't tell
  For a GOAL, use how often it repeats: a weekly habit ("3 times a week") is "WEEK".
- "confidence": 0 to 1, how sure you are this is a real intention the writer would want to be reminded of.

ONLY include something if the writer expresses that THEY want, need, plan or intend to do it.

DO NOT include:
- venting or emotional expressions ("I want to scream", "I need a holiday from my life")
- jokes, sarcasm or rhetorical lines ("I should just drop out lol")
- things already done (past tense: "went to the dentist", "did 2 questions")
- what other people want or think the writer should do ("mum says I need to...", "he thinks I should..."),
  unless the writer clearly agrees in their own words ("...and honestly she's right, I'll do it")
- invitations or other people's plans the writer is still undecided about ("not sure if I'll go", "not committing yet")
- other people's actions or plans
- conditional plans that depend on something that hasn't happened ("if I get the job I'll move out")
- plans for the next few hours, right as they write ("time to lock in", "going to bed", "starting with one question today")
- routine chores with no reason to be reminded ("groceries")
- goals the writer did not state: never infer a goal from a complaint ("I sit at my desk all day" is NOT "move more")
- health, eating, sleep or mental-health goals the writer did not state as something they want to do.
  Describing a problem ("I keep forgetting to eat", "I've been so anxious") is NOT an intention.
  Never diagnose, label or give advice.

Keep the writer's words and tone. No clinical, coaching or motivational language.
When one sentence lists several distinct things ("I need to work on X, Y and Z"), make one item per thing.
Merge items only when they are the same intention.

EXAMPLES (not from this entry)
- "My sister keeps telling me I need to start saving. Maybe, idk." → basis "someone_else"
- "My sister keeps telling me I need to start saving and she's right, I'm putting $50 aside every payday." → GOAL "Save $50 every payday"
- "I haven't been sleeping well at all lately." → basis "problem_only"
- "I want to fix my sleep, I'm going to try no screens after 11." → GOAL "Fix my sleep", suggestedStep "No screens after 11pm"
- "I need to sort out my uni stuff, my job applications and my room." → three items, one each
- "Need to figure out what I actually want to do after uni." → WISH, not TASK Return at most ${MAX_ITEMS}, most important first
(things with a near deadline first, then explicit "I need to" items, then wishes).
Returning an empty list is completely fine when the entry has no open loops.

Return ONLY valid JSON. No backticks no prefix/suffix.

Format:
{
    "items": [
        { "basis": "writer"|"someone_else"|"problem_only", "text": string, "sourceQuote": string, "kind": "TASK"|"GOAL"|"WISH", "suggestedStep": string|null, "suggestedHorizon": "WEEK"|"MONTH"|"SOMEDAY"|null, "confidence": number }
    ]
}

Journal entry:
"""
${body}
"""
`
    const result = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
    })

    const parsed = JSON.parse(result.choices[0].message.content)
    const items = Array.isArray(parsed.items) ? parsed.items : []

    return items
        .map(item => ({ ...item, sourceQuote: findQuote(item?.sourceQuote, body) }))
        .filter(item => {
            const reason = rejectionReason(item, body)
            // lets the fixture script show what got dropped and why
            if (reason) onRejected?.(item, reason)
            return !reason
        })
        .slice(0, MAX_ITEMS)
        .map(item => ({
            text: capitalise(item.text.trim()),
            sourceQuote: item.sourceQuote,
            kind: item.kind,
            suggestedStep: item.suggestedStep?.trim() || null,
            suggestedHorizon: HORIZONS.includes(item.suggestedHorizon) ? item.suggestedHorizon : null,
            confidence: item.confidence,
        }))
}

// returns why an item should be dropped, or null if it's fine
function rejectionReason(item, body) {
    if (!item || typeof item.text !== "string" || !item.text.trim()) return "no text"
    // the model labels whose idea each item is before writing it; anything
    // that isn't the writer's own intention is dropped here, not in the prompt
    if (item.basis !== "writer") return `basis: ${item.basis}`
    if (!KINDS.includes(item.kind)) return `bad kind: ${item.kind}`
    if (typeof item.confidence !== "number" || item.confidence < MIN_CONFIDENCE) return `low confidence: ${item.confidence}`
    if (!item.sourceQuote) return "quote not found in entry"
    return null
}

function capitalise(s) {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

const clean = s => normaliseText(s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"'))

/*
the quote is shown back to the user as "your words", so it must really be
from the entry. the model often tweaks it slightly (especially when splitting
a list into separate items), so:
- exact match (ignoring case/punctuation) → use it as is
- otherwise → use the entry sentence that contains most of the quote's words
- nothing close enough → null, and the item is dropped rather than misquote them
*/
function findQuote(quote, body) {
    if (typeof quote !== "string" || !quote.trim()) return null
    if (clean(body).includes(clean(quote))) return quote.trim()

    const quoteWords = clean(quote).split(" ")
    const sentences = body.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean)

    let best = null
    let bestScore = 0
    for (const sentence of sentences) {
        const words = new Set(clean(sentence).split(" "))
        const score = quoteWords.filter(w => words.has(w)).length / quoteWords.length
        if (score > bestScore) {
            best = sentence
            bestScore = score
        }
    }
    return bestScore >= QUOTE_MATCH ? best : null
}
