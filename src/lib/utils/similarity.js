//cosine similarity between two embedding vectors
export function cosineSimilarity(a,b) {
    let dot = 0
    let magA = 0
    let magB = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i]*b[i]
        magA += a[i]*a[i]
        magB += b[i]*b[i]
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB)
    if (denom === 0) return 0

    return dot/denom
}
