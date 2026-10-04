"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NotebookPen, Orbit, CircleDashed, CalendarDays, Menu, X, ChevronDown } from "lucide-react"
import { useUser, useClerk } from '@clerk/nextjs'
import { useState, useEffect, useRef } from 'react'

const NAV_LINKS = [
    { href: "/journal", label: "Journal", icon: NotebookPen },
    { href: "/loops", label: "Open Loops", icon: CircleDashed },
    { href: "/review", label: "Weekly Look Back", icon: CalendarDays },
    { href: "/map", label: "Your Fragments", icon: Orbit },
]

export default function Sidebar() {
    const { user } = useUser()
    const { signOut } = useClerk()
    const pathname = usePathname()
    const [showPopup, setShowPopup] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)
    const popupRef = useRef(null)

    useEffect(() => {
        function handleClickOutside(event) {
            if (popupRef.current && !popupRef.current.contains(event.target)) {
                setShowPopup(false)
            }
        }
        if (showPopup) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [showPopup])

    // Escape closes whichever overlay is open
    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key !== 'Escape') return
            if (showPopup) setShowPopup(false)
            else if (mobileOpen) setMobileOpen(false)
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [showPopup, mobileOpen])

    // close the mobile drawer on route change
    useEffect(() => {
        setMobileOpen(false)
    }, [pathname])

    const displayName = user?.firstName || user?.emailAddresses[0]?.emailAddress || 'User'

    return (
        <>
            {/* mobile top bar */}
            <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 bg-stone-100/90 backdrop-blur-sm border-b border-line">
                <span className="font-display italic text-2xl font-medium text-ink">Moiré</span>
                <button
                    onClick={() => setMobileOpen(true)}
                    aria-label="Open menu"
                    className="p-2 rounded-lg hover:bg-hush text-soft"
                >
                    <Menu className="w-5 h-5" />
                </button>
            </div>

            {/* mobile backdrop */}
            {mobileOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/30 z-40"
                    onClick={() => setMobileOpen(false)}
                    aria-hidden="true"
                />
            )}

            <aside
                className={`
                    fixed md:static inset-y-0 left-0 z-50 w-72 md:w-64 h-screen
                    flex flex-col bg-stone-100 border-r border-line
                    transform transition-transform duration-300 ease-in-out
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
                `}
            >
                <div className="px-4 py-6 flex flex-col flex-1 min-h-0">
                    <div className="flex items-center justify-between mb-5">
                        <span className="hidden md:block font-display italic text-[28px] leading-none font-medium text-ink px-3">
                            Moiré
                        </span>
                        <button
                            onClick={() => setMobileOpen(false)}
                            aria-label="Close menu"
                            className="md:hidden p-2 rounded-lg hover:bg-hush text-soft"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="relative" ref={popupRef}>
                        <button
                            onClick={() => setShowPopup(!showPopup)}
                            aria-haspopup="menu"
                            aria-expanded={showPopup}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-hush rounded-xl transition-colors cursor-pointer"
                        >
                            <span className="w-7 h-7 rounded-full bg-brand-soft text-brand-deep text-xs flex items-center justify-center shrink-0 uppercase">
                                {displayName.charAt(0)}
                            </span>
                            <span className="flex-1 min-w-0 truncate text-left text-sm text-soft">{displayName}</span>
                            <ChevronDown className={`w-4 h-4 shrink-0 text-faint transition-transform ${showPopup ? 'rotate-180' : ''}`} />
                        </button>

                        {showPopup && (
                            <div
                                role="menu"
                                className="absolute top-full mt-2 left-0 right-0 bg-surface border border-line rounded-xl shadow-soft p-1 z-10"
                            >
                                <button
                                    role="menuitem"
                                    onClick={() => signOut()}
                                    className="w-full text-left px-3 py-2 text-sm text-soft hover:bg-hush rounded-lg"
                                >
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>

                    <nav className="flex flex-col space-y-0.5 mt-5">
                        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                            const active = pathname === href
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    aria-current={active ? "page" : undefined}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                                        active
                                            ? "bg-surface text-ink shadow-soft"
                                            : "text-soft hover:bg-hush"
                                    }`}
                                >
                                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-brand" : "text-faint"}`} />
                                    <span>{label}</span>
                                </Link>
                            )
                        })}
                    </nav>

                    <div className="mt-auto pt-6 pb-2 text-center select-none">
                        <p className="text-xs text-faint italic">
                            grow quietly
                        </p>
                    </div>
                </div>
            </aside>
        </>
    )
}
