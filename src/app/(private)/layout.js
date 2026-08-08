"use client"
import Sidebar from "@/components/Sidebar"

export default function PrivateLayout ({children}) {
    return (
        <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
                {children}
            </main>
        </div>
    )
}