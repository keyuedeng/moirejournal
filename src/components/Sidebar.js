"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NotebookPen, Orbit, Menu, X, ChevronDown } from "lucide-react"
import { useUser, useClerk } from '@clerk/nextjs'
import { useState, useEffect, useRef } from 'react'

const NAV_LINKS = [
    { href: "/journal", label: "Journal", icon: NotebookPen },
    { href: "/map", label: "My Fragments", icon: Orbit },
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
            <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 bg-stone-100/80 backdrop-blur-sm border-b border-stone-200">
                <span className="font-[family-name:var(--font-cormorant)] text-xl font-semibold text-neutral-700">Moire</span>
                <button
                    onClick={() => setMobileOpen(true)}
                    aria-label="Open menu"
                    className="p-2 rounded-md hover:bg-neutral-200/50 text-neutral-700"
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
                    flex flex-col bg-stone-100/50 border-r border-stone-200
                    transform transition-transform duration-300 ease-in-out
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
                `}
            >
                <div className="p-4 flex flex-col flex-1 min-h-0">
                    <div className="flex items-center justify-between mb-1">
                        <span className="hidden md:block font-[family-name:var(--font-cormorant)] text-xl font-semibold text-neutral-700 px-3 pt-1">
                            Moire
                        </span>
                        <button
                            onClick={() => setMobileOpen(false)}
                            aria-label="Close menu"
                            className="md:hidden p-2 rounded-md hover:bg-neutral-200/50 text-neutral-700"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="relative" ref={popupRef}>
                        <button
                            onClick={() => setShowPopup(!showPopup)}
                            aria-haspopup="menu"
                            aria-expanded={showPopup}
                            className="w-full flex items-center justify-between px-3 py-3 hover:bg-neutral-200/50 rounded-md transition-colors font-semibold text-lg cursor-pointer text-neutral-700"
                        >
                            <span className="truncate font-[family-name:var(--font-cormorant)]">{displayName}</span>
                            <ChevronDown className={`w-4 h-4 shrink-0 text-neutral-400 transition-transform ${showPopup ? 'rotate-180' : ''}`} />
                        </button>

                        {showPopup && (
                            <div
                                role="menu"
                                className="absolute top-full mt-2 left-0 right-0 bg-white border border-stone-200 rounded-md shadow-lg p-1 z-10"
                            >
                                <button
                                    role="menuitem"
                                    onClick={() => signOut()}
                                    className="w-full text-left px-3 py-2 text-sm text-neutral-600 hover:bg-stone-100 rounded-md font-[family-name:var(--font-cormorant)]"
                                >
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>

                    <nav className="flex flex-col space-y-1 mt-2">
                        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                            const active = pathname === href
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    aria-current={active ? "page" : undefined}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                                        active
                                            ? "bg-[#b88998]/15 text-[#8a6270] font-medium"
                                            : "text-neutral-700 hover:bg-neutral-200/50"
                                    }`}
                                >
                                    <Icon className="w-4 h-4 shrink-0" />
                                    <span className="font-[family-name:var(--font-cormorant)]">{label}</span>
                                </Link>
                            )
                        })}
                    </nav>

                    <div className="mt-auto pt-6 pb-2 text-center select-none">
                        <p className="text-[11px] text-neutral-400 italic font-[family-name:var(--font-cormorant)]">
                            grow quietly
                        </p>
                    </div>
                </div>
            </aside>
        </>
    )
}
