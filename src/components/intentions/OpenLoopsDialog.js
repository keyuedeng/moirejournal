"use client"
import { useCallback, useEffect, useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import LoopRow from "./LoopRow"
import { SuggestionRow, ResolvedLine } from "./PostEntryCard"

function groupActive(active) {
    const groups = [
        { key: "WEEK", title: "This week", items: [] },
        { key: "MONTH", title: "This month", items: [] },
        { key: "SOMEDAY", title: "Someday", items: [] },
        { key: "WISH", title: "Wishes", items: [] },
    ]
    const byKey = Object.fromEntries(groups.map(g => [g.key, g]))
    for (const item of active) {
        const key = item.kind === "WISH" ? "WISH" : (item.horizon ?? "SOMEDAY")
        byKey[key].items.push(item)
    }
    return groups.filter(g => g.items.length > 0)
}

// everything you're holding onto, plus suggestions you never answered and
// what you closed lately (so finishing things feels like progress)
export default function OpenLoopsDialog({ open, onOpenChange, onChanged }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState(false)
    const [answered, setAnswered] = useState({}) // suggestion id -> message
    const [settled, setSettled] = useState(new Set())

    const load = useCallback(async () => {
        setError(false)
        try {
            const res = await fetch("/api/intentions")
            if (!res.ok) throw new Error(await res.text())
            setData(await res.json())
        } catch (err) {
            console.error("Failed to load open loops", err)
            setError(true)
        }
    }, [])

    useEffect(() => {
        if (!open) return
        setAnswered({})
        setSettled(new Set())
        load()
    }, [open, load])

    const settle = id => {
        setSettled(prev => new Set(prev).add(id))
        onChanged?.()
    }

    const active = (data?.active ?? []).filter(item => !settled.has(item.id))
    const suggested = data?.suggested ?? []
    const closed = data?.closed ?? []

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="!max-w-[calc(100%-2rem)] sm:!max-w-xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-[family-name:var(--font-cormorant)] font-semibold text-neutral-800">Open loops</DialogTitle>
                    <DialogDescription className="text-sm text-neutral-500">
                        Things you said you'd do. Closing one, or letting it go, both count.
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <div className="py-8 text-center">
                        <p className="text-neutral-500 mb-3">Couldn't load your open loops.</p>
                        <button onClick={load} className="text-sm px-4 py-1.5 rounded-full border border-stone-300 text-neutral-600 hover:bg-stone-100 transition">
                            Try again
                        </button>
                    </div>
                ) : !data ? (
                    <p className="py-8 text-sm text-neutral-400">Loading…</p>
                ) : (
                    <div className="space-y-6 pt-2">
                        {active.length === 0 && suggested.length === 0 && (
                            <p className="text-sm text-neutral-400">No open loops right now.</p>
                        )}

                        {groupActive(active).map(group => (
                            <Group key={group.key} title={group.title}>
                                {group.items.map(item => (
                                    <li key={item.id} className="py-2">
                                        <LoopRow item={item} onSettled={() => settle(item.id)} />
                                    </li>
                                ))}
                            </Group>
                        ))}

                        {suggested.length > 0 && (
                            <Group title="Not decided yet">
                                {suggested.map(item => (
                                    <li key={item.id} className="py-3">
                                        {answered[item.id] ? (
                                            <ResolvedLine message={answered[item.id]} />
                                        ) : (
                                            <SuggestionRow
                                                item={item}
                                                onResolved={message => {
                                                    setAnswered(prev => ({ ...prev, [item.id]: message }))
                                                    onChanged?.()
                                                }}
                                            />
                                        )}
                                    </li>
                                ))}
                            </Group>
                        )}

                        {closed.length > 0 && (
                            <Group title="Closed recently">
                                {closed.map(item => (
                                    <li key={item.id} className="py-2 flex items-baseline justify-between gap-3">
                                        <span className="text-neutral-400 line-through decoration-neutral-300">{item.text}</span>
                                        <span className="text-xs text-neutral-400 shrink-0">
                                            {new Date(item.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                        </span>
                                    </li>
                                ))}
                            </Group>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

function Group({ title, children }) {
    return (
        <div>
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">{title}</h3>
            <ul className="divide-y divide-stone-100">{children}</ul>
        </div>
    )
}
