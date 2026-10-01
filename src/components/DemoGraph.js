"use client"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import dynamic from "next/dynamic"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
    ssr: false
})

export default function DemoGraph() {
    const [dimensions, setDimensions] = useState({ width: 600, height: 600 })
    const [hoveredNode, setHoveredNode] = useState(null)
    const [ripples, setRipples] = useState([])
    const [, setTick] = useState(0)
    const [opacity, setOpacity] = useState(0)
    const fgRef = useRef()
    const containerRef = useRef()
    const animationFrameRef = useRef()
    const floatOffsets = useRef(new Map())

    // Static mock data - memoized to prevent re-creation
    const mockData = useMemo(() => ({
        nodes: [
            // Core values (center, largest - most important) - removed fx/fy to allow movement
            { id: 1, label: "authenticity", count: 12, color: "#A6939E" },
            { id: 2, label: "growth", count: 10, color: "#A6939E" },
            
            // Personal development branch (strong theme)
            { id: 3, label: "learning", count: 7, color: "#A6939E" },
            { id: 4, label: "journaling", count: 8, color: "#A6939E" },
            { id: 5, label: "meditation", count: 5, color: "#A6939E" },
            { id: 6, label: "self-awareness", count: 6, color: "#A6939E" },
            
            // Relationships branch (very important)
            { id: 7, label: "connection", count: 9, color: "#A6939E" },
            { id: 8, label: "friendship", count: 6, color: "#A6939E" },
            { id: 9, label: "vulnerability", count: 7, color: "#A6939E" },
            { id: 10, label: "mom", count: 8, color: "#A6939E" },
            { id: 21, label: "sister", count: 5, color: "#A6939E" },
            
            // Creative interests branch (moderate-strong)
            { id: 11, label: "creativity", count: 8, color: "#A6939E" },
            { id: 12, label: "photography", count: 6, color: "#A6939E" },
            { id: 13, label: "writing", count: 7, color: "#A6939E" },
            { id: 14, label: "art", count: 4, color: "#A6939E" },
            
            // Career/purpose branch (emerging theme)
            { id: 15, label: "purpose", count: 6, color: "#A6939E" },
            { id: 16, label: "impact", count: 5, color: "#A6939E" },
            { id: 17, label: "career-change", count: 4, color: "#A6939E" },
            { id: 22, label: "teaching", count: 3, color: "#A6939E" },
            
            // Wellness branch (consistent practice)
            { id: 18, label: "balance", count: 7, color: "#A6939E" },
            { id: 19, label: "yoga", count: 6, color: "#A6939E" },
            { id: 20, label: "nature", count: 5, color: "#A6939E" },
            { id: 23, label: "hiking", count: 4, color: "#A6939E" },
        ],
        links: [
            // Core connections (strongest - shortest distance)
            { source: 1, target: 2, weight: 5 },
            
            // Personal development branch from growth (strong connections)
            { source: 2, target: 3, weight: 4 },
            { source: 2, target: 4, weight: 5 },
            { source: 3, target: 6, weight: 3 },
            { source: 4, target: 5, weight: 4 },
            { source: 6, target: 4, weight: 2 },
            
            // Relationships branch from authenticity (very strong)
            { source: 1, target: 7, weight: 5 },
            { source: 7, target: 9, weight: 4 },
            { source: 7, target: 8, weight: 3 },
            { source: 1, target: 10, weight: 5 },
            { source: 10, target: 21, weight: 4 },
            { source: 9, target: 8, weight: 2 },
            
            // Creative branch from authenticity (strong)
            { source: 1, target: 11, weight: 4 },
            { source: 11, target: 12, weight: 3 },
            { source: 11, target: 13, weight: 4 },
            { source: 11, target: 14, weight: 2 },
            { source: 13, target: 4, weight: 2 },
            
            // Career/purpose branch from growth (moderate)
            { source: 2, target: 15, weight: 3 },
            { source: 15, target: 16, weight: 3 },
            { source: 15, target: 17, weight: 2 },
            { source: 16, target: 22, weight: 2 },
            
            // Wellness branch (strong practice)
            { source: 1, target: 18, weight: 4 },
            { source: 18, target: 19, weight: 4 },
            { source: 18, target: 20, weight: 3 },
            { source: 20, target: 23, weight: 3 },
            { source: 5, target: 19, weight: 3 },
        ]
    }), [])

    const handleNodeHover = useCallback((node) => {
        setHoveredNode(node)
    }, [])

    const handleNodeClick = useCallback((node) => {
        const rippleId = Date.now()
        setRipples(prev => [...prev, { id: rippleId, nodeId: node.id, startTime: rippleId }])
        
        // Remove ripple after animation completes
        setTimeout(() => {
            setRipples(prev => prev.filter(r => r.id !== rippleId))
        }, 1500)
    }, [])

    // Animation loop to continuously update ripples and floating
    useEffect(() => {
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
    }, [])

    useEffect(() => {
        if (containerRef.current) {
            setDimensions({ 
                width: containerRef.current.offsetWidth, 
                height: containerRef.current.offsetHeight 
            })
        }
        
        // Fade in animation
        setTimeout(() => setOpacity(1), 100)
    }, [])

    useEffect(() => {
        if (fgRef.current) {
            fgRef.current.d3Force('link').distance(link => {
                // Stronger connections = shorter distance, but overall much larger
                if (link.weight >= 5) return 120
                if (link.weight === 4) return 180
                if (link.weight === 3) return 240
                if (link.weight === 2) return 300
                return 360
            }).strength(0.2)
            fgRef.current.d3Force('charge').strength(-600)
        }
    }, [])

    return (
        <div ref={containerRef} className="h-full w-full flex justify-center items-center" style={{ opacity, transition: 'opacity 1.2s ease-out' }}>
            <ForceGraph2D
                ref={fgRef}
                graphData={mockData}
                width={dimensions.width}
                height={dimensions.height}
                nodeLabel=""
                nodeCanvasObject={(node, ctx, globalScale) => {
                    // Simplified size - only 3 sizes
                    let size
                    if (node.count >= 9) size = 12  // Large (core values)
                    else if (node.count >= 6) size = 8  // Medium (important themes)
                    else size = 5  // Small (everything else)
                    
                    // Initialize float offset for this node if not exists
                    if (!floatOffsets.current.has(node.id)) {
                        floatOffsets.current.set(node.id, {
                            offsetX: Math.random() * Math.PI * 2, // Random starting phase X
                            offsetY: Math.random() * Math.PI * 2, // Random starting phase Y
                            speedX: 0.0003 + Math.random() * 0.0005, // Slower X speed
                            speedY: 0.0004 + Math.random() * 0.0006, // Slower Y speed
                            amplitudeX: 0.5 + Math.random() * 0.8, // More subtle horizontal movement
                            amplitudeY: 0.6 + Math.random() * 1 // More subtle vertical movement
                        })
                    }
                    
                    const float = floatOffsets.current.get(node.id)
                    const time = Date.now()
                    const floatX = Math.sin(time * float.speedX + float.offsetX) * float.amplitudeX
                    const floatY = Math.sin(time * float.speedY + float.offsetY) * float.amplitudeY
                    
                    // Draw ripples for this node
                    ripples.forEach(ripple => {
                        if (ripple.nodeId === node.id) {
                            const elapsed = Date.now() - ripple.startTime
                            const progress = elapsed / 1500
                            if (progress < 1) {
                                const maxRadius = 40
                                const radius = size + (maxRadius * progress)
                                const opacity = 1 - progress
                                
                                ctx.beginPath()
                                ctx.arc(node.x + floatX, node.y + floatY, radius, 0, 2 * Math.PI)
                                ctx.strokeStyle = `rgba(166, 147, 158, ${opacity * 0.5})`
                                ctx.lineWidth = 3
                                ctx.stroke()
                                
                                // Second ripple for depth
                                if (progress > 0.15) {
                                    const radius2 = size + (maxRadius * (progress - 0.15) * 1.2)
                                    const opacity2 = 1 - (progress - 0.15) * 1.2
                                    ctx.beginPath()
                                    ctx.arc(node.x + floatX, node.y + floatY, radius2, 0, 2 * Math.PI)
                                    ctx.strokeStyle = `rgba(166, 147, 158, ${opacity2 * 0.4})`
                                    ctx.lineWidth = 2
                                    ctx.stroke()
                                }
                            }
                        }
                    })
                    
                    ctx.beginPath()
                    ctx.arc(node.x + floatX, node.y + floatY, size, 0, 2 * Math.PI)
                    ctx.fillStyle = node.color || '#A6939E'
                    ctx.fill()
                    
                    // Show label only for important nodes (count >= 7) or on hover
                    const showLabel = node.count >= 7 || hoveredNode?.id === node.id
                    
                    if (showLabel) {
                        const label = node.label
                        const fontSize = 13/globalScale
                        ctx.font = `${fontSize}px Sans-Serif`
                        ctx.textAlign = 'center'
                        ctx.textBaseline = 'middle'
                        ctx.fillStyle = '#5F5A57'
                        ctx.fillText(label, node.x + floatX, node.y + floatY + size + 8)
                    }
                }}
                nodeVal={node => {
                    if (node.count >= 9) return 12
                    if (node.count >= 6) return 8
                    return 5
                }}
                onNodeHover={handleNodeHover}
                onNodeClick={handleNodeClick}
                enableNodeDrag={true}
                enableZoomInteraction={false}
                enablePanInteraction={false}
            />
        </div>
    )
}
