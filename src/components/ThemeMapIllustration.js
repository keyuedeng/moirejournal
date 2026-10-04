// A hand-composed picture of a theme map for the landing page. Fixed
// positions (instead of a live force simulation) so it always looks
// balanced: no overlapping labels, nothing clipped at the edges.

const TONES = {
    core: "#7F5B70",  // the theme you return to most (brand)
    strong: "#A8899B",
    mid: "#CDBCC6",
    quiet: "#DAD6D2",
}

// x, y, radius, tone, label side
const NODES = {
    growth: [290, 150, 24, "core", "below"],
    friendship: [165, 100, 16, "strong", "left"],
    career: [420, 92, 17, "strong", "right"],
    creativity: [420, 222, 13, "mid", "right"],
    rest: [182, 222, 12, "mid", "left"],
    family: [70, 158, 8, "quiet", "below"],
    writing: [262, 46, 7, "quiet", "right"],
    uni: [520, 150, 9, "quiet", "below"],
    running: [318, 262, 8, "quiet", "right"],
    drawing: [516, 262, 6, "quiet", "left"],
    sleep: [92, 262, 6, "quiet", "right"],
}

// a, b, strength (1 = faint, 3 = strong)
const LINKS = [
    ["growth", "friendship", 3], ["growth", "career", 3], ["growth", "creativity", 2],
    ["growth", "rest", 2], ["growth", "running", 1], ["growth", "writing", 1],
    ["friendship", "family", 2], ["friendship", "rest", 1], ["friendship", "writing", 1],
    ["career", "uni", 2], ["career", "creativity", 1], ["creativity", "drawing", 1],
    ["rest", "sleep", 1], ["rest", "running", 1],
]

function labelPosition([x, y, r], side) {
    switch (side) {
        case "left": return { x: x - r - 8, y: y + 4, anchor: "end" }
        case "right": return { x: x + r + 8, y: y + 4, anchor: "start" }
        default: return { x, y: y + r + 17, anchor: "middle" }
    }
}

export default function ThemeMapIllustration({ className = "" }) {
    const names = Object.keys(NODES)
    return (
        <svg viewBox="0 0 600 300" className={className} role="img" aria-label="An example map of recurring themes, with growth at the centre">
            <style>{`
                .tm-node { opacity: 0; animation: tm-in 0.9s ease-out forwards; }
                .tm-links { opacity: 0; animation: tm-in 1.2s ease-out 0.3s forwards; }
                .tm-pulse { transform-origin: 290px 150px; animation: tm-pulse 3.6s ease-in-out infinite; }
                @keyframes tm-in { to { opacity: 1; } }
                @keyframes tm-pulse { 0%, 100% { transform: scale(1); opacity: 0.35; } 50% { transform: scale(1.35); opacity: 0; } }
                @media (prefers-reduced-motion: reduce) {
                    .tm-node, .tm-links { animation: none; opacity: 1; }
                    .tm-pulse { animation: none; opacity: 0.2; }
                }
            `}</style>

            <g className="tm-links" fill="none" strokeLinecap="round">
                {LINKS.map(([a, b, strength]) => {
                    const [x1, y1] = NODES[a]
                    const [x2, y2] = NODES[b]
                    return (
                        <line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke={strength === 3 ? "#D6CCD2" : "#E6E2DF"} strokeWidth={strength === 3 ? 1.6 : strength === 2 ? 1.2 : 1} />
                    )
                })}
            </g>

            {/* a slow breathing ring around the theme you return to most */}
            <circle className="tm-pulse" cx={290} cy={150} r={24} fill={TONES.core} />

            {names.map((name, i) => {
                const [x, y, r, tone, side] = NODES[name]
                const label = labelPosition(NODES[name], side)
                const key = tone === "core" || tone === "strong"
                return (
                    <g key={name} className="tm-node" style={{ animationDelay: `${0.1 + i * 0.06}s` }}>
                        <circle cx={x} cy={y} r={r} fill={TONES[tone]} stroke="#FFFFFF" strokeWidth={2.5} />
                        <text
                            x={label.x} y={label.y} textAnchor={label.anchor}
                            fontFamily="var(--font-lato), sans-serif"
                            fontSize={key ? 13 : 12} fontWeight={tone === "core" ? 700 : 400}
                            fill={key ? "#262322" : "#78726E"}
                            stroke="#FFFFFF" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round"
                        >
                            {name}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}
