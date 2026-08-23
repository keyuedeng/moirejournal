"use client"
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react"
import TextareaAutosize from "react-textarea-autosize"
import { ArrowUpRight, Trash2 } from "lucide-react"
import { useUser } from '@clerk/nextjs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Module-scoped so it survives client-side navigation away from and back to
// this page (Next unmounts the page component on route change, which would
// otherwise reset state to [] and force a full reload + loading flash every
// time). It resets on a hard page reload, which is fine.
let entriesCache = null

// Recurring-themes widget has its own tiny cache — it's decorative, not
// critical data, so it fails quietly rather than showing an error state.
let themesCache = null

function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Consecutive days (working backward from today, or yesterday if you
// haven't written yet today) with at least one entry.
function computeStreak(entries) {
    const days = new Set(entries.map(e => dateKey(new Date(e.createdAt))))
    let streak = 0
    const cursor = new Date()
    cursor.setHours(0, 0, 0, 0)
    if (!days.has(dateKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1)
    }
    while (days.has(dateKey(cursor))) {
        streak++
        cursor.setDate(cursor.getDate() - 1)
    }
    return streak
}

// Last 12 weeks, grouped for a GitHub-style activity strip.
function buildActivityWeeks(entries) {
    const counts = new Map()
    entries.forEach(e => {
        const key = dateKey(new Date(e.createdAt))
        counts.set(key, (counts.get(key) || 0) + 1)
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = []
    for (let i = 83; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const key = dateKey(d)
        days.push({ key, count: counts.get(key) || 0 })
    }

    const weeks = []
    for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7))
    }
    return weeks
}

function activityColor(count) {
    if (count === 0) return "bg-stone-200/70"
    if (count === 1) return "bg-[#b88998]/35"
    if (count === 2) return "bg-[#b88998]/65"
    return "bg-[#b88998]"
}

