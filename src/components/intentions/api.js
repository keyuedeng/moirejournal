// small client helpers shared by the open loops components

export async function patchIntention(id, body) {
    const res = await fetch(`/api/intentions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

export const DAY_MS = 24 * 60 * 60 * 1000
