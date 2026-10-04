"use client"
import dynamic from "next/dynamic"

// rendered only in the browser: which week it is depends on the user's own
// clock and timezone, which the server doesn't know
const WeeklyReview = dynamic(() => import("@/components/review/WeeklyReview"), { ssr: false })

export default function ReviewPage() {
    return (
        <div className="p-6 md:p-8 bg-page min-h-screen">
            {/* same width and padding as the journal and open loops pages */}
            <div className="max-w-7xl mx-auto">
                <WeeklyReview />
            </div>
        </div>
    )
}