export default function JournalPage() {
    const { user } = useUser()
    const today = new Date()
    const options = {
        weekday: "long",
        year: "numeric",
        month:"long",
        day: "numeric"
    }
    const formatted = today.toLocaleDateString("en-US", options)
    const [entries, setEntries] = useState(entriesCache ?? [])
    const [loading, setLoading] = useState(entriesCache === null)
    const [entriesError, setEntriesError] = useState(false)
    const [placeholder, setPlaceholder] = useState("")
    const [showCursor, setShowCursor] = useState(true)
    const fullPlaceholder = "What's been on your mind?"

    //fetch entries — pass silent:true to revalidate quietly without
    //flashing a loading/error state over data we're already showing
    const loadEntries = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setEntriesError(false)
        try {
            const res = await fetch("/api/entries") // could specify GET but automatically uses GET
            const data = await res.json() //parse jason data into js array
            if (res.ok && Array.isArray(data)) {
                entriesCache = data
                setEntries(data) //changes entries state to all the entries
            } else {
                console.error('Failed to load entries', data)
                if (!silent) {
                    setEntries([])
                    setEntriesError(true)
                }
            }
        } catch (err) {
            console.error('Error loading entries', err)
            if (!silent) {
                setEntries([])
                setEntriesError(true)
            }
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        // already have cached entries from a previous visit this session —
        // show them instantly and just quietly check for anything new
        loadEntries({ silent: entriesCache !== null })
    }, [loadEntries])

    // while any entry is still PENDING (AI pipeline running in the
    // background on the server), poll quietly so the "processing" badge
    // clears on its own once it's actually done — no reload required
    useEffect(() => {
        const hasPending = entries.some(entry => entry.status === "PENDING")
        if (!hasPending) return
        const pollInterval = setInterval(() => {
            loadEntries({ silent: true })
        }, 4000)
        return () => clearInterval(pollInterval)
    }, [entries, loadEntries])

    //typing animation for placeholder
    useEffect(() => {
        let index = 0
        const typingInterval = setInterval(() => {
            if (index <= fullPlaceholder.length) {
                setPlaceholder(fullPlaceholder.slice(0, index))
                index++
            } else {
                clearInterval(typingInterval)
            }
        }, 60) // 50ms per character

        return () => clearInterval(typingInterval)
    }, [])

    //blinking cursor effect
    useEffect(() => {
        const cursorInterval = setInterval(() => {
            setShowCursor(prev => !prev)
        }, 530)

        return () => clearInterval(cursorInterval)
    }, [])
    //handle new entry submission
    const [title, setTitle] = useState("")
    const [body, setBody] = useState("")
    const [saveStatus, setSaveStatus] = useState("") // "", "saving", "success", "error"

    // Restore an in-progress draft — the page component unmounts on every
    // route change (only the layout persists), so plain useState alone
    // loses whatever you were mid-writing the moment you navigate to Map
    // and back. useLayoutEffect (not useEffect) applies it before the
    // browser paints, so there's no visible flash of an empty box first —
    // Clerk's user is already cached from the initial app load by the time
    // you're navigating within the app, so it's available synchronously here.
    useLayoutEffect(() => {
        if (!user?.id) return
        try {
            const stored = localStorage.getItem(`journal-draft:${user.id}`)
            if (!stored) return
            const draft = JSON.parse(stored)
            if (draft.title) setTitle(draft.title)
            if (draft.body) setBody(draft.body)
        } catch (err) {
            console.error('Failed to load draft', err)
        }
    }, [user?.id])

    // Save the draft as you type (debounced so it's not writing to
    // localStorage on every keystroke), and clear it once there's nothing
    // to save — including right after a successful submit, since that
    // clears title/body too.
    useEffect(() => {
        if (!user?.id) return
        const timeout = setTimeout(() => {
            try {
                if (title || body) {
                    localStorage.setItem(`journal-draft:${user.id}`, JSON.stringify({ title, body }))
                } else {
                    localStorage.removeItem(`journal-draft:${user.id}`)
                }
            } catch (err) {
                console.error('Failed to save draft', err)
            }
        }, 300)
        return () => clearTimeout(timeout)
    }, [title, body, user?.id])

    async function handleSubmit(e) {
        e.preventDefault() //stops page refresh

        //clear input immediately for better UX
        const titleToSave = title
        const bodyToSave = body
        setTitle("")
        setBody("")
        setSaveStatus("saving")

        // show the entry right away so the list never feels like it
        // swallowed what you just wrote, while the real save is in flight
        const tempId = `temp-${Date.now()}`
        setEntries(prev => [
            { id: tempId, title: titleToSave, body: bodyToSave, createdAt: new Date().toISOString(), saving: true },
            ...prev,
        ])

        try {
            const postRes = await fetch("/api/entries", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: titleToSave,
                    body: bodyToSave,
                }),
            })

            if (!postRes.ok) {
                console.error('Failed to save entry', await postRes.text())
                setEntries(prev => prev.filter(entry => entry.id !== tempId))
                setSaveStatus("error")
                setTimeout(() => setSaveStatus(""), 3000)
                return
            }

            // the entry is saved and already returned to us — swap the temp
            // placeholder for the real one directly instead of a whole
            // extra fetch. (Its AI-derived themes keep processing quietly
            // in the background on the server.)
            const { entry: savedEntry } = await postRes.json()
            setEntries(prev => {
                const next = prev.map(entry => entry.id === tempId ? savedEntry : entry)
                entriesCache = next
                return next
            })

            setSaveStatus("success")
            setTimeout(() => setSaveStatus(""), 3000)

        } catch (err) {
            console.error('Error saving entry', err)
            setEntries(prev => prev.filter(entry => entry.id !== tempId))
            setSaveStatus("error")
            setTimeout(() => setSaveStatus(""), 3000)
        }
    }

    async function handleDeleteEntry(id) {
        setEntries(prev => {
            const next = prev.filter(entry => entry.id !== id)
            entriesCache = next
            return next
        })
    }

    //handle input
    const bodyInputRef = useRef(null)
    const titleInputRef = useRef(null)

    const hour = today.getHours();
    let greeting;
    if (hour >= 0 && hour <= 11) {
        greeting = "Good morning, "
    } else if (hour > 11 && hour < 17) {
        greeting = "Good afternoon, "
    } else {
        greeting = "Good evening, "
    }

    const realEntries = useMemo(() => entries.filter(e => !e.saving), [entries])
    const streak = useMemo(() => computeStreak(realEntries), [realEntries])
    const earliestDate = useMemo(() => {
        if (realEntries.length === 0) return null
        return realEntries.reduce(
            (min, e) => new Date(e.createdAt) < min ? new Date(e.createdAt) : min,
            new Date(realEntries[0].createdAt)
        )
    }, [realEntries])

    //render form + list
    return (
        <div className="p-6 md:p-8 bg-gradient-to-br from-stone-100/50 via-slate-50/40 to-neutral-100/50 min-h-screen">
            <div className="max-w-7xl mx-auto xl:flex xl:gap-10 xl:items-start">
            <div className="w-full max-w-3xl mx-auto xl:max-w-4xl xl:mx-0 xl:flex-1 xl:min-w-0">
                <div className="mb-4 flex items-baseline justify-between flex-wrap gap-x-4 gap-y-1">
                    <h1 className="text-2xl font-semibold text-neutral-700 font-[family-name:var(--font-cormorant)]">{greeting}{user?.firstName || user?.emailAddresses[0]?.emailAddress?.split('@')[0]}</h1>
                    {realEntries.length > 0 && (
                        <p className="text-sm text-neutral-400">
                            {realEntries.length} {realEntries.length === 1 ? 'entry' : 'entries'}
                            {streak >= 2 && ` · ${streak}-day streak`}
                            {earliestDate && ` · since ${earliestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </p>
                    )}
                </div>
                <div
                    className="border border-stone-200 rounded-xl p-4 mb-6 shadow-sm bg-white/80"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(120,113,108,0.05) 1px, transparent 1px)',
                        backgroundSize: '16px 16px',
                    }}
                >
                    <h2 className="pb-3 text-neutral-600">Today · {formatted}</h2>
                    <form onSubmit={handleSubmit}>
                        <input
                            type="text"
                            placeholder="New Entry"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault()
                                    bodyInputRef.current?.focus()
                                }
                            }}
                            ref={titleInputRef}
                            className="w-full text-2xl focus:outline-none pb-3 font-semibold text-neutral-700"
                        />
                        <TextareaAutosize
                            minRows={2}
                            maxRows={15}
                            placeholder={placeholder + (showCursor && !body ? '|' : '')}
                            ref={bodyInputRef}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Backspace" && e.target.value === "") {
                                    e.preventDefault()
                                    titleInputRef.current?.focus()
                                }
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
                                    e.preventDefault()
                                    e.currentTarget.form?.requestSubmit()
                                }
                            }}
                            className="w-full focus:outline-none resize-none overflow-y-auto leading-relaxed text-neutral-700 text-lg placeholder:text-neutral-400"
                            style = {{ lineHeight: "1.6" }}
                        />
                        <button
                            type="submit"
                            disabled={!body.trim()}
                            title={!body.trim() ? "Write something first" : "Save entry (⌘+Enter)"}
                            className={`${
                                !body.trim()
                                ? "bg-stone-50 text-stone-300"
                                : "bg-[#b88998]/15 hover:bg-[#b88998]/25 cursor-pointer text-[#8a6270]"
                            } self-end text-sm p-1 px-3 rounded-xl border border-stone-300 transition-colors`}>
                            Save
                        </button>
                    </form>

                    {/* Status popup */}
                    {saveStatus && (
                        <div
                            role="status"
                            aria-live="polite"
                            className="fixed bottom-8 right-8 flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-md border border-stone-200 bg-white/95 backdrop-blur-sm text-sm text-neutral-600 transition-all animate-in fade-in slide-in-from-bottom-2"
                        >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                saveStatus === "saving" ? "bg-neutral-400 animate-pulse" :
                                saveStatus === "success" ? "bg-[#b88998]" :
                                "bg-red-400"
                            }`} />
                            {saveStatus === "saving" && "Saving..."}
                            {saveStatus === "success" && "Entry saved"}
                            {saveStatus === "error" && "Couldn't save that entry"}
                        </div>
                    )}
                </div>

                {/* below xl, the rail collapses into this inline stack instead */}
                <div className="xl:hidden">
                    <ActivityStrip entries={realEntries} />
                    <RecurringThemes />
                </div>

                {!loading && !entriesError && entries.length > 0 && (
                    <h2 className="text-sm font-medium text-neutral-500 mb-2 px-1">Your entries</h2>
                )}
                {loading ? (
                    <div className="text-neutral-400 text-sm px-1">Loading entries...</div>
                ) : entriesError ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-center">
                        <p className="text-neutral-500">Couldn't load your entries.</p>
                        <button
                            onClick={loadEntries}
                            className="text-sm px-4 py-1.5 rounded-full border border-stone-300 text-neutral-600 hover:bg-stone-100 transition"
                        >
                            Try again
                        </button>
                    </div>
                ) : (
                    <div>
                    {entries.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-16 text-center select-none">
                            <p className="text-neutral-500">
                                Your story starts with a single entry.
                            </p>
                        </div>
                    ) : (
                        <ul className="border border-stone-200 rounded-xl bg-white/60 overflow-hidden">
                            {entries.map((entry) => (
                                <JournalEntryItem key={entry.id} entry={entry} onDelete={handleDeleteEntry} />
                            ))}
                        </ul>
                    )}
                </div>
                )}
            </div>

            {/* rail: only on xl+, where there's genuinely spare width to use */}
            <aside className="hidden xl:block w-72 shrink-0 sticky top-8 space-y-6">
                <RailCard title="Your rhythm">
                    <ActivityStrip entries={realEntries} compact />
                </RailCard>
                <RailCard title="Recurring themes">
                    <RecurringThemes compact />
                </RailCard>
            </aside>
            </div>
        </div>
    )
}

