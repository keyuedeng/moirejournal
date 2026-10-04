import prisma from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { normaliseText } from "@/lib/utils/normaliseText";
import { maybeSuggestPattern } from "@/lib/patterns/patternSuggestions";

const MAX_ENTRIES_IN_PROMPT = 12
const MAX_CHARS_PER_ENTRY = 1500

const loopSelect = { id: true, text: true, kind: true, horizon: true, dueAt: true, nextCheckInAt: true, completedAt: true, updatedAt: true }

/*
The weekly look back for one week [start, end), in two parts so the page
can show the instant part straight away:

getWeekLoops: database only, fast
- closed / letGo: loops finished or let go that week
- stillOpen: every active loop, to tidy

getWeekReflection: may need the model (saved per week, so usually not)
- reflection: 1–2 sentences about the week, and one line the user wrote
- nudge: a pending pattern suggestion (the fallback for ones not shown after an entry)
current: true when this is the week being looked back on now (may create a nudge)
*/
export async function getWeekLoops(userId, start, end) {
    const [entryCount, closed, letGo, stillOpen] = await Promise.all([
        prisma.entry.count({ where: { userId, createdAt: { gte: start, lt: end } } }),
        prisma.intention.findMany({
            where: { userId, status: "DONE", completedAt: { gte: start, lt: end } },
            select: loopSelect, orderBy: { completedAt: "asc" },
        }),
        prisma.intention.findMany({
            where: { userId, status: "DROPPED", updatedAt: { gte: start, lt: end } },
            select: loopSelect, orderBy: { updatedAt: "asc" },
        }),
        prisma.intention.findMany({
            where: { userId, status: "ACTIVE" },
            select: loopSelect,
            orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        }),
    ])
    return { entryCount, closed, letGo, stillOpen }
}

export async function getWeekReflection(userId, start, end, { current = false } = {}) {
    // one round trip for everything that doesn't depend on anything else
    // (each round trip is slow from far away from the database)
    const [entries, saved, pending] = await Promise.all([
        prisma.entry.findMany({
            where: { userId, createdAt: { gte: start, lt: end } },
            select: { id: true, title: true, body: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        }),
        prisma.weeklyReflection.findUnique({ where: { userId_weekStart: { userId, weekStart: start } } }),
        current
            ? prisma.patternSuggestion.findFirst({
                where: { userId, status: "PENDING" },
                orderBy: { createdAt: "desc" },
                select: nudgeSelect,
            })
            : null,
    ])
    const [reflection, nudge] = await Promise.all([
        getReflection(userId, start, entries, saved),
        current ? (pending ?? findNewNudge(userId)) : null,
    ])
    return { entryCount: entries.length, reflection, nudge }
}

const nudgeSelect = { id: true, observation: true, goalText: true, quote: true }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/*
regenerates and saves a week's reflection ahead of time — called after an
entry is processed, so the look back is ready before anyone opens it.
does nothing if the saved one is already up to date.
*/
export async function refreshWeekReflection(userId, weekStart) {
    const [entries, saved] = await Promise.all([
        prisma.entry.findMany({
            where: { userId, createdAt: { gte: weekStart, lt: new Date(weekStart.getTime() + WEEK_MS) } },
            select: { id: true, title: true, body: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        }),
        prisma.weeklyReflection.findUnique({ where: { userId_weekStart: { userId, weekStart } } }),
    ])
    await getReflection(userId, weekStart, entries, saved)
}

// nothing waiting: look across all themes (the weekly look back is the calm
// place for nudges about heavier themes too)
async function findNewNudge(userId) {
    const created = await maybeSuggestPattern(userId).catch(err => {
        console.error("Failed to look for a pattern nudge", err)
        return null
    })
    return created && { id: created.id, observation: created.observation, goalText: created.goalText, quote: created.quote }
}

// the week's written reflection, saved per week and redone when that
// week's entry count changes (a new entry was written)
async function getReflection(userId, weekStart, entries, saved) {
    if (entries.length === 0) return null

    if (saved && saved.entryCount === entries.length) {
        return { text: saved.text, quote: saved.quote, quoteEntryId: saved.quoteEntryId, quoteDate: dateOf(entries, saved.quoteEntryId) }
    }

    const themes = await weekThemes(userId, entries.map(e => e.id))
    const written = await writeReflection(entries, themes)
    if (!written) return null

    await prisma.weeklyReflection.upsert({
        where: { userId_weekStart: { userId, weekStart } },
        create: { userId, weekStart, entryCount: entries.length, ...written },
        update: { entryCount: entries.length, ...written },
    })
    return { ...written, quoteDate: dateOf(entries, written.quoteEntryId) }
}

const dateOf = (entries, id) => entries.find(e => e.id === id)?.createdAt ?? null

// the themes this week's entries touched, most mentioned first
async function weekThemes(userId, entryIds) {
    const ids = new Set(entryIds)
    const nodes = await prisma.node.findMany({ where: { userId }, select: { label: true, contexts: true } })
    return nodes
        .map(n => ({ label: n.label, mentions: (n.contexts ?? []).filter(c => ids.has(c?.entryId)).length }))
        .filter(t => t.mentions > 0)
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 6)
        .map(t => t.label)
}

async function writeReflection(entries, themes) {
    const shown = entries.slice(-MAX_ENTRIES_IN_PROMPT)
    const prompt =
`
You help someone look back on their week of journaling. Here are this week's entries, oldest first.
${themes.length ? `Themes that came up most: ${themes.join(", ")}.` : ""}

${shown.map((e, i) => `Entry ${i + 1}${e.title ? ` ("${e.title}")` : ""}:\n"""${e.body.slice(0, MAX_CHARS_PER_ENTRY)}"""`).join("\n\n")}

Write:
- "reflection": 1–2 short sentences in second person describing what this week held for them, mostly in their own terms
  ("You wrote ${entries.length === 1 ? "once" : `${entries.length} times`} this week, mostly about ..."). Describe, don't judge.
  No advice, no "should", no diagnosis or clinical labels, no praise or cheerleading.
- "quote": ONE sentence they wrote this week that's worth seeing again: meaningful or telling, not the most painful line.
  Copy it exactly, character for character.

Return ONLY valid JSON: { "reflection": string, "quote": string }
`
    const result = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
    })
    const parsed = JSON.parse(result.choices[0].message.content)
    if (!parsed.reflection?.trim()) return null

    const match = findSentence(parsed.quote, shown)
    return {
        text: parsed.reflection.trim(),
        quote: match?.sentence ?? null,
        quoteEntryId: match?.entryId ?? null,
    }
}

// the entry sentence a quote came from — shown as the user's words, so it must be real
function findSentence(quote, entries) {
    if (typeof quote !== "string" || !quote.trim()) return null
    const words = s => normaliseText(s).split(" ").filter(Boolean)
    const quoteWords = words(quote)
    for (const entry of entries) {
        for (const sentence of entry.body.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean)) {
            const set = new Set(words(sentence))
            if (quoteWords.length && quoteWords.filter(w => set.has(w)).length / quoteWords.length >= 0.7) {
                return { sentence, entryId: entry.id }
            }
        }
    }
    return null
}
