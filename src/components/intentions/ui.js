"use client"
import { Check } from "lucide-react"

// small pieces shared by the open loops card, panel, page and pattern nudges

// the extractor's guess (e.g. "this week" for "before I leave") gets a
// stronger outline so the likely answer is one obvious tap
export function ChoiceButton({ highlighted = false, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className={`text-sm px-3.5 py-1.5 rounded-full border transition text-left ${
                highlighted
                    ? "border-brand/30 bg-brand-soft text-brand-deep hover:bg-brand/20"
                    : "border-line text-soft hover:bg-hush"
            }`}
        >
            {children}
        </button>
    )
}

export function ResolvedLine({ message }) {
    return (
        <p className="flex items-center gap-2 text-sm text-soft animate-in fade-in">
            <Check className="w-4 h-4 text-brand" />
            {message}
        </p>
    )
}
