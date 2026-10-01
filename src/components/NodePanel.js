"use client"
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { X, ArrowRight } from "lucide-react"

const CARD = "border border-line rounded-2xl h-full overflow-y-auto shadow-soft bg-surface"

function CloseButton({ onClose }) {
    if (!onClose) return null
    return (
        <button
            onClick={onClose}
            aria-label="Close"
            className="text-faint hover:text-soft p-1 -m-1 rounded-md shrink-0"
        >
            <X className="w-4 h-4" />
        </button>
    )
}

// Stored excerpts are whole pipeline "chunks" — for short entries that's
// often the entire entry verbatim, not a focused snippet, which reads as a
// wall of text next to what's meant to be a quick, scannable moment. Trims
// to roughly one sentence, preferring a real sentence boundary over a
// mid-word cut. The full entry is always one tap away via "Read full entry."
function excerptSnippet(text, maxLength = 160) {
    if (!text) return text
    const trimmed = text.trim()
    if (trimmed.length <= maxLength) return trimmed

    const window = trimmed.slice(0, maxLength)
    const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '))
    if (sentenceEnd > maxLength * 0.4) {
        return window.slice(0, sentenceEnd + 1)
    }

    const wordEnd = window.lastIndexOf(' ')
    return `${window.slice(0, wordEnd > 0 ? wordEnd : maxLength)}…`
}

// The backend wraps the important word(s) in an insight sentence with
// **markdown-style bold** — this renders that instead of showing literal
// asterisks.
function FormattedText({ text }) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
            ? <strong key={i} className="font-bold text-ink">{part.slice(2, -2)}</strong>
            : <span key={i}>{part}</span>
    )
}

export default function NodePanel({ nodeId, onClose }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)

    const loadNode = useCallback((id) => {
        setLoading(true)
        setError(false)
        fetch(`/api/node-insight/${id}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    console.error('API error:', data.error)
                    setData(null)
                    setError(true)
                } else {
                    setData(data)
                }
                setLoading(false)
            })
            .catch(error => {
                console.error('Fetch error:', error)
                setData(null)
                setError(true)
                setLoading(false)
            })
    }, [])

    useEffect(() => {
        if (!nodeId) {
            setData(null)
            setError(false)
            return
        }
        loadNode(nodeId)
    },[nodeId, loadNode])

    if (!nodeId) return (
        <div className={`${CARD} p-6 flex items-center justify-center`}>
            <div className="text-center text-faint max-w-xs">
                <p className="leading-relaxed italic text-base">
                    Click on a theme to explore what you've written about it
                </p>
            </div>
        </div>
    )
    if (loading) return (
        <div className={`${CARD} p-4`}>
            <div className="flex justify-end mb-2"><CloseButton onClose={onClose} /></div>
            <div className="text-faint italic text-sm">Loading…</div>
        </div>
    )
    if (error) return (
        <div className={`${CARD} p-4`}>
            <div className="flex justify-end mb-2"><CloseButton onClose={onClose} /></div>
            <div className="flex flex-col items-center gap-3 text-center py-8">
                <p className="text-sm text-neutral-500">Couldn't load this theme.</p>
                <button
                    onClick={() => loadNode(nodeId)}
                    className="text-sm px-4 py-1.5 rounded-full border border-line text-soft hover:bg-hush transition"
                >
                    Try again
                </button>
            </div>
        </div>
    )
    if (!data) return (
        <div className={`${CARD} p-4`}>
            <div className="flex justify-end mb-2"><CloseButton onClose={onClose} /></div>
            <div className="text-neutral-400 text-sm">No data available</div>
        </div>
    )

    const sinceLabel = data.summary.since
        ? new Date(data.summary.since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : null

    // Connections are shown as one row now — the insight sentences above
    // already explain *why* the strongest one matters in plain language,
    // so the pills are just a supporting reference, not a second hierarchy.
    const allConnections = data.connections
        ? [...data.connections.outgoing, ...data.connections.incoming].sort((a, b) => b.weight - a.weight)
        : []

    return (
        <div className={`${CARD} p-5`}>
            <div className="flex items-start justify-between gap-2 mb-1">
                <h2 className="text-[32px] leading-tight font-medium capitalize text-ink font-display">{data.summary.label}</h2>
                <CloseButton onClose={onClose} />
            </div>
            <p className="text-sm text-faint mb-1">
                {sinceLabel && `Since ${sinceLabel} · `}
                {data.summary.count} {data.summary.count === 1 ? 'entry' : 'entries'}
            </p>

            {/* Emotional tone + recent pattern — real signal that was being computed and thrown away */}
            {(data.mood || data.trajectory) && (
                <p className="text-xs text-faint mb-5">
                    {data.mood}
                    {data.mood && data.trajectory && <span className="mx-1.5">·</span>}
                    {data.trajectory}
                </p>
            )}

            {/* Reflective, human-language read of the theme */}
            {data.insights && data.insights.length > 0 && (
                <div className="mb-6 space-y-1.5">
                    {data.insights.map((insight, index) => (
                        <p key={index} className="text-sm text-soft leading-relaxed">
                            <FormattedText text={insight} />
                        </p>
                    ))}
                </div>
            )}

            {/* What's being noticed (interpretation) */}
            {data.llmSummary && (
                <div className="mb-6">
                    <h3 className="font-display text-xl font-medium text-ink mb-1.5">What's being noticed</h3>
                    <p className="text-sm leading-relaxed text-soft">{data.llmSummary}</p>
                </div>
            )}

            {/* In your words — the most personal part, now dated and in order instead of an unordered dump */}
            {data.excerpts && data.excerpts.length > 0 && (
                <div className="mb-6">
                    <h3 className="font-display text-xl font-medium text-ink mb-2">In your words</h3>
                    <div className="space-y-3">
                        {data.excerpts.map((excerpt, index) => (
                            <div key={index} className="pl-3 border-l-2 border-brand/30">
                                <p className="italic text-[15px] leading-snug text-soft">“{excerptSnippet(excerpt.text)}”</p>
                                <div className="flex items-center gap-2 mt-1">
                                    {excerpt.createdAt && (
                                        <span className="text-xs text-faint">
                                            {new Date(excerpt.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                        </span>
                                    )}
                                    {excerpt.entryId && (
                                        <Link
                                            href={`/journal?entry=${excerpt.entryId}`}
                                            className="text-xs text-brand hover:text-brand-deep inline-flex items-center gap-0.5"
                                        >
                                            Read full entry <ArrowRight className="w-2.5 h-2.5" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Connected themes — supporting reference now that the sentences above already explain the "why" */}
            {allConnections.length > 0 && (
                <div className="mb-6">
                    <h3 className="font-display text-xl font-medium text-ink mb-2">Connected to</h3>
                    <div className="flex flex-wrap gap-1.5">
                        {allConnections.slice(0, 6).map((conn, index) => (
                            <span key={index} className="text-sm px-3 py-1 border border-line rounded-full text-soft capitalize">
                                {conn.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <Link
                href={`/journal?theme=${encodeURIComponent(data.summary.label)}`}
                className="block text-center text-sm py-2.5 rounded-full bg-brand hover:bg-brand-deep text-white transition"
            >
                Write about this
            </Link>
        </div>
    )
}
