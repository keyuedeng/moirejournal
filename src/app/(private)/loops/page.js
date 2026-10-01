"use client"
import { useRouter } from "next/navigation"
import OpenLoopsList from "@/components/intentions/OpenLoopsList"

export default function LoopsPage() {
    const router = useRouter()

    return (
        <div className="p-6 md:p-8 bg-page min-h-screen">
            {/* same width and padding as the journal page */}
            <div className="max-w-7xl mx-auto">
                <h1 className="font-display text-[34px] leading-tight font-medium text-ink">Open loops</h1>
                {/* "Write about it" starts a journal entry titled with the loop */}
                <OpenLoopsList onWriteAbout={text => router.push(`/journal?theme=${encodeURIComponent(text)}`)} />
            </div>
        </div>
    )
}
