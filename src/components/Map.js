"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import { forceX, forceY } from "d3-force"
import { Plus, Minus, Maximize2 } from "lucide-react"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
    ssr: false
})

// Module-scoped so it survives client-side navigation away from and back to
// this page — same pattern used for journal entries. Resets on a hard reload.
let graphCache = null

// Distance between linked nodes. These used to be tiny (5-15px), which was
// only tolerable because the old query padded the graph out with dozens of
// noise nodes. With just a handful of real themes, that tight spacing makes
// the graph's whole natural footprint a few dozen pixels across — zoomToFit
// then has to zoom in enormously to fill the screen, blowing up node/label
// size along with it. Scaled up so small graphs still get a roomy layout.
function linkDistance(link) {
    if (link.weight <= 1) return 90
    if (link.weight > 2) return 30
    return 60
}

// Shared by the visible draw and the (invisible) hit-test draw below, so
// the clickable/draggable area can never drift out of sync with what's
// actually on screen.
function nodeBaseSize(node) {
    return node.count >= 5 ? 15 : node.count >= 3 ? 12 : node.count >= 2 ? 9 : 6
}

// A theme that recurs (count>1) but has never co-occurred with another
// recurring theme has no edges at all. With nothing but charge repulsion
// acting on it, that node just keeps drifting outward from the rest of the
// graph. zoomToFit has to fit every node, so a single far-flung outlier
// forces it to zoom out wide enough to include it — squeezing the actually-
// connected cluster into a small, cramped patch of an otherwise-empty
// canvas. A gentle pull toward the graph's own center (world origin) keeps
// stray nodes from wandering off — but ONLY nodes with no edges at all get
// pulled; applying it to every node (even weakly) fights the link/charge
// equilibrium of already-connected clusters and quietly re-compresses the
// whole graph, which is what caused the "still squished" spacing.
function configureForces(fg, graphData) {
    if (!fg) return

    const connectedIds = new Set()
    graphData.links.forEach(link => {
        connectedIds.add(typeof link.source === 'object' ? link.source.id : link.source)
        connectedIds.add(typeof link.target === 'object' ? link.target.id : link.target)
    })
    const centerStrength = node => connectedIds.has(node.id) ? 0 : 0.06

    fg.d3Force('link').distance(linkDistance)
    fg.d3Force('charge').strength(-400)
    fg.d3Force('x', forceX(0).strength(centerStrength))
    fg.d3Force('y', forceY(0).strength(centerStrength))
}

