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
  const hour24 = hour

  // Time-based greetings
  if (hour24 >= 0 && hour24 < 6) {
    messages.push('Zzz... Sov gott! Pengarna vilar också... 💤')
    messages.push('*snarkar*... budget... sparande... zzz...')
    return messages
  }
  if (hour24 >= 6 && hour24 < 10) {
    messages.push('God morgon! Redo att ta tag i ekonomin idag? ☀️')
    messages.push('Ny dag, nya möjligheter att spara! 🌅')
  }
  if (hour24 >= 22) {
    messages.push('Bra jobbat idag! Dags att vila snart 🌙')
    messages.push('Ekonomin sover aldrig, men du borde! 😴')
  }

  // Savings rate messages
  if (savingsRate >= 0.3) {
    messages.push('DU ÄR EN LEGEND! 30%+ sparkvot! 🏆')
    messages.push('Pengarna älskar dig! Fortsätt så här! 💎')
    messages.push('Jag har aldrig sett en så fin budget... *tårögd* 🥲')
    messages.push('Du sparar som ett proffs! Imponerad! 🌟')
  } else if (savingsRate >= 0.2) {
    messages.push('Snyggt! Du klarar 20%-regeln! 🎯')
    messages.push('Ekonomerna hade varit stolta över dig! 📈')
    messages.push('Fortsätt så här, du gör det fantastiskt! ✨')
  } else if (savingsRate >= 0.1) {
    messages.push('Bra start! Kan du pusha till 20%? 🚀')
    messages.push('Du är på väg åt rätt håll! Keep going! 💪')
    messages.push('Lite till så är du i gröna zonen! 🎯')
  } else if (savingsRate >= 0) {
    messages.push('Hmm, det går jämnt ut... Kan vi hitta besparingar? 🔍')
    messages.push('Varje krona räknas! Kolla om du kan skippa något? 💡')
    messages.push('Tips: Börja med att spara lite, sedan öka gradvis! 📊')
  } else {
    messages.push('Ojdå! Vi spenderar mer än vi tjänar... 😬')
    messages.push('MAYDAY! Budgeten behöver akut hjälp! 🚨')
    messages.push('Låt oss hitta var pengarna försvinner! 🔎')
  }

  // Streak messages
  if (streak >= 30) {
    messages.push(`${streak} dagars streak! Du är OSTOPPBAR! 🔥🔥🔥`)
  } else if (streak >= 14) {
    messages.push(`${streak} dagar i rad! Du är en maskin! 🤖`)
  } else if (streak >= 7) {
    messages.push(`En hel veckas streak! Fantastiskt! 🎉`)
  } else if (streak >= 3) {
    messages.push(`${streak} dagars streak! Kör hårt! 🔥`)
  } else if (streak === 0) {
    messages.push('Ingen streak ännu... Logga en utgift för att starta! ⚡')
  }

  // Per day budget
  if (perDay !== undefined && perDay !== null && !isNaN(perDay) && isFinite(perDay)) {
    if (perDay > 100) {
      messages.push(`${perDay.toFixed(0)}${symbol} kvar per dag – gott om utrymme! 😌`)
    } else if (perDay > 0) {
      messages.push(`${perDay.toFixed(0)}${symbol}/dag kvar – tänk innan du handlar! 🤔`)
    } else if (perDay <= 0) {
      messages.push('Budgeten för månaden är slut... Strama åt! 🫣')
    }
  }

  // Expense count
  if (expenseCount >= 100) {
    messages.push('Över 100 loggade utgifter! Du är en DATA-GURU! 📊')
  } else if (expenseCount >= 50) {
    messages.push('50+ utgifter loggade! Du har riktigt bra koll! 📋')
  } else if (expenseCount === 0) {
    messages.push('Inga utgifter ännu? Logga din första! Det ger 25 XP! ⚡')
  }

  // Random motivational
  messages.push('Visste du? Att logga utgifter regelbundet sparar i snitt 15%! 🧠')
  messages.push('En liten utgift idag = en stor besparing imorgon! 🌱')
  messages.push('Du och jag, vi fixar detta tillsammans! 🤝')
  messages.push('Jag tror på dig! Budget Quest champion! 🏅')

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
        @keyframes bubble-out {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.8); }
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
