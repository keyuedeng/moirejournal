import prisma from "@/lib/prisma";
import { cosineSimilarity } from "@/lib/utils/similarity";

/*
finds closest node by comparing embeddings
input: user, topic embedding as vector
returns: node, similarity
*/
export async function findClosestNode(userId, embedding) {
    const nodes = await prisma.node.findMany({
        where: {userId},
        select: {
            id: true,
            label: true,
            embedding: true,
            categories: true, 
            count: true,
        },
    })
    if (nodes.length === 0) {
        // create node
        return {
            node: null, 
            similarity: 0,
        }
    }

    let bestNode = null;
    let bestSimilarity = -Infinity

    //compare similarity with each node
    for (const node of nodes) {
        const sim = cosineSimilarity(embedding, node.embedding)

        if (sim > bestSimilarity) {
            bestSimilarity = sim
            bestNode = node
        }
    }
    return {
        node: bestNode, 
        similarity: bestSimilarity
    }
}