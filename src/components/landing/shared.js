"use client"
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

// Pieces shared by the landing page and the v2 landing draft
// (src/app/_drafts/LandingV2.js).

// fades a section in as it scrolls into view
export function Reveal({ children, className = "", delay = 0 }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay }}
      viewport={{ once: true, amount: 0.3 }}
    >
      {children}
    </motion.div>
  )
}

/*
the hero's illustration: an entry, the line that becomes a loop, the
post-save suggestions, and the loop later ticked off in the panel.
plays once on load (fades only, for people who prefer reduced motion).
*/
export function LoopDemo() {
  const appear = (delay) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay },
  })

  return (
    <div className="w-full max-w-md lg:max-w-none lg:flex-1 flex flex-col items-end" aria-hidden="true">
      {/* the entry */}
      <motion.div {...appear(0.2)} className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-soft p-6">
        <p className="text-[20px] tracking-[-0.01em] mb-2">Thursday night</p>
        <p className="text-[15px] leading-relaxed text-soft">
          kind of a chaotic week honestly. uni is ramping up again and i already feel behind.{" "}
          <motion.span
            className="rounded px-0.5 -mx-0.5 text-ink"
            initial={{ backgroundColor: "rgba(242,236,240,0)" }}
            animate={{ backgroundColor: "rgba(242,236,240,1)" }}
            transition={{ duration: 0.6, delay: 1.1 }}
          >
            also have to call grandma this weekend, it’s been ages.
          </motion.span>{" "}
          one day i want to learn to surf properly.
        </p>
      </motion.div>

      {/* what Moiré noticed */}
      <motion.div {...appear(1.6)} className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-soft p-6 mt-4">
        <p className="font-display text-[24px] font-medium mb-3">Want to hold onto any of these?</p>
        <p className="text-sm italic text-soft">“also have to call grandma this weekend, it’s been ages.”</p>
        <p className="flex items-center gap-2 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
          <span className="text-[15px] font-bold">Call grandma</span>
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <span className="text-sm px-3.5 py-1.5 rounded-full border border-brand/30 bg-brand-soft text-brand-deep">This week</span>
          <span className="text-sm px-3.5 py-1.5 rounded-full border border-line text-soft">This month</span>
          <span className="text-sm px-3.5 py-1.5 rounded-full border border-line text-soft">Someday</span>
        </div>
        <div className="border-t border-hush mt-4 pt-3">
          <p className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-lilac" />
            <span className="text-[15px] font-bold">Learn to surf properly</span>
          </p>
          <span className="inline-block text-sm mt-2 px-3.5 py-1.5 rounded-full border border-line text-soft">Try: book one beginner lesson</span>
        </div>
      </motion.div>

      {/* and on Saturday, it comes back */}
      <motion.div {...appear(2.6)} className="w-full max-w-xs rounded-2xl border border-line bg-surface shadow-soft p-5 mt-4">
        <p className="font-display text-[20px] font-medium">Open loops</p>
        <p className="text-xs text-faint mb-2">Saturday · this week</p>
        <div className="flex items-center gap-2.5">
          <motion.span
            className="w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center"
            initial={{ backgroundColor: "rgba(127,91,112,0)", borderColor: "#D7D3CF" }}
            animate={{ backgroundColor: "rgba(127,91,112,1)", borderColor: "#7F5B70" }}
            transition={{ duration: 0.3, delay: 3.6 }}
          >
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </motion.span>
          <motion.span
            className="text-sm"
            initial={{ color: "#262322", textDecorationColor: "rgba(153,147,143,0)" }}
            animate={{ color: "#99938F", textDecorationColor: "rgba(153,147,143,1)" }}
            style={{ textDecorationLine: "line-through" }}
            transition={{ duration: 0.3, delay: 3.6 }}
          >
            Call grandma
          </motion.span>
        </div>
      </motion.div>
    </div>
  )
}
