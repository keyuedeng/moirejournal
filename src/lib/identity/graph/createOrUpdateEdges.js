import prisma from "@/lib/prisma";

/*
input: list of nodeIds from the same chunk
output: creates or updates weighted edges between them

- all edges are undirected
- edge weight increments when nodes co-occur in a chunk 
*/

export async function createOrUpdateEdges(userId, nodeIds, weightIncrement = 1) {
    if (!nodeIds || nodeIds.length < 2) return

    //dedupe 
    const unique = [...new Set(nodeIds)]

    if (unique.length < 2 ) return //cant have edge for only 1 node
    
    //generate sorted pairs
    const pairs = []
    for (let i = 0; i < unique.length; i++) {
        for (let j=i+1; j<unique.length; j++) {
            const a = unique[i]
            const b = unique[j]
            const [sourceId, targetId] = a < b ? [a,b] : [b,a]
            pairs.push({sourceId, targetId})
        }
    }

    //look up all exisitng edges
    const existingEdges = await prisma.edge.findMany({
        where: {
            OR: pairs.map((p) => ({
                sourceId: p.sourceId,
                targetId: p.targetId,
            })),
        }
    })

    const existingMap = new Map()
    for (const edge of existingEdges) {
        const key = `${edge.sourceId}_${edge.targetId}`
        existingMap.set(key, edge)
    }

    // Write edges a few at a time instead of firing every pair as one
    // Promise.all burst — with pgbouncer, each query opens its own
    // transaction, so an entry touching several topics (which is a lot of
    // pairs) could otherwise blow past the connection pool all at once.
    const CONCURRENCY = 3
    for (let i = 0; i < pairs.length; i += CONCURRENCY) {
        const batch = pairs.slice(i, i + CONCURRENCY)
        await Promise.all(batch.map((pair) => {
            const key = `${pair.sourceId}_${pair.targetId}`
            const existing = existingMap.get(key)

            if (existing) {
                return prisma.edge.update({
                    where: { id: existing.id },
                    data: { weight: existing.weight + weightIncrement }
                })
            }

            return prisma.edge.create({
                data: {
                    sourceId: pair.sourceId,
                    targetId: pair.targetId,
                    weight: weightIncrement,
                }
            })
        }))
    }
}