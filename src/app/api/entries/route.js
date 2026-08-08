import prisma from '@/lib/prisma'
import { processEntry } from '@/lib/identity/pipeline/processEntry'
import { auth } from '@clerk/nextjs/server'
import { after } from 'next/server'

export const maxDuration = 60

export async function POST(request) {
    try {
        const { userId } = await auth()
        
        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }
        
        const { title, body } = await request.json()
        
        if (!body || body.trim().length === 0) {
            return Response.json(
                { error: "Body cannot be empty" },
                { status: 400 }
            )
        }

        // Ensure user exists in database
        await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: { id: userId }
        })

        const savedEntry = await prisma.entry.create({
            data: { 
                userId, 
                title: title || "", 
                body,
            },
        })

        // The AI pipeline (chunking, topic extraction, node-graph updates)
        // can take many seconds — the entry itself is already saved, so
        // there's no reason to make the user's request wait on it. It runs
        // after the response is sent, still within the function's lifetime.
        after(async () => {
            try {
                await processEntry(userId, savedEntry.id, savedEntry.body)
                await prisma.entry.update({
                    where: { id: savedEntry.id },
                    data: { status: "PROCESSED" },
                })
            } catch (error) {
                console.error("Background processing failed for entry", savedEntry.id, error)
                await prisma.entry.update({
                    where: { id: savedEntry.id },
                    data: { status: "FAILED" },
                }).catch(updateError => {
                    console.error("Failed to mark entry as failed", savedEntry.id, updateError)
                })
            }
        })

        return Response.json({
            success: true,
            entry: savedEntry,
        })
    } catch (error) {
        console.error("Failed to process entry:", error)
        console.error("Error stack:", error.stack)
        console.error("Error message:", error.message)
        return Response.json({ 
            error: "Internal Server Error",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }, { status: 500 })
    }
}

export async function GET() {
    try {
        const { userId } = await auth()
        
        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }
        
        const entries = await prisma.entry.findMany({
            where: {
                userId
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
        return Response.json(entries)
    }
    catch (error) {
        console.error("Failed to fetch entries:", error)
        return Response.json({ error: "Failed to fetch entries" }, {status: 500 })
    }
}

export async function DELETE(request) {
    try {
        const { userId } = await auth()

        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const id = searchParams.get("id")

        if (!id) {
            return Response.json({ error: "Missing entry ID" }, { status: 400 })
        }

        const entry = await prisma.entry.findUnique({ where: { id } })

        if (!entry || entry.userId !== userId) {
            return Response.json({ error: "Entry not found" }, { status: 404 })
        }

        // Insight rows reference this entry with no cascade delete, so they
        // have to go first or the entry delete fails on the FK constraint.
        await prisma.$transaction([
            prisma.insight.deleteMany({ where: { entryId: id } }),
            prisma.entry.delete({ where: { id } }),
        ])

        return Response.json({ message: "Entry deleted successfully" })
    }
    catch (error) {
        console.error("Failed to delete entry:", error)
        return Response.json({ error: "Failed to delete entry" }, { status: 500 })
    }
}