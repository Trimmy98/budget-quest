import React, { useState, useEffect, useRef } from 'react'

const MOODS = {
  ecstatic: { face: '🤩', bg: 'linear-gradient(135deg, #ffd93d, #ff9500)', glow: '#ffd93d' },
  happy: { face: '😊', bg: 'linear-gradient(135deg, #00ff87, #00cc6a)', glow: '#00ff87' },
  cool: { face: '😎', bg: 'linear-gradient(135deg, #00f0ff, #0080ff)', glow: '#00f0ff' },
  thinking: { face: '🤔', bg: 'linear-gradient(135deg, #a78bfa, #7c3aed)', glow: '#a78bfa' },
  worried: { face: '😰', bg: 'linear-gradient(135deg, #ffd93d, #f59e0b)', glow: '#ffd93d' },
  alarmed: { face: '😱', bg: 'linear-gradient(135deg, #ff6b6b, #dc2626)', glow: '#ff6b6b' },
  sleeping: { face: '😴', bg: 'linear-gradient(135deg, #475569, #1e293b)', glow: '#475569' },
  celebrating: { face: '🥳', bg: 'linear-gradient(135deg, #ff79c6, #ff5599)', glow: '#ff79c6' },
  motivated: { face: '💪', bg: 'linear-gradient(135deg, #00f0ff, #00ff87)', glow: '#00f0ff' },
}

function getMood(savingsRate, streak, hour) {
  if (hour >= 0 && hour < 6) return 'sleeping'
  if (savingsRate >= 0.3) return 'ecstatic'
  if (savingsRate >= 0.2) return 'happy'
  if (streak >= 7) return 'celebrating'
  if (savingsRate >= 0.1) return 'cool'
  if (savingsRate >= 0) return 'thinking'
  if (savingsRate >= -0.1) return 'worried'
  return 'alarmed'
}