function RailCard({ title, children }) {
    return (
        <div className="border border-stone-200 rounded-xl p-4 bg-white/80 backdrop-blur-sm shadow-sm">
            <h3 className="text-xs font-medium text-neutral-500 mb-3 uppercase tracking-wide">{title}</h3>
            {children}
        </div>
    )
}

function ActivityStrip({ entries, compact = false }) {
    const weeks = useMemo(() => buildActivityWeeks(entries), [entries])
    if (entries.length === 0) return null

    return (
        <div className={compact ? "space-y-2" : "mb-6 flex items-center gap-4 px-1"}>
            <div className="flex gap-[3px]">
                {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-[3px]">
                        {week.map((day) => (
                            <div
                                key={day.key}
                                title={`${day.key}${day.count ? ` · ${day.count} ${day.count === 1 ? 'entry' : 'entries'}` : ''}`}
                                className={`w-2.5 h-2.5 rounded-[2px] ${activityColor(day.count)}`}
                            />
                        ))}
                    </div>
                ))}
            </div>
            <span className="text-sm text-neutral-400 shrink-0">
                last 12 weeks
            </span>
        </div>
    )
}

function RecurringThemes({ compact = false }) {
    const [themes, setThemes] = useState(themesCache ?? [])

    useEffect(() => {
        if (themesCache !== null) return
        fetch('/api/graph-data')
            .then(res => res.json())
            .then(data => {
                if (!data?.nodes) return
                const top = [...data.nodes].sort((a, b) => b.count - a.count).slice(0, 5)
                themesCache = top
                setThemes(top)
            })
            .catch(() => {}) // decorative widget — fail quietly, no error UI needed
    }, [])

    if (themes.length === 0) return null

    return (
        <div className={compact ? "flex flex-wrap gap-1.5" : "mb-6 flex items-center gap-2 flex-wrap px-1"}>
            {!compact && <span className="text-xs text-neutral-400 shrink-0">You keep returning to</span>}
            {themes.map(t => (
                <span key={t.id} className="text-xs px-2.5 py-1 bg-[#b88998]/10 rounded-full text-[#8a6270] capitalize">
                    {t.label}
                </span>
            ))}
        </div>
    )
}

