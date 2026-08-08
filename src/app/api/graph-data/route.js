import prisma from "@/lib/prisma";
import { auth } from '@clerk/nextjs/server'

export async function GET() {
    try {
        const { userId } = await auth()
        
        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }
        
        const nodes = await prisma.node.findMany({
            where: {
                userId,
                count: {gt:1}
            }
        })
        const nodeIds = nodes.map(n => n.id)

        // Only keep edges where BOTH ends are a real (count>1) theme — an
        // edge to a one-off topic would otherwise pull that topic's node
        // in just to avoid a dangling link, cluttering the map with small
        // nodes that contradict "themes show up once they recur."
        const edges = await prisma.edge.findMany({
            where: {
                sourceId: { in: nodeIds },
                targetId: { in: nodeIds },
            }
        })

        const links = edges.map(edge => ({
            source: edge.sourceId,
            target: edge.targetId,
            weight: edge.weight
        }))

        return Response.json({ nodes, links })
    } 
    catch (error) {
        console.error("Failed to fetch graph data:", error)
        return Response.json( {error: "Failed to fetch graph data"}, {status: 500})
    }
}