"use client"
import { useState, useEffect } from 'react'
import Link from 'next/link'
import DemoGraph from '@/components/DemoGraph'
import { motion } from 'framer-motion'

export default function Home() {
  const [displayedText, setDisplayedText] = useState('')
  const [showCursor, setShowCursor] = useState(true)
  const fullText = 'See what defines you'

  useEffect(() => {
    let currentIndex = 0
    const typingInterval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setDisplayedText(fullText.slice(0, currentIndex))
        currentIndex++
      } else {
        clearInterval(typingInterval)
        setShowCursor(false)
      }
    }, 60)

    return () => clearInterval(typingInterval)
  }, [])

  useEffect(() => {
    if (displayedText.length === fullText.length) return
    
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev)
    }, 530)

    return () => clearInterval(cursorInterval)
  }, [displayedText])

  return (
    <div className="bg-page">
      <header className="fixed top-0 w-full z-50 py-5 px-8 bg-paper/85 backdrop-blur-sm border-b border-line">
        <nav className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="text-[30px] leading-none italic font-medium text-ink font-display">
            Moiré
          </div>
          <div className="flex gap-8 items-center">
            <a href="#hero" className="text-soft hover:text-ink transition">
              Overview
            </a>
            <a href="#how-it-works" className="text-soft hover:text-ink transition">
              Design
            </a>
            <a href="#features" className="text-soft hover:text-ink transition">
              Clarity
            </a>
            <Link
              href="/sign-in"
              className="px-6 py-2 text-sm bg-brand text-white rounded-full hover:bg-brand-deep transition"
            >
              Sign In
            </Link>
          </div>
        </nav>
      </header>
    
      <section id = "hero" className=" min-h-screen flex items-center min-h-[calc(100vh-80px)] px-8 md:px-16 lg:px-24">
        <div className="max-w-2xl flex-shrink-0">
          <h1 className="mb-6 text-6xl md:text-7xl lg:text-[88px] font-medium leading-[1.05] text-ink font-display">
            {displayedText}
            {showCursor && <span className="text-brand/50" style={{ fontWeight: 400 }}>|</span>}
            {!showCursor && displayedText.length === fullText.length && <span className="text-brand">.</span>}
          </h1>
          <p className="mb-10 text-lg md:text-xl text-soft leading-relaxed max-w-xl">
            Turn your thoughts into insight. <span className="text-brand italic">Discover</span> recurring themes and intentions, and notice what shapes <span className="text-brand italic">you</span> over time.
          </p>
          <div className="flex gap-4 flex-wrap">
            <Link 
              href="/sign-up" 
              className="px-10 py-3.5 text-sm bg-brand text-white rounded-full hover:bg-brand-deep transition-colors duration-300 shadow-soft"
            >
              Get Started →
            </Link>
            <Link 
              href="/sign-in" 
              className="px-10 py-3.5 text-sm bg-surface border border-line text-soft rounded-full hover:bg-hush transition-colors duration-300"
            >
              Sign In
            </Link>
          </div>
        </div>
        <div className="flex-1 h-[700px] ml-16 hidden lg:block mt-12">
          <DemoGraph />
        </div>
      </section>
      <motion.section
        initial={{ opacity: 0, y: 80 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2 }}
        viewport={{ once: true, amount: 0.3 }}
      >
        <section id="how-it-works" className="min-h-screen bg-surface border-y border-line flex items-center justify-center px-8">
          <div className="max-w-6xl w-full">
            <h2 className="text-5xl md:text-6xl font-medium text-center mb-16 text-ink font-display">
              From writing to insight
            </h2>
            <div className="grid md:grid-cols-3 gap-12">
              <div className="text-center">
                <h3 className="font-display text-[26px] font-medium mb-3 text-ink">Write freely</h3>
                <p className="text-soft leading-relaxed">Capture unfiltered thoughts, reflections, and moments — no prompts, no pressure.</p>
              </div>
              <div className="text-center">
                <h3 className="font-display text-[26px] font-medium mb-3 text-ink">See connections emerge</h3>
                <p className="text-soft leading-relaxed">Recurring themes, intentions, and ideas surface naturally as your entries build.</p>
              </div>
              <div className="text-center">
                <h3 className="font-display text-[26px] font-medium mb-3 text-ink">Understand yourself over time</h3>
                <p className="text-soft leading-relaxed">Patterns grow clearer, helping you see what consistently matters to you.</p>
              </div>
            </div>
          </div>
        </section>
      </motion.section>
      <motion.section
        initial={{ opacity: 0, y: 80 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2 }}
        viewport={{ once: true, amount: 0.3 }}
      >
        <section id="features" className="min-h-screen bg-paper flex justify-center items-center px-8 md:px-16">
          <div className="flex flex-row gap-20 max-w-5xl w-full items-start">
            <div className="flex-1">
                <h2 className="text-5xl md:text-6xl font-medium mb-6 text-ink font-display">
                  What you'll notice
                </h2>
                <p className="text-lg text-soft leading-relaxed">Over time, your writing forms a clearer picture — without needing to force meaning out of every entry.</p>
            </div>
            <ul className="flex-1 list-disc marker:text-brand pl-5 space-y-6">
              <li>
                <h3 className="font-display text-[24px] font-medium mb-1 text-ink">Recurring themes</h3>
                <p className="text-soft leading-relaxed">Patterns that surface naturally as you write.</p>
              </li>
              <li>
                <h3 className="font-display text-[24px] font-medium mb-1 text-ink">Lasting intentions</h3>
                <p className="text-soft leading-relaxed">Ideas and goals that stay with you.</p>
              </li>
              <li>
                <h3 className="font-display text-[24px] font-medium mb-1 text-ink">Unexpected connections</h3>
                <p className="text-soft leading-relaxed">Links between thoughts that once felt unrelated.</p>
              </li>
              <li>
                <h3 className="font-display text-[24px] font-medium mb-1 text-ink">Change over time</h3>
                <p className="text-soft leading-relaxed">A quiet record of growth and shift.</p>
              </li>
            </ul>
          </div>
        </section>
      </motion.section>
      
      <section className="py-16 px-8 text-center">
        <p className="text-soft text-lg italic">
          Nothing to tag. Nothing to organise. Just write
        </p>
      </section>
    </div>
  )
}
