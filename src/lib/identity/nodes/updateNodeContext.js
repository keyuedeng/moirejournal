import prisma from "@/lib/prisma";
import { generateNodeSummary } from "./generateNodeSummary";

export async function updateNodeContext(nodeId, context) {
    if (!nodeId) {
        throw new Error("updateNodeContext: nodeId is required")
    }
    if (!context || !context.text ) {
        throw new Error("updateNodeContext: context.text is required")
    }

    const node = await prisma.node.findUnique({
        where: {id: nodeId },
        select: {
            id: true,
            contexts: true,
            count: true,
            label: true,
            categories: true,
            llmSummary: true,
        },
    })

    const currContexts = Array.isArray(node.contexts) ? node.contexts: []

    const updatedContexts = [...currContexts, context]

    if (updatedContexts.length > 10) { //maybe can make limit higher, 50?
        updatedContexts.shift()
    }

    // Generate a summary once the node is established (count >= 2), but not
    // on every single touch after that — regenerating on every write was
    // the single biggest cost in the pipeline for themes you return to
    // often. Instead: always generate the first summary, then refresh it
    // roughly every 3rd touch so it stays reasonably current without
    // paying for an LLM call on every entry.
    let updateData = { contexts: updatedContexts }

    const shouldRefreshSummary = node.count >= 2 && (!node.llmSummary || node.count % 3 === 0)

    if (shouldRefreshSummary) {
        const result = await generateNodeSummary({
            ...node,
            contexts: updatedContexts
        })

        if (result) {
            updateData.llmSummary = result.summary
            updateData.bulletPoints = result.bulletPoints
        }
    }

    const updatedNode = await prisma.node.update({
        where: { id: nodeId },
        data: updateData,
    })

    return updatedNode
}