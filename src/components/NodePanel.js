"use client"
import { useState, useEffect, useCallback } from "react"
import { X } from "lucide-react"

const CARD = "border border-stone-200 rounded-xl h-full overflow-y-auto shadow-sm bg-white/80 backdrop-blur-sm"

function CloseButton({ onClose }) {
    if (!onClose) return null
    return (
        <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-600 p-1 -m-1 rounded-md shrink-0"
        >
            <X className="w-4 h-4" />
        </button>
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
            <div className="text-center text-neutral-400 max-w-xs">
                <p className="text-base leading-relaxed font-[family-name:var(--font-cormorant)] italic text-lg">
                    Click on a theme to explore what you've written about it
                </p>
            </div>
        </div>
    )
    if (loading) return (
        <div className={`${CARD} p-4`}>
            <div className="flex justify-end mb-2"><CloseButton onClose={onClose} /></div>
            <div className="text-neutral-400 text-sm font-[family-name:var(--font-cormorant)] italic">Loading...</div>
        </div>
    )
    if (error) return (
        <div className={`${CARD} p-4`}>
            <div className="flex justify-end mb-2"><CloseButton onClose={onClose} /></div>
            <div className="flex flex-col items-center gap-3 text-center py-8">
                <p className="text-sm text-neutral-500">Couldn't load this theme.</p>
                <button
                    onClick={() => loadNode(nodeId)}
                    className="text-sm px-4 py-1.5 rounded-full border border-stone-300 text-neutral-600 hover:bg-stone-100 transition"
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

    return (
        <div className={`${CARD} p-5`}>
            <div className="flex items-start justify-between gap-2 mb-1">
                <h2 className="text-2xl font-semibold capitalize text-neutral-800 font-[family-name:var(--font-cormorant)]">{data.summary.label}</h2>
                <CloseButton onClose={onClose} />
            </div>
            <p className="text-sm text-neutral-500 mb-6">
                Appears in {data.summary.count} {data.summary.count === 1 ? 'entry' : 'entries'}
            </p>

            {/* What you wrote (bullet point summaries) */}
            {data.bulletPoints && data.bulletPoints.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-sm font-medium text-neutral-700 mb-2">Moments this appears</h3>
                    <ul className="space-y-1.5">
                        {data.bulletPoints.map((point, index) => (
                            <li key={index} className="text-sm text-neutral-600 flex">
                                <span className="mr-2 text-[#b88998]">–</span>
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* What's being noticed (interpretation) */}
            {data.llmSummary && (
                <div className="mb-6">
                    <h3 className="text-sm font-medium text-neutral-700 mb-2">What's being noticed</h3>
                    <p className="text-sm leading-relaxed text-neutral-600">{data.llmSummary}</p>
                </div>
            )}

            {/* How this connects (graph context) */}
            {data.connections && (data.connections.outgoing.length > 0 || data.connections.incoming.length > 0) && (() => {
                // Combine all connections with weights
                const allConnections = [
                    ...data.connections.outgoing,
                    ...data.connections.incoming
                ].sort((a, b) => b.weight - a.weight)

                const strongConnections = allConnections.filter(c => c.weight > 2)
                const gentleConnections = allConnections.filter(c => c.weight <= 2)

                return (
                    <div className="mb-6">
                        <h3 className="text-sm font-medium text-neutral-700 mb-2">Connected themes</h3>
                        <div className="space-y-2">
                            {strongConnections.length > 0 && (
                                <div>
                                    <p className="text-xs text-neutral-500 mb-1">Strongly linked:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {strongConnections.slice(0, 5).map((conn, index) => (
                                            <span key={index} className="text-xs px-2 py-1 bg-[#b88998]/15 rounded-full text-[#8a6270]">
                                                {conn.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {gentleConnections.length > 0 && (
                                <div>
                                    <p className="text-xs text-neutral-500 mb-1">Gently linked:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {gentleConnections.slice(0, 5).map((conn, index) => (
                                            <span key={index} className="text-xs px-2 py-1 bg-stone-100 rounded-full text-neutral-600">
                                                {conn.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
            })()}

            {/* Full excerpts at the bottom */}
            {data.excerpts && data.excerpts.length > 0 && (
                <div className="pt-4 border-t border-stone-200">
                    <h3 className="text-sm font-medium text-neutral-700 mb-2">Full excerpts</h3>
                    <div className="space-y-2">
                        {Array.from(new Set(data.excerpts.map(e => e.excerpt || e.text)))
                            .map((excerpt, index) => (
                                <div key={index} className="text-xs text-neutral-500 italic pl-3 border-l-2 border-[#b88998]/30">
                                    {excerpt}
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    )
}
