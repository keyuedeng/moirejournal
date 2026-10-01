"use client"
import { Suspense, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
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
import PostEntryCard from "@/components/intentions/PostEntryCard"
import OpenLoops from "@/components/intentions/OpenLoops"

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
    if (count === 0) return "bg-hush"
    if (count === 1) return "bg-brand/35"
    if (count === 2) return "bg-brand/65"
    return "bg-brand"
}

export default function JournalPage() {
    // useSearchParams requires a Suspense boundary in the app router
    return (
        <Suspense fallback={<div className="p-6 md:p-8 min-h-screen bg-page" />}>
            <JournalPageInner />
        </Suspense>
    )
}

function JournalPageInner() {
    const { user } = useUser()
    const searchParams = useSearchParams()
    const openEntryId = searchParams.get('entry')
    const today = new Date()
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
    // After saving, the editor box turns into the post-entry card (saved
    // confirmation + open loops found in the entry) until "New entry".
    // null | { key, preview, saving } | { key, entryId, preview, loading }
    //      | { key, entryId, preview, suggestions, related }
    const [postEntry, setPostEntry] = useState(null)
    const closePostEntry = useCallback(() => setPostEntry(null), [])

    // Runs separately from the save itself so the entry never waits on the
    // LLM. If it fails, the card just says "Saved" with nothing found —
    // the entry is saved either way.
    async function loadSuggestions(key, entryId) {
        try {
            const res = await fetch(`/api/entries/${entryId}/intentions`, { method: "POST" })
            if (!res.ok) throw new Error(await res.text())
            const { suggestions, related } = await res.json()
            // ignore a slow response if the card was closed or another entry saved since
            setPostEntry(prev => prev?.key === key ? { ...prev, loading: false, suggestions, related } : prev)
        } catch (err) {
            console.error('Failed to load open loop suggestions', err)
            setPostEntry(prev => prev?.key === key ? { ...prev, loading: false, suggestions: [], related: [] } : prev)
        }
    }

    // the "Open loops" strip above the editor
    const [openLoops, setOpenLoops] = useState(null)
    const loadOpenLoops = useCallback(async () => {
        try {
            const res = await fetch("/api/intentions/surface")
            if (!res.ok) throw new Error(await res.text())
            setOpenLoops(await res.json())
        } catch (err) {
            // the strip is a helper, not critical — keep whatever we had
            console.error('Failed to load open loops', err)
        }
    }, [])

    useEffect(() => {
        loadOpenLoops()
    }, [loadOpenLoops])

    // Restore an in-progress draft — the page component unmounts on every
    // route change (only the layout persists), so plain useState alone
    // loses whatever you were mid-writing the moment you navigate to Map
    // and back. useLayoutEffect (not useEffect) applies it before the
    // browser paints, so there's no visible flash of an empty box first —
    // Clerk's user is already cached from the initial app load by the time
    // you're navigating within the app, so it's available synchronously here.
    //
    // A ?theme= param (from the Map's "Write about this" button) prefills
    // the title with that theme — but only when there's no existing draft,
    // so it can never clobber something you were already mid-writing.
    useLayoutEffect(() => {
        if (!user?.id) return
        try {
            const stored = localStorage.getItem(`journal-draft:${user.id}`)
            if (stored) {
                const draft = JSON.parse(stored)
                if (draft.title) setTitle(draft.title)
                if (draft.body) setBody(draft.body)
                return
            }
        } catch (err) {
            console.error('Failed to load draft', err)
        }

        const theme = searchParams.get('theme')
        if (theme) {
            setTitle(theme.charAt(0).toUpperCase() + theme.slice(1))
        }
    }, [user?.id, searchParams])

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

        // the editor box becomes the post-entry card straight away
        const key = `save-${Date.now()}`
        const preview = titleToSave.trim() || bodyToSave.trim().split(/\s+/).slice(0, 8).join(' ')
        setPostEntry({ key, preview, saving: true })

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
                restoreAfterFailedSave(key, titleToSave, bodyToSave)
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

            // no "Entry saved" toast — the card's ✓ Saved line says it, right
            // where you were looking
            setPostEntry(prev => prev?.key === key ? { key, entryId: savedEntry.id, preview, loading: true } : prev)
            loadSuggestions(key, savedEntry.id)

        } catch (err) {
            console.error('Error saving entry', err)
            setEntries(prev => prev.filter(entry => entry.id !== tempId))
            restoreAfterFailedSave(key, titleToSave, bodyToSave)
            setSaveStatus("error")
            setTimeout(() => setSaveStatus(""), 3000)
        }
    }

    // put the text back in the editor rather than losing it
    function restoreAfterFailedSave(key, titleToSave, bodyToSave) {
        setPostEntry(prev => prev?.key === key ? null : prev)
        setTitle(prev => prev || titleToSave)
        setBody(prev => prev || bodyToSave)
    }

    // "Write about it" on a goal check-in: start an entry about that loop
    function writeAbout(text) {
        setPostEntry(null)
        setTitle(prev => prev || text)
        requestAnimationFrame(() => bodyInputRef.current?.focus())
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
        greeting = "good morning"
    } else if (hour > 11 && hour < 17) {
        greeting = "good afternoon"
    } else {
        greeting = "good evening"
    }
    const firstName = user?.firstName || user?.emailAddresses[0]?.emailAddress?.split('@')[0]

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
        <div className="p-6 md:p-8 bg-page min-h-screen">
            <div className="max-w-7xl mx-auto xl:flex xl:gap-10 xl:items-start">
            <div className="w-full max-w-3xl mx-auto xl:max-w-4xl xl:mx-0 xl:flex-1 xl:min-w-0">
                {/* like a desk calendar: the day is the headline, the greeting a quiet line */}
                <div className="mb-7 flex items-end justify-between flex-wrap gap-x-6 gap-y-2">
                    <h1 className="flex items-end gap-4">
                        <span className="font-display text-[76px] leading-[0.78] text-brand">{today.getDate()}</span>
                        <span className="pb-0.5">
                            <span className="block font-display text-[32px] leading-none font-medium text-ink">
                                {today.toLocaleDateString("en-US", { weekday: "long" })}
                            </span>
                            <span className="block text-sm text-faint mt-1.5">
                                {today.toLocaleDateString("en-US", { month: "long" })}
                                {firstName && ` · ${greeting}, ${firstName}`}
                            </span>
                        </span>
                    </h1>
                    {realEntries.length > 0 && (
                        <p className="text-sm text-faint pb-0.5">
                            {realEntries.length} {realEntries.length === 1 ? 'entry' : 'entries'}
                            {streak >= 2 && ` · ${streak}-day streak`}
                            {earliestDate && ` · since ${earliestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </p>
                    )}
                </div>
                <div className="border border-line rounded-2xl p-6 mb-8 shadow-soft bg-surface">
                    {postEntry ? (
                        <PostEntryCard
                            key={postEntry.key}
                            state={postEntry}
                            onClose={closePostEntry}
                            onChange={loadOpenLoops}
                        />
                    ) : (
                    <form onSubmit={handleSubmit}>
                        <input
                            type="text"
                            placeholder="Give today a title…"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault()
                                    bodyInputRef.current?.focus()
                                }
                            }}
                            ref={titleInputRef}
                            aria-label="Entry title"
                            className="w-full text-[24px] font-normal tracking-[-0.01em] focus:outline-none pb-1.5 text-ink placeholder:text-stone-400 bg-transparent"
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
                            aria-label="Entry"
                            className="w-full min-h-28 focus:outline-none resize-none overflow-y-auto text-ink text-base placeholder:text-stone-400 bg-transparent"
                            style = {{ lineHeight: "1.7" }}
                        />
                        <div className="flex items-center justify-between gap-4 pt-4 mt-2 border-t border-hush">
                            <p className="text-xs text-faint">⌘ Enter to save</p>
                            <button
                                type="submit"
                                disabled={!body.trim()}
                                title={!body.trim() ? "Write something first" : "Save entry (⌘+Enter)"}
                                className={`${
                                    !body.trim()
                                    ? "bg-hush text-faint cursor-default"
                                    : "bg-brand hover:bg-brand-deep text-white cursor-pointer"
                                } text-sm px-5 py-2 rounded-full transition-colors`}>
                                Save entry
                            </button>
                        </div>
                    </form>
                    )}

                    {/* Status popup */}
                    {saveStatus && (
                        <div
                            role="status"
                            aria-live="polite"
                            className="fixed bottom-8 right-8 flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-soft border border-line bg-surface text-sm text-soft transition-all animate-in fade-in slide-in-from-bottom-2"
                        >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                saveStatus === "saving" ? "bg-neutral-400 animate-pulse" :
                                saveStatus === "success" ? "bg-brand" :
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
                    <OpenLoops data={openLoops} onChanged={loadOpenLoops} onWriteAbout={writeAbout} className="mb-6" />
                    <ActivityStrip entries={realEntries} />
                    <RecurringThemes />
                </div>

                {!loading && !entriesError && entries.length > 0 && (
                    <h2 className="font-display text-[26px] font-medium text-ink mb-3 px-1">Your entries</h2>
                )}
                {loading ? (
                    <div className="text-neutral-400 text-sm px-1">Loading entries...</div>
                ) : entriesError ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-center">
                        <p className="text-neutral-500">Couldn't load your entries.</p>
                        <button
                            onClick={loadEntries}
                            className="text-sm px-4 py-1.5 rounded-full border border-line text-soft hover:bg-hush transition"
                        >
                            Try again
                        </button>
                    </div>
                ) : (
                    <div>
                    {entries.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-16 text-center select-none">
                            <p className="italic text-base text-soft">
                                Your story starts with a single entry.
                            </p>
                        </div>
                    ) : (
                        <ul className="border border-line rounded-2xl bg-surface shadow-soft overflow-hidden divide-y divide-hush">
                            {entries.map((entry) => (
                                <JournalEntryItem
                                    key={entry.id}
                                    entry={entry}
                                    onDelete={handleDeleteEntry}
                                    autoOpen={entry.id === openEntryId}
                                />
                            ))}
                        </ul>
                    )}
                </div>
                )}
            </div>

            {/* rail: only on xl+, where there's genuinely spare width to use */}
            <aside className="hidden xl:block w-72 shrink-0 sticky top-8 space-y-6">
                <OpenLoops data={openLoops} onChanged={loadOpenLoops} onWriteAbout={writeAbout} />
                <RailCard title="Your rhythm">
                    <ActivityStrip entries={realEntries} compact />
                </RailCard>
                <RailCard title="You keep returning to">
                    <RecurringThemes compact />
                </RailCard>
            </aside>
            </div>
        </div>
    )
}

function RailCard({ title, children }) {
    return (
        <div className="border border-line rounded-2xl p-5 bg-surface shadow-soft">
            <h3 className="font-display text-xl font-medium text-ink mb-3">{title}</h3>
            {children}
        </div>
    )
}

function ActivityStrip({ entries, compact = false }) {
    const weeks = useMemo(() => buildActivityWeeks(entries), [entries])

    // Show the grid from day one — an all-empty strip still communicates
    // "this is where your rhythm will show up," which is more useful than
    // the widget (and its rail-card title) just not being there yet.
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

    if (themes.length === 0) {
        // Mobile/tablet: this renders inline with no heading of its own, so
        // rendering nothing is still correct there. In the rail, though, it
        // sits under a "Recurring themes" title — leaving that heading with
        // nothing underneath reads as broken, not just empty.
        if (!compact) return null
        return (
            <p className="text-xs text-neutral-400 italic">
                Themes will appear as you write more.
            </p>
        )
    }

    return (
        <div className={compact ? "flex flex-wrap gap-1.5" : "mb-6 flex items-center gap-2 flex-wrap px-1"}>
            {!compact && <span className="text-sm text-faint shrink-0">You keep returning to</span>}
            {themes.map(t => (
                <span key={t.id} className="text-sm px-3 py-1 border border-line rounded-full text-soft capitalize">
                    {t.label}
                </span>
            ))}
        </div>
    )
}

function JournalEntryItem({ entry, onDelete, autoOpen = false }) {
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
            <Dialog defaultOpen={autoOpen} onOpenChange={(open) => { if (!open) setConfirmingDelete(false) }}>
                <DialogTrigger asChild>
                    <button
                        disabled={entry.saving}
                        className="w-full flex justify-between items-center px-5 py-3.5 hover:bg-hush/60 transition disabled:hover:bg-transparent disabled:cursor-default"
                    >
                        <div className="flex items-baseline gap-3 min-w-0 text-ink">
                            <span className="text-xs text-faint tabular-nums shrink-0 w-12 text-left">
                                {new Date(entry.createdAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "2-digit",
                                })}
                            </span>
                            {entry.title === "" ? (
                                <span className="italic text-[15px] text-soft truncate">{entry.body.split(' ').slice(0,7).join(' ')}{"…"}</span>
                            ) : (
                                <span className="text-[15px] font-bold text-ink truncate">{entry.title}</span>
                            )}
                            {entry.saving && (
                                <span className="flex items-center gap-1 text-[11px] text-neutral-400 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
                                    saving
                                </span>
                            )}
                            {!entry.saving && entry.status === "PENDING" && (
                                <span className="flex items-center gap-1 text-[11px] text-brand shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
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
                        {!entry.saving && <ArrowUpRight className="w-4 h-4 text-stone-300 shrink-0" />}
                    </button>
                </DialogTrigger>
                <DialogContent className="!max-w-[calc(100%-2rem)] sm:!max-w-2xl !h-[90vh] sm:!h-[85vh] overflow-y-auto flex flex-col">
                    <DialogHeader className="p-6 space-y-4 flex-1">
                        <DialogTitle className="text-[34px] leading-tight font-display font-medium text-ink">{entry.title}</DialogTitle>
                        <DialogDescription className="text-sm text-faint">
                            {new Date(entry.createdAt).toLocaleString()}
                        </DialogDescription>
                        <div className="whitespace-pre-wrap text-ink text-[17px] pt-2" style={{ lineHeight: 1.75 }}>
                            {entry.body}
                        </div>
                    </DialogHeader>
                    <DialogFooter className="!justify-between items-center px-6 pb-2 pt-4 border-t border-hush sm:!flex-row">
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