export default function Map({ onNodeSelect }) {
    const [graphData, setGraphData] = useState(graphCache ?? { nodes: [], links: [] })
    const [loading, setLoading] = useState(graphCache === null)
    const [loadError, setLoadError] = useState(false)
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
    const [ripples, setRipples] = useState([])
    const [, setTick] = useState(0)
    const fgRef = useRef()
    const containerRef = useRef()
    const animationFrameRef = useRef()
    // next/font gives Cormorant Garamond a generated, hashed font-family
    // name at build time — canvas text can't resolve the --font-cormorant
    // CSS variable the way DOM elements can, so it's read once from the
    // computed style and reused directly in ctx.font.
    const serifFontRef = useRef('serif')

    // A plain useEffect fires AFTER commit, and after the child's own
    // mount effects (React runs child effects before parent effects) — so
    // by the time a useEffect here could apply our custom link/charge/x/y
    // forces, the graph's internal simulation may already be ticking with
    // the library's generic defaults (its charge is -30 vs our -400).
    // Swapping parameters mid-simulation like that is a visible jump. A
    // callback ref fires synchronously during commit, before any effects
    // at all, so the correct forces are in place before the first tick.
    const setForceGraphRef = useCallback((node) => {
        fgRef.current = node
        if (node) configureForces(node, graphData)
    }, [graphData])

    useEffect(() => {
        const resolved = getComputedStyle(document.documentElement).getPropertyValue('--font-cormorant').trim()
        if (resolved) serifFontRef.current = resolved
    }, [])

    // Animation loop for ripples — only runs while a ripple is actually
    // active. react-force-graph draws its own canvas frames internally; this
    // loop exists purely to keep re-triggering the ripple's own draw code
    // while it animates, so it has no reason to run when nothing is rippling.
    useEffect(() => {
        if (ripples.length === 0) return

        const animate = () => {
            setTick(t => t + 1)
            animationFrameRef.current = requestAnimationFrame(animate)
        }
        animate()

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }
    }, [ripples.length])

    // Clean up old ripples — also gated on there being any to clean up
    useEffect(() => {
        if (ripples.length === 0) return
        const cleanup = setInterval(() => {
            setRipples(prev => prev.filter(r => Date.now() - r.startTime < 1500))
        }, 100)
        return () => clearInterval(cleanup)
    }, [ripples.length])

    const handleNodeClick = (node) => {
        if (node.count > 1) {
            // Add ripple effect
            setRipples(prev => [...prev, { nodeId: node.id, startTime: Date.now() }])
            onNodeSelect(node.id)
        }
    }

    // Manual zoom controls — there's no automatic camera movement anymore
    // (it used to jump around unpredictably), so these are the only way to
    // get back to a sane view besides scrolling blindly.
    const handleZoomIn = () => fgRef.current && fgRef.current.zoom(fgRef.current.zoom() * 1.4, 200)
    const handleZoomOut = () => fgRef.current && fgRef.current.zoom(fgRef.current.zoom() / 1.4, 200)
    const handleResetView = () => fgRef.current && fgRef.current.zoomToFit(400, 100)

    // Measure the container, and keep measuring across resizes (a plain
    // mount-only read can also land on a 0-width container if this effect
    // runs before layout settles, leaving the graph stuck invisible).
    useEffect(() => {
        if (!containerRef.current) return
        const el = containerRef.current

        const measure = () => setDimensions({ width: el.offsetWidth, height: el.offsetHeight })
        measure()

        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        let cancelled = false

        fetch('/api/graph-data')
            .then(res => res.json())
            .then(data => {
                if (cancelled) return
                graphCache = data
                setGraphData(data)
                setLoadError(false)
                // Set forces immediately after data loads
                if (fgRef.current) {
                    configureForces(fgRef.current, data)
                    fgRef.current.d3ReheatSimulation()
                }
            })
            .catch(err => {
                console.error('Failed to load graph data', err)
                if (!cancelled) setLoadError(true)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => { cancelled = true }
    }, [])

    // Backup: Also set forces when fgRef becomes available. Refs don't
    // trigger effect re-runs on their own, so this really only fires
    // reliably off the graphData dependency — kept as a second, redundant
    // path in case fgRef.current wasn't attached yet inside the fetch
    // effect's own callback above.
    useEffect(() => {
        if (fgRef.current && graphData.nodes.length > 0) {
            configureForces(fgRef.current, graphData)
            fgRef.current.d3ReheatSimulation()
        }
    }, [fgRef.current, graphData])

    const hasGraph = !loading && !loadError && graphData.nodes.length > 0

    return (
        <div ref={containerRef} className="relative h-full flex justify-center items-center bg-gradient-to-br from-stone-100/50 via-slate-50/40 to-neutral-100/50">
            {/* faint workspace texture, sits behind the graph */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: 'radial-gradient(circle, rgba(120,113,108,0.12) 1px, transparent 1px)',
                    backgroundSize: '22px 22px',
                }}
            />

            {loading ? (
                <div className="text-center text-neutral-400 select-none">
                    <p className="text-sm font-[family-name:var(--font-cormorant)] italic text-lg">Loading your map...</p>
                </div>
            ) : loadError ? (
                <div className="text-center text-neutral-400 max-w-md px-8">
                    <p className="text-base leading-relaxed mb-3">Couldn't load your map.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="text-sm px-4 py-1.5 rounded-full border border-stone-300 text-neutral-600 hover:bg-stone-100 transition"
                    >
                        Try again
                    </button>
                </div>
            ) : graphData.nodes.length === 0 ? (
                <div className="relative text-center text-neutral-500 max-w-md px-8 select-none">
                    <svg width="180" height="100" viewBox="0 0 180 100" fill="none" className="mx-auto mb-4 opacity-50">
                        <line x1="40" y1="30" x2="90" y2="55" stroke="#a8a29e" strokeWidth="1" />
                        <line x1="90" y1="55" x2="140" y2="35" stroke="#a8a29e" strokeWidth="1" />
                        <line x1="90" y1="55" x2="70" y2="85" stroke="#a8a29e" strokeWidth="1" />
                        <circle cx="40" cy="30" r="5" fill="#a8a29e" />
                        <circle cx="90" cy="55" r="7" fill="#78716c" />
                        <circle cx="140" cy="35" r="4" fill="#a8a29e" />
                        <circle cx="70" cy="85" r="4" fill="#a8a29e" />
                    </svg>
                    <h2 className="text-2xl font-semibold mb-3 text-neutral-700 font-[family-name:var(--font-cormorant)]">Nothing here yet</h2>
                    <p className="text-base leading-relaxed">
                        Keep writing to see the patterns in your thoughts come alive.
                        Your themes will start showing up here once they appear more than once.
                    </p>
                </div>
            ) : (
                <ForceGraph2D
                    ref={setForceGraphRef}
                    graphData={graphData}
                    width={dimensions.width}
                    height={dimensions.height}
                    nodeLabel="label"
                    // d3AlphaMin and a forced onNodeDragEnd reheat used to
                    // live here, but both only existed to guarantee good
                    // timing for zoomToFit — which is gone now. Without
                    // them: the library's OWN built-in drag-end handling
                    // (a gentle resetCountdown, using whatever alpha is
                    // already there) takes over, so an accidental micro-
                    // drag from an imprecise click (the library only needs
                    // 5px of movement to count it as a drag) causes a small
                    // local readjustment instead of a full alpha=1 re-
                    // ignition of the entire graph's physics.
                    cooldownTicks={300}
                    minZoom={0.4}
                    maxZoom={6}
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        // Skip if node position is not yet initialized. Uses
                        // == null (not a truthiness check) on purpose — a
                        // node that has legitimately settled at exactly
                        // x:0 or y:0 is a real, valid position, not an
                        // uninitialized one. A lone isolated node gets
                        // pulled straight to the origin by the centering
                        // forces, so with `!node.x` this was silently
                        // never drawn at all whenever there was only one node.
                        if (node.x == null || node.y == null || !isFinite(node.x) || !isFinite(node.y)) return

                        // Warm neutral stone tones instead of a color hue —
                        // deeper/darker for themes you return to often,
                        // lighter for ones just starting to recur. Matches
                        // the app's neutral foundation rather than leaning
                        // on the rose accent, which not everyone wants as
                        // the dominant color of their whole map.
                        const getNodeColor = (count) => {
                            if (count >= 5) return '#44403c' // stone-700 — long-standing theme
                            if (count >= 3) return '#78716c' // stone-500 — established theme
                            return '#a8a29e' // stone-400 — just starting to recur
                        }

                        // Every size/offset below is divided by globalScale,
                        // the same trick the font size already used — it
                        // keeps things a constant size ON SCREEN regardless
                        // of how far in/out the camera is zoomed, instead of
                        // a fixed world-space size that balloons whenever
                        // zoomToFit has to zoom in tight on a small graph.
                        const size = nodeBaseSize(node) / globalScale

                        // Draw ripples for this node
                        ripples.forEach(ripple => {
                            if (ripple.nodeId === node.id) {
                                const elapsed = Date.now() - ripple.startTime
                                const progress = elapsed / 1500
                                if (progress < 1) {
                                    const maxRadius = 35 / globalScale
                                    const radius = size + (maxRadius * progress)
                                    const opacity = 1 - progress

                                    ctx.beginPath()
                                    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
                                    ctx.strokeStyle = `${getNodeColor(node.count)}${Math.floor(opacity * 128).toString(16).padStart(2, '0')}`
                                    ctx.lineWidth = 2.5 / globalScale
                                    ctx.stroke()

                                    // Second ripple for depth
                                    if (progress > 0.15) {
                                        const radius2 = size + (maxRadius * (progress - 0.15) * 1.2)
                                        const opacity2 = 1 - (progress - 0.15) * 1.2
                                        ctx.beginPath()
                                        ctx.arc(node.x, node.y, radius2, 0, 2 * Math.PI)
                                        ctx.strokeStyle = `${getNodeColor(node.count)}${Math.floor(opacity2 * 100).toString(16).padStart(2, '0')}`
                                        ctx.lineWidth = 1.5 / globalScale
                                        ctx.stroke()
                                    }
                                }
                            }
                        })

                        // Draw subtle glow for larger nodes
                        if (node.count >= 3) {
                            const glowMargin = 3 / globalScale
                            ctx.beginPath()
                            ctx.arc(node.x, node.y, size + glowMargin, 0, 2 * Math.PI)
                            const gradient = ctx.createRadialGradient(node.x, node.y, size, node.x, node.y, size + glowMargin)
                            gradient.addColorStop(0, getNodeColor(node.count) + '40')
                            gradient.addColorStop(1, getNodeColor(node.count) + '00')
                            ctx.fillStyle = gradient
                            ctx.fill()
                        }

                        // Draw a soft shadow for a touch of depth instead of
                        // a flat, pasted-on-looking circle
                        ctx.save()
                        ctx.shadowColor = getNodeColor(node.count) + '55'
                        ctx.shadowBlur = 6 / globalScale
                        ctx.shadowOffsetY = 1 / globalScale

                        // Draw the main node circle
                        ctx.beginPath()
                        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
                        ctx.fillStyle = getNodeColor(node.count)
                        ctx.fill()
                        ctx.restore()

                        // A soft ring gives it a little more polish than a
                        // completely flat fill
                        ctx.beginPath()
                        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
                        ctx.lineWidth = 1 / globalScale
                        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
                        ctx.stroke()

                        // Draw label only for count > 1 — italic serif to
                        // match the journal's Cormorant headings instead of
                        // a generic sans-serif tag
                        if (node.count > 1) {
                            const label = node.label
                            // Text (unlike the circles above) genuinely
                            // degrades when the declared size gets tiny —
                            // browsers hint/distort glyphs to stay legible
                            // at a couple of pixels, and scaling that back
                            // up magnifies the distortion into a visible
                            // "squish." Capping how far globalScale can
                            // shrink the declared size means labels stop
                            // holding a hard-constant on-screen size once
                            // you're zoomed in a lot and instead grow —
                            // worse for pixel-perfect constancy, much
                            // better for actually staying legible.
                            const fontSize = 13 / Math.min(globalScale, 3)
                            ctx.font = `italic 500 ${fontSize}px ${serifFontRef.current}`
                            ctx.textAlign = 'center'
                            ctx.textBaseline = 'middle'
                            ctx.fillStyle = '#57534e' // stone-600, matches the rest of the app's text
                            ctx.fillText(label, node.x, node.y + size + (11 / Math.min(globalScale, 3)))
                        }
                    }}
                    // react-force-graph does click/drag/hover detection with
                    // a second, invisible canvas: it paints each node in a
                    // unique per-node color, then reads back the pixel color
                    // under the pointer to know what you're touching. That
                    // canvas is normally painted by nodeCanvasObject too
                    // (mode defaults to 'replace') — which means it was
                    // getting OUR aesthetic color (one of 3 shared shades),
                    // not each node's unique one, so many nodes were
                    // indistinguishable to the hit-test and clicks/drags
                    // could resolve to the wrong node entirely. This paints
                    // the hit-test canvas separately, with the real unique
                    // color the library passes in, and a slightly larger
                    // radius than the visual dot for a more forgiving target.
                    nodePointerAreaPaint={(node, color, ctx, globalScale) => {
                        // Same fix as the visible draw above — a node sitting
                        // exactly at x:0/y:0 is a real position, not an
                        // uninitialized one; `!node.x` was treating it as
                        // the latter and skipping the hit-test circle
                        // entirely, so the (now-visible) node had nothing
                        // clickable underneath it.
                        if (node.x == null || node.y == null || !isFinite(node.x) || !isFinite(node.y)) return
                        const hitRadius = (nodeBaseSize(node) + 4) / globalScale
                        ctx.beginPath()
                        ctx.arc(node.x, node.y, hitRadius, 0, 2 * Math.PI)
                        ctx.fillStyle = color
                        ctx.fill()
                    }}
                    linkColor={() => '#d6d3d1'} // stone-300 — warm instead of cool gray
                    linkWidth={link => Math.min(link.weight * 0.5, 3)}
                    backgroundColor="rgba(0,0,0,0)" // transparent — lets the page's own warm gradient show through
                    nodeVal={node => node.count > 2 ? 8 : node.count > 1 ? 4 : 2}
                    onNodeClick={handleNodeClick}
                />
            )}

            {hasGraph && (
                <>
                    {/* stats badge */}
                    <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-stone-200 shadow-sm text-xs text-neutral-500">
                        {graphData.nodes.length} {graphData.nodes.length === 1 ? 'theme' : 'themes'} · {graphData.links.length} {graphData.links.length === 1 ? 'connection' : 'connections'}
                    </div>

                    {/* legend */}
                    <div className="absolute bottom-4 left-4 px-3 py-2.5 rounded-xl bg-white/80 backdrop-blur-sm border border-stone-200 shadow-sm text-xs text-neutral-500 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#a8a29e' }} />
                            Just starting to recur
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: '#78716c' }} />
                            Established
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: '#44403c' }} />
                            Long-standing
                        </div>
                    </div>

                    {/* manual zoom controls — no automatic camera movement anymore */}
                    <div className="absolute bottom-4 right-4 flex flex-col rounded-xl bg-white/80 backdrop-blur-sm border border-stone-200 shadow-sm overflow-hidden">
                        <button
                            onClick={handleZoomIn}
                            aria-label="Zoom in"
                            className="p-2 text-neutral-500 hover:bg-stone-100 hover:text-neutral-700 transition"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleZoomOut}
                            aria-label="Zoom out"
                            className="p-2 text-neutral-500 hover:bg-stone-100 hover:text-neutral-700 transition border-t border-stone-200"
                        >
                            <Minus className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleResetView}
                            aria-label="Fit view to graph"
                            className="p-2 text-neutral-500 hover:bg-stone-100 hover:text-neutral-700 transition border-t border-stone-200"
                        >
                            <Maximize2 className="w-4 h-4" />
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}