function JournalEntryItem({ entry, onDelete }) {
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState(false)

    async function handleDelete() {
        setDeleting(true)
        setDeleteError(false)
        try {
            const res = await fetch(`/api/entries?id=${entry.id}`, { method: "DELETE" })
            if (res.ok) {
                onDelete(entry.id)
            } else {
                console.error('Failed to delete entry', await res.text())
                setDeleting(false)
                setDeleteError(true)
            }
        } catch (err) {
            console.error('Error deleting entry', err)
            setDeleting(false)
            setDeleteError(true)
        }
    }

    return (
        <li>
            <Dialog onOpenChange={(open) => { if (!open) setConfirmingDelete(false) }}>
                <DialogTrigger asChild>
                    <button
                        disabled={entry.saving}
                        className="w-full flex justify-between items-center border-t border-stone-200 first:border-t-0 px-4 py-2.5 hover:bg-stone-100/50 transition disabled:hover:bg-transparent disabled:cursor-default"
                    >
                        <div className="flex items-center gap-2 min-w-0 text-neutral-700">
                            <span className="text-xs text-neutral-400 tabular-nums shrink-0">
                                {new Date(entry.createdAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "2-digit",
                                })}
                            </span>
                            {entry.title === "" ? (
                                <span className="text-neutral-500 truncate">{entry.body.split(' ').slice(0,7).join(' ')}{"..."}</span>
                            ) : (
                                <span className="font-medium text-neutral-800 truncate">{entry.title}</span>
                            )}
                            {entry.saving && (
                                <span className="flex items-center gap-1 text-[11px] text-neutral-400 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
                                    saving
                                </span>
                            )}
                            {!entry.saving && entry.status === "PENDING" && (
                                <span className="flex items-center gap-1 text-[11px] text-[#b88998] shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#b88998] animate-pulse" />
                                    processing
                                </span>
                            )}
                            {!entry.saving && entry.status === "FAILED" && (
                                <span
                                    className="flex items-center gap-1 text-[11px] text-amber-600/80 shrink-0"
                                    title="We couldn't extract themes from this entry, but it's saved."
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500/70" />
                                    couldn't process
                                </span>
                            )}
                        </div>
                        {!entry.saving && <ArrowUpRight className="w-4 h-4 text-neutral-400 shrink-0" />}
                    </button>
                </DialogTrigger>
                <DialogContent className="!max-w-[calc(100%-2rem)] sm:!max-w-2xl !h-[90vh] sm:!h-[85vh] overflow-y-auto flex flex-col">
                    <DialogHeader className="p-6 space-y-4 flex-1">
                        <DialogTitle className="text-3xl font-[family-name:var(--font-cormorant)] font-semibold text-neutral-800">{entry.title}</DialogTitle>
                        <DialogDescription className="text-sm text-neutral-500">
                            {new Date(entry.createdAt).toLocaleString()}
                        </DialogDescription>
                        <div className="whitespace-pre-wrap text-neutral-700 leading-relaxed text-lg pt-2">
                            {entry.body}
                        </div>
                    </DialogHeader>
                    <DialogFooter className="!justify-between items-center px-6 pb-2 pt-4 border-t border-stone-100 sm:!flex-row">
                        {confirmingDelete ? (
                            <div className="flex items-center gap-3 text-sm">
                                <span className="text-neutral-500">
                                    {deleteError ? "Couldn't delete — try again?" : "Delete this entry?"}
                                </span>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
                                >
                                    {deleting ? "Deleting..." : "Yes, delete"}
                                </button>
                                <button
                                    onClick={() => { setConfirmingDelete(false); setDeleteError(false) }}
                                    className="text-neutral-400 hover:text-neutral-600"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmingDelete(true)}
                                className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-red-500 transition"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                            </button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </li>
    )
}