function getMessages(savingsRate, streak, expenseCount, perDay, hour, symbol) {
  const messages = []

  // ====== NATT (00-06) ======
  if (hour >= 0 && hour < 6) {
    messages.push('Zzz... drömmer om ränta-på-ränta... 💤')
    messages.push('*mumlar i sömnen* ...spara... mer... zzz...')
    messages.push('Shh! Pengarna sover. Väck dem inte. 🤫')
    return messages
  }

  // ====== MORGON (06-10) ======
  if (hour >= 6 && hour < 10) {
    messages.push('Gomorron! Plånboken är laddad och redo! ☀️')
    messages.push('Kaffe först, budgetera sen. Prioriteringar. ☕')
    messages.push('Fun fact: Du tjänar pengar medan du läser detta. Typ. 🧠')
  }

  // ====== LUNCH (11-13) ======
  if (hour >= 11 && hour < 13) {
    messages.push('Lunch! Matlåda = +50 style points 🍱')
    messages.push('Restaurang? Jag dömer inte... men plånboken gör det 👀')
  }

  // ====== EFTERMIDDAG (15-17) ======
  if (hour >= 15 && hour < 17) {
    messages.push('Fika-dags! En hemmabrygd sparar ~40kr 🧇')
    messages.push('Fredagsmyset närmar sig... RIP budgeten? 😬')
  }

  // ====== KVÄLL (20-00) ======
  if (hour >= 20) {
    messages.push('Nattsurf-shopping? Lägg ner mobilen. Jag ser dig. 👁️')
    messages.push('Sov gott! Imorgon sparar vi världen. Eller 50kr. 🌙')
    messages.push('Pro tip: Handla aldrig online efter kl 22. Trust me. 🛒')
  }

  // ====== SPARKVOT ======
  if (savingsRate >= 0.35) {
    messages.push('Du sparar mer än Warren Buffett i procent. Respekt. 🐐')
    messages.push('35%+?! Ska vi byta plats? Du kan vara maskoten. 👑')
    messages.push('Bankerna HATAR detta trick (att du sparar så mycket) 💎')
  } else if (savingsRate >= 0.25) {
    messages.push('25%+ sparkvot — du är basically en ekonomisk atlet 🏅')
    messages.push('Din framtida version skickar just nu ett tackkort 💌')
    messages.push('Du gör mig stolt. Och jag är en emoji. Det säger nåt. 🥲')
  } else if (savingsRate >= 0.2) {
    messages.push('20%-regeln? Check! Du är officiellt en vuxen ✅')
    messages.push('Ekonomer överallt nickar godkännande åt dig just nu 📈')
  } else if (savingsRate >= 0.1) {
    messages.push('10% — bra start! Men jag vet att du kan mer 🚀')
    messages.push('Halvvägs till guldstandarden! Pusha lite till! 🎯')
    messages.push('Varje procent räknas. Du är på väg uppåt! 📊')
  } else if (savingsRate >= 0) {
    messages.push('Det går runt! Men "gå runt" är inte ett livsmål 🎡')
    messages.push('Noll i minus — glas halvfullt! Eller halvtomt. Hmm. 🤷')
    messages.push('Tips: Hitta EN sak du kan skippa denna vecka 🔍')
  } else if (savingsRate >= -0.1) {
    messages.push('Lite rött... som en solnedgång. Fast med pengar. 🌅')
    messages.push('Vi blöder lite. Finns det en prenumeration vi glömt? 🩹')
    messages.push('Ingen panik! Men kanske lite mini-panik. Lagom panik. 😅')
  } else {
    messages.push('DEFCON 1! Pengarna flyr! Stäng alla appar med köpknappar! 🚨')
    messages.push('Houston, vi har ett budgetproblem. Över. 🛸')
    messages.push('Okej deep breath. Vi fixar detta. Steg 1: Sluta shoppa. 🫣')
    messages.push('Jag vill inte oroa dig men... *pekar på budgeten* 📉')
  }

  // ====== STREAK ======
  if (streak >= 30) {
    messages.push(`${streak} dagars streak! Du är mer pålitlig än min väckarklocka 🔥🔥🔥`)
    messages.push(`${streak} dagar?! Du förtjänar en staty. Av guld. Budgeterat guld. 🏆`)
  } else if (streak >= 14) {
    messages.push(`${streak} dagars streak! Du och budgeten — name a better duo 🤖`)
  } else if (streak >= 7) {
    messages.push('En hel veckas streak! Du är officiellt hooked! 🎣')
  } else if (streak >= 3) {
    messages.push(`${streak} dagar i rad! Tre-i-rad, fast med pengar! 🎰`)
  } else if (streak === 0 && expenseCount > 0) {
    messages.push('Streaken dog... men som en fågel Fenix, res dig igen! 🔥')
  } else if (streak === 0) {
    messages.push('Psst! Logga en utgift, så startar vi en streak! ⚡')
  }

  // ====== DAGLIG BUDGET ======
  if (perDay !== undefined && perDay !== null && !isNaN(perDay) && isFinite(perDay)) {
    if (perDay > 500) {
      messages.push(`${perDay.toFixed(0)}${symbol}/dag kvar — du simmar i det! 🏊`)
    } else if (perDay > 100) {
      messages.push(`${perDay.toFixed(0)}${symbol}/dag — nice, det räcker till mer än nudlar 🍜`)
    } else if (perDay > 0) {
      messages.push(`${perDay.toFixed(0)}${symbol}/dag kvar. Varje köp är ett strategiskt beslut nu 🎯`)
    } else {
      messages.push('Dagbudgeten tog slut. Vi lever på luft och kärlek nu 🫠')
    }
  }

  // ====== ANTAL UTGIFTER ======
  if (expenseCount >= 100) {
    messages.push('100+ loggningar! Du har mer data än riksbanken 📊')
  } else if (expenseCount >= 50) {
    messages.push('50+ loggade! Du ser mönster som Neo i Matrix 🟢')
  } else if (expenseCount >= 10) {
    messages.push('Bra loggat! Ju mer data, desto smartare beslut 🧠')
  }

  // ====== SLUMPADE ROLIGA ======
  const funFacts = [
    'Visste du att impulsköp står för ~40% av onlineshopping? Skrämmande. 😱',
    'Att vänta 24h innan ett köp eliminerar 70% av impulsköpen! 🧊',
    'Rika människor kollar sin budget oftare. Coincidence? I think not. 🕵️',
    'Du har klickat på mig. +0 XP men +100 charm 💅',
    'Jag är stolt över dig. Oavsett budget. Men extra stolt med budget. 🤗',
    'Plot twist: Den rikaste personen i rummet är den som behöver minst 🧘',
    'Prenumerationer är som vampyrer. De suger långsamt. Granska dem! 🧛',
  ]
  // Lägg till 2 slumpade fun facts
  const shuffled = funFacts.sort(() => 0.5 - Math.random())
  messages.push(shuffled[0])
  if (shuffled[1]) messages.push(shuffled[1])

  return messages
}

