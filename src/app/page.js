"use client"
import Link from 'next/link'
import { MotionConfig } from 'framer-motion'
import { Check } from 'lucide-react'
import { Reveal, LoopDemo } from '@/components/landing/shared'
import ThemeMapIllustration from '@/components/ThemeMapIllustration'

// Reminders aren't built yet, so the page doesn't mention them.
export default function Home() {
  return (
    // reducedMotion="user": people who prefer reduced motion get instant
    // movement (fades only). Branching on useReducedMotion() instead left
    // elements stuck invisible — the server renders the hidden starting
    // state before it can know the preference.
    <MotionConfig reducedMotion="user">
    <div className="bg-page text-ink">
      <header className="fixed top-0 w-full z-50 py-5 px-6 md:px-8 bg-paper/85 backdrop-blur-sm border-b border-line">
        <nav className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="text-[30px] leading-none italic font-medium text-ink font-display">
            Moiré
          </div>
          <div className="flex gap-8 items-center">
            <a href="#how-it-works" className="hidden sm:block text-soft hover:text-ink transition">How it works</a>
            <a href="#why" className="hidden sm:block text-soft hover:text-ink transition">Why Moiré</a>
            <a href="#faq" className="hidden md:block text-soft hover:text-ink transition">FAQ</a>
            <Link href="/sign-in" className="px-6 py-2 text-sm bg-brand text-white rounded-full hover:bg-brand-deep transition">
              Sign in
            </Link>
          </div>
        </nav>
      </header>

      {/* hero: the promise, and an entry turning into open loops */}
      <section className="min-h-screen flex flex-col lg:flex-row items-center gap-16 px-6 md:px-16 lg:px-24 pt-32 pb-20 max-w-7xl mx-auto">
        <div className="max-w-xl flex-shrink-0">
          <p className="text-sm text-brand mb-5">A journal that remembers</p>
          <h1 className="mb-6 text-6xl md:text-7xl font-medium leading-[1.02] font-display">
            Write it down.<br />We’ll make sure it comes back<span className="text-brand">.</span>
          </h1>
          <p className="mb-10 text-lg md:text-xl text-soft leading-relaxed">
            Your journal is full of half-made promises to yourself. Moiré keeps them.
          </p>
          <div className="flex gap-4 flex-wrap">
            <Link href="/sign-up" className="px-10 py-3.5 text-sm bg-brand text-white rounded-full hover:bg-brand-deep transition-colors shadow-soft">
              Start writing →
            </Link>
            <Link href="/sign-in" className="px-10 py-3.5 text-sm bg-surface border border-line text-soft rounded-full hover:bg-hush transition-colors">
              Sign in
            </Link>
          </div>
        </div>
        <LoopDemo />
      </section>

      {/* how it works: the problem in one line, then the loop */}
      <section id="how-it-works" className="bg-surface border-y border-line px-6 md:px-16 py-24">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl">
            <h2 className="text-5xl md:text-6xl font-medium font-display text-balance">You write it down. Then it’s gone.</h2>
            <p className="text-lg text-soft mt-4">
              The things you meant to do get buried in old entries. Moiré gives these <span className="text-ink font-bold">open loops</span> somewhere to go.
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8 mt-14">
            {[
              ["Write freely", "No tags, no templates. Just write."],
              ["Keep what matters", "Pick what to hold onto, in your own words."],
              ["It comes back", "When it’s due, when you write about it again, or in your Sunday look back."],
              ["Close the loop", "Tick it off or let it go. Both count."],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 0.1} className="border-t border-line pt-5">
                <p className="text-sm text-brand mb-2">0{i + 1}</p>
                <h3 className="font-display text-[26px] font-medium leading-tight mb-1.5">{title}</h3>
                <p className="text-soft text-[15px] leading-relaxed">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* the two features as two sides of the same writing */}
      <section className="px-6 md:px-16 py-24">
        <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-2xl mb-12">
          <h2 className="text-5xl md:text-6xl font-medium font-display text-balance">One entry. Two things you’d otherwise miss.</h2>
        </Reveal>
        <div className="grid lg:grid-cols-2 gap-6">
          <Reveal className="rounded-2xl border border-line bg-surface shadow-soft p-7 flex flex-col">
            <p className="text-sm text-brand mb-2">Open loops</p>
            <h3 className="font-display text-[32px] font-medium leading-tight mb-2">Things you said you’d do</h3>
            <p className="text-soft leading-relaxed mb-6">Tasks, goals and wishes, kept in your words. Gentle check-ins that back off when you’re busy.</p>
            {/* a small version of the journal's open loops panel */}
            <div className="rounded-xl border border-hush p-5 space-y-4">
              {[
                ["This week", "bg-brand", [["Email tutor about the extension", "Fri"], ["Call grandma", "Sat", true]]],
                ["Ongoing", "bg-sage", [["Start running again", "weekly"]]],
                ["Someday", "bg-lilac", [["Learn to surf properly", ""]]],
              ].map(([label, dot, rows]) => (
                <div key={label}>
                  <p className="flex items-center gap-2 text-xs text-faint mb-1.5"><span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{label}</p>
                  {rows.map(([t, meta, done]) => (
                    <div key={t} className="flex items-center gap-3 text-sm py-1">
                      <span className={`w-[18px] h-[18px] rounded-full border-[1.5px] shrink-0 flex items-center justify-center ${done ? "bg-brand border-brand" : "border-neutral-300"} ${label === "Ongoing" ? "border-dashed" : ""}`}>
                        {done && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </span>
                      <span className={`flex-1 ${done ? "text-faint line-through" : ""}`}>{t}</span>
                      <span className="text-xs text-faint">{meta}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1} className="rounded-2xl border border-line bg-surface shadow-soft p-7 flex flex-col">
            <p className="text-sm text-brand mb-2">Your Fragments</p>
            <h3 className="font-display text-[32px] font-medium leading-tight mb-2">What keeps coming up</h3>
            <p className="text-soft leading-relaxed">The themes you return to, connected over time, so you can see what’s been on your mind.</p>
            <div className="flex-1 flex items-center mt-4">
              <ThemeMapIllustration className="w-full h-auto" />
            </div>
          </Reveal>
        </div>
        </div>
      </section>

      {/* the weekly look back, with a pattern nudge */}
      <section className="px-6 md:px-16 py-24">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <p className="text-sm text-brand mb-3">Weekly look back</p>
            <h2 className="text-5xl md:text-6xl font-medium font-display text-balance">A gentle look back at your week</h2>
            <p className="text-lg text-soft leading-relaxed mt-5">
              A few lines on what your week held, a line you wrote, and a moment to sort what’s still open. No stats, no streaks.
            </p>
            <p className="text-lg text-soft leading-relaxed mt-4">
              And when something keeps coming up in your writing, Moiré might gently ask if you want to make it a goal.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="rounded-2xl border border-line bg-surface shadow-soft p-7">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-[28px] font-medium">Your week</p>
              <p className="text-xs text-faint"><span className="text-brand">This week</span> · Sep 28 – Oct 4</p>
            </div>
            <p className="text-[15px] leading-relaxed mt-4">
              You wrote four times this week, mostly about feeling stuck at uni and wanting more time for yourself. Friendship came up as the bright spot.
            </p>
            <div className="mt-4 pt-4 border-t border-hush">
              <p className="text-xs text-faint mb-1">A line from your week</p>
              <p className="italic">“today i finally had time to think.”</p>
            </div>
            <div className="mt-5">
              <p className="text-xs text-faint mb-2">Still open · 1 of 2 sorted</p>
              <div className="flex items-center justify-between gap-3 py-2 border-t border-hush text-sm">
                <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-brand" />Sell the furniture</span>
                <span className="flex gap-1.5">
                  <span className="px-3 py-1 rounded-full border border-line text-soft">Next week</span>
                  <span className="px-3 py-1 rounded-full border border-line text-soft">Someday</span>
                </span>
              </div>
              <p className="flex items-center gap-2 py-2 border-t border-hush text-sm text-soft">
                <Check className="w-4 h-4 text-brand" /> Carried into next week
              </p>
            </div>
            <div className="rounded-xl bg-brand-soft/70 border border-brand/15 p-4 mt-4">
              <p className="text-sm">This is the third time you’ve written about feeling stuck.</p>
              <p className="text-sm mt-1">Want to make it a goal? <span className="font-bold">Find one thing to work towards</span></p>
              <div className="flex gap-1.5 mt-3">
                <span className="text-sm px-3.5 py-1.5 rounded-full border border-brand/30 bg-brand-soft text-brand-deep">Make it a goal</span>
                <span className="text-sm px-3.5 py-1.5 rounded-full border border-line bg-surface text-soft">Not now</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* why it exists: the founder's own reason, in a few lines */}
      <section id="why" className="bg-surface border-y border-line px-6 md:px-16 py-24">
        <Reveal className="max-w-2xl mx-auto">
          <p className="text-sm text-brand mb-4">Why Moiré</p>
          <p className="font-display text-3xl md:text-4xl font-medium leading-snug text-balance">
            “I’d brain dump in my journal and feel better for a moment. Then nothing came of it, and the things I wrote I needed to do, I’d soon forget.”
          </p>
          <p className="text-soft leading-relaxed mt-6">
            Moiré is the journal I wanted: one where writing something down is the start of it, not the end.
          </p>
          <p className="text-sm text-faint mt-4">Keyue, maker of Moiré</p>
        </Reveal>
      </section>

      {/* questions people actually ask about a journal like this */}
      <section id="faq" className="px-6 md:px-16 pb-24">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <h2 className="text-4xl md:text-5xl font-medium font-display mb-8">Questions</h2>
          </Reveal>
          <div className="divide-y divide-line border-y border-line">
            {[
              ["Is this a to-do app?", "No. You just write. Moiré suggests what might be worth holding onto, and you decide. Nothing is added without you."],
              ["Will it nag me?", "It checks in rarely, backs off when you ignore it, and anything can be snoozed or let go in a tap."],
              ["Does Moiré set goals for me?", "No. When something keeps coming up in your writing, it may ask if you want to make it a goal. You decide."],
              ["Who can read my entries?", "Only you can see your journal. To find your open loops and themes, entries are processed by OpenAI’s API. You can delete any entry at any time."],
              ["What if I don’t write every day?", "That’s fine. Moiré shows what’s still open when you come back, and your Sunday look back catches you up."],
            ].map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-bold text-[15px]">
                  {q}
                  <span className="text-faint text-xl leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="text-soft leading-relaxed mt-3 text-[15px]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-24 pt-4 px-8 text-center">
        <Reveal>
          <p className="font-display text-4xl md:text-5xl font-medium mb-8 text-balance">Nothing to tag. Nothing to organise. Just write.</p>
          <Link href="/sign-up" className="inline-block px-10 py-3.5 text-sm bg-brand text-white rounded-full hover:bg-brand-deep transition-colors shadow-soft">
            Start writing →
          </Link>
        </Reveal>
      </section>
    </div>
    </MotionConfig>
  )
}
