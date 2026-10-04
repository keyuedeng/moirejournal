"use client"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { formatWeek, isReviewDay, reviewWeekStart } from "@/lib/review/week"

const DAY_MS = 24 * 60 * 60 * 1000

/*
On Sundays and Mondays, a quiet "your week is ready" card in the journal's
right column — until that week's look back has been opened.
lastReviewOpenedAt comes with the open loops data (null = never opened).
*/
export default function ReviewReadyCard({ lastReviewOpenedAt, className = "" }) {
    const now = new Date()
    if (!isReviewDay(now)) return null

    const weekStart = reviewWeekStart(now)
    // Sunday of the week being looked back on: opened since then = already seen
    const reviewOpensAt = new Date(weekStart.getTime() + 6 * DAY_MS)
    if (lastReviewOpenedAt && new Date(lastReviewOpenedAt) >= reviewOpensAt) return null

    return (
        <Link
            href="/review"
            className={`group block border border-brand/20 rounded-2xl p-5 bg-brand-soft/50 hover:bg-brand-soft transition ${className}`}
        >
            <p className="text-xs text-brand">{formatWeek(weekStart)}</p>
            <p className="font-display text-xl font-medium text-ink mt-0.5">Your week is ready</p>
            <p className="flex items-center gap-1 text-sm text-soft mt-1">
                A gentle look back <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </p>
        </Link>
    )
}