export default function Mascot({ savingsRate = 0, streak = 0, expenseCount = 0, perDay, symbol = '€' }) {
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const [showBubble, setShowBubble] = useState(false)
  const [bouncing, setBouncing] = useState(false)
  const [position, setPosition] = useState({ bottom: 80, right: 16 })
  const timeoutRef = useRef(null)
  const messageIndexRef = useRef(0)

  const hour = new Date().getHours()
  const moodKey = getMood(savingsRate, streak, hour)
  const mood = MOODS[moodKey]
  const allMessages = getMessages(savingsRate, streak, expenseCount, perDay, hour, symbol)
  const messagesRef = useRef(allMessages)
  messagesRef.current = allMessages

  // Show a message periodically
  useEffect(() => {
    function showRandomMessage() {
      const msgs = messagesRef.current
      const msg = msgs[messageIndexRef.current % msgs.length]
      messageIndexRef.current++
      setMessage(msg)
      setShowBubble(true)
      setBouncing(true)
      setTimeout(() => setBouncing(false), 600)

      timeoutRef.current = setTimeout(() => {
        setShowBubble(false)
      }, 6000)
    }

    // Show first message after 2 seconds
    const initial = setTimeout(showRandomMessage, 2000)

    // Then every 30 seconds
    const interval = setInterval(showRandomMessage, 30000)

    return () => {
      clearTimeout(initial)
      clearInterval(interval)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [savingsRate, streak, expenseCount])

  function handleClick() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    const msgs = messagesRef.current
    const msg = msgs[messageIndexRef.current % msgs.length]
    messageIndexRef.current++
    setMessage(msg)
    setShowBubble(true)
    setBouncing(true)
    setTimeout(() => setBouncing(false), 600)
    timeoutRef.current = setTimeout(() => setShowBubble(false), 5000)
  }

  return (
    <>
      <style>{`
        @keyframes mascot-bounce {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-8px); }
          50% { transform: translateY(0); }
          75% { transform: translateY(-4px); }
        }
        @keyframes mascot-idle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes bubble-in {
          0% { opacity: 0; transform: scale(0.8) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 15px var(--glow-color); }
          50% { box-shadow: 0 0 25px var(--glow-color), 0 0 40px var(--glow-color); }
        }
      `}</style>

      {/* Speech bubble */}
      {showBubble && message && (
        <div style={{
          position: 'fixed',
          bottom: position.bottom + 60,
          right: position.right,
          maxWidth: 220,
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: `1px solid ${mood.glow}60`,
          borderRadius: '16px 16px 4px 16px',
          padding: '10px 14px',
          zIndex: 99,
          animation: 'bubble-in 0.3s ease-out',
          boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 10px ${mood.glow}20`,
        }}>
          <div style={{
            fontSize: 12,
            color: '#e2e8f0',
            lineHeight: 1.5,
            fontFamily: 'Outfit, sans-serif',
          }}>
            {message}
          </div>
          {/* Triangle pointer */}
          <div style={{
            position: 'absolute',
            bottom: -8,
            right: 20,
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: `8px solid #0f172a`,
          }} />
        </div>
      )}

      {/* Mascot character */}
      <div
        onClick={handleClick}
        style={{
          '--glow-color': `${mood.glow}40`,
          position: 'fixed',
          bottom: position.bottom,
          right: position.right,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: mood.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 99,
          animation: bouncing
            ? 'mascot-bounce 0.6s ease-out'
            : 'mascot-idle 3s ease-in-out infinite',
          boxShadow: `0 4px 15px ${mood.glow}60`,
          border: `2px solid ${mood.glow}`,
          transition: 'background 0.5s ease',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 26, lineHeight: 1 }}>{mood.face}</span>
      </div>

      {/* Mood indicator dot */}
      <div style={{
        position: 'fixed',
        bottom: position.bottom - 2,
        right: position.right - 2,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: mood.glow,
        border: '2px solid #020617',
        zIndex: 99,
        animation: 'glow-pulse 2s ease-in-out infinite',
        '--glow-color': `${mood.glow}60`,
      }} />
    </>
  )
}
