"use client"
import Map from "@/components/Map"
import NodePanel from "@/components/NodePanel"
import { useState } from "react"

export default function MapPage() {
    const [selectedNodeId, setSelectedNodeId] = useState(null)

    return (
        <div className="flex h-screen overflow-hidden relative">
            <div className="flex-grow">
                <Map onNodeSelect={setSelectedNodeId}/>
            </div>

            {/* Desktop: persistent side panel */}
            <div className="hidden md:block w-100 py-4 px-3">
                <NodePanel nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
            </div>

            {/* Mobile: the panel would crush the graph to nothing at a fixed
                400px, so instead it only appears as a bottom sheet once a
                theme is actually selected, leaving the map full-width the
                rest of the time. */}
            {selectedNodeId && (
                <>
                    <div
                        className="md:hidden fixed inset-0 bg-black/30 z-40"
                        onClick={() => setSelectedNodeId(null)}
                        aria-hidden="true"
                    />
                    <div className="md:hidden fixed inset-x-0 bottom-0 z-50 h-[70vh] p-3 animate-in slide-in-from-bottom-4 fade-in duration-200">
                        <NodePanel nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
                    </div>
                </>
            )}
        </div>
    )
}
