"use client"
import { useState } from "react"
import LoopRow from "./LoopRow"
import OpenLoopsDialog from "./OpenLoopsDialog"

/*
The strip above the editor. Always there once you have any open loops, so
something you confirm visibly lands somewhere — even when nothing is
pressing yet. Shows up to 3 loops the surfacing rules picked.
data: { mode: "daily" | "return", activeCount, items } | null
*/
export default function OpenLoops({ data, onChanged, onWriteAbout }) {
    const [dialogOpen, setDialogOpen] = useState(false)
    // rows that finished their action — hidden right away so the strip
    // doesn't wait on the refetch
    const [settled, setSettled] = useState(new Set())

    if (!data || data.activeCount === 0) return null

    const items = data.items.filter(item => !settled.has(item.id))
    const settle = id => {
        setSettled(prev => new Set(prev).add(id))
        onChanged?.()
    }

    return (
        <section className="border border-stone-200 rounded-xl px-4 py-3 mb-4 bg-white/60" aria-label="Open loops">
            <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-baseline gap-2 min-w-0">
                    <h2 className="text-neutral-700 font-medium shrink-0">
                        {data.mode === "return" ? "Since you were last here" : "Open loops"}
                    </h2>
                    <span className="text-xs text-neutral-400 truncate">
                        {data.mode === "return"
                            ? `${data.activeCount} open ${data.activeCount === 1 ? "loop" : "loops"}`
                            : `${data.activeCount} · things you said you'd do`}
                    </span>
                </div>
                <button
                    onClick={() => setDialogOpen(true)}
                    className="text-xs text-neutral-400 hover:text-neutral-600 transition shrink-0"
                >
                    See all
                </button>
            </div>

            {items.length > 0 ? (
                <ul className="mt-2 divide-y divide-stone-100">
                    {items.map(item => (
                        <li key={item.id} className="py-2">
                            <LoopRow item={item} onSettled={() => settle(item.id)} onWriteAbout={onWriteAbout} />
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-1 text-sm text-neutral-400">Nothing pressing right now.</p>
            )}

            <OpenLoopsDialog open={dialogOpen} onOpenChange={setDialogOpen} onChanged={onChanged} />
        </section>
    )
}
