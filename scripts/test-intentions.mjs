// Runs the intention extractor over the fixture entries and prints
// expected vs actual, so the prompt can be tuned before any UI exists.
//
//   node --env-file=.env --import ./scripts/alias-loader.mjs scripts/test-intentions.mjs
//   ...add --only <fixture-id> to run a single entry
//   ...add --verbose to also show items the extractor dropped, and why
//
// Reads scripts/fixtures/intention-entries.mock.json and, if present,
// scripts/fixtures/private/intention-entries.json (git-ignored, real entries).

import { readFileSync, existsSync } from "node:fs"
import { extractIntentions } from "@/lib/intentions/extractIntentions"

const FILES = [
    "scripts/fixtures/intention-entries.mock.json",
    "scripts/fixtures/private/intention-entries.json",
]

const onlyIndex = process.argv.indexOf("--only")
const only = onlyIndex !== -1 ? process.argv[onlyIndex + 1] : null

const verbose = process.argv.includes("--verbose")

const fixtures = FILES
    .filter(f => existsSync(f))
    .flatMap(f => JSON.parse(readFileSync(f, "utf8")))
    .filter(f => !only || f.id === only)

const dim = s => `\x1b[2m${s}\x1b[0m`
const bold = s => `\x1b[1m${s}\x1b[0m`
const red = s => `\x1b[31m${s}\x1b[0m`
const green = s => `\x1b[32m${s}\x1b[0m`

const results = await Promise.all(fixtures.map(async f => {
    const rejected = []
    // fixtures can list the writer's existing open loops as plain strings
    const existing = (f.existingLoops ?? []).map((text, i) => ({ id: `loop-${i + 1}`, text }))
    const { items: actual, finishedIds } = await extractIntentions(f.body, {
        existing,
        onRejected: (item, reason) => rejected.push({ item, reason }),
    })
    const textOf = id => existing.find(loop => loop.id === id)?.text
    return { f, actual, rejected, finished: finishedIds.map(textOf), textOf }
}))

let countMatches = 0
for (const { f, actual, rejected, finished, textOf } of results) {
    // items that repeat an existing loop aren't new, so they don't count
    const fresh = actual.filter(a => !a.existingId)
    const countOk = fresh.length === f.expected.length
    if (countOk) countMatches++

    console.log(`\n${bold(f.id)}  ${countOk ? green(`${fresh.length} new items`) : red(`${fresh.length} new items, expected ${f.expected.length}`)}`)

    console.log(dim("  expected:"))
    if (f.expected.length === 0) console.log(dim("    (nothing)"))
    for (const e of f.expected) console.log(dim(`    ${e.kind.padEnd(4)}  ${e.text}${e.horizon ? ` [${e.horizon}]` : ""}`))
    if (f.acceptableAlso) console.log(dim(`    also ok: ${f.acceptableAlso.join(", ")}`))

    console.log("  actual:")
    if (actual.length === 0) console.log("    (nothing)")
    for (const a of actual) {
        const repeats = a.existingId ? `  → repeats "${textOf(a.existingId)}"` : ""
        console.log(`    ${a.kind.padEnd(4)}  ${a.text}${a.suggestedHorizon ? ` [${a.suggestedHorizon}]` : ""}  ${dim(`conf ${a.confidence}`)}${repeats}`)
        console.log(dim(`          “${a.sourceQuote}”`))
        if (a.suggestedStep) console.log(dim(`          step: ${a.suggestedStep}`))
    }
    if (f.existingLoops) {
        console.log(dim(`  expected repeats: ${(f.expectedRepeats ?? []).join(", ") || "-"} · expected finished: ${(f.expectedFinished ?? []).join(", ") || "-"}`))
        console.log(`  finished: ${finished.join(", ") || "-"}`)
    }
    if (verbose) {
        for (const { item, reason } of rejected) console.log(red(`    dropped  ${item.kind} ${item.text}  (${reason})`))
    }
    if (f.shouldNotExtract?.length) console.log(dim(`  should skip: ${f.shouldNotExtract.join(" · ")}`))
}

console.log(`\n${bold(`${countMatches}/${results.length}`)} entries returned the expected number of new items ${dim("(a rough signal — read the output above)")}\n`)
