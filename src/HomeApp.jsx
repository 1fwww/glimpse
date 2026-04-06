import React, { useState, useEffect } from 'react'
import './app.css'

export default function HomeApp() {
  const [recentThreads, setRecentThreads] = useState([])
  const [eyebrowWiggle, setEyebrowWiggle] = useState(false)

  useEffect(() => {
    window.electronAPI?.getThreads?.().then(threads => {
      setRecentThreads((threads || []).slice(0, 5))
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') window.electronAPI?.closeHome?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const formatTime = (ts) => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="home-app">
      <div className="home-drag-bar">
        <button className="home-close" onClick={() => window.electronAPI?.closeHome?.()}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="home-brand">
        <div
          className={`glimpse-icon-fixed ${eyebrowWiggle ? 'glimpse-loading' : ''}`}
          onClick={() => { setEyebrowWiggle(true); setTimeout(() => setEyebrowWiggle(false), 1200) }}
          style={{ cursor: 'pointer', WebkitAppRegion: 'no-drag' }}
        >
          <svg viewBox="60 140 420 280" width={52} height={35}>
            <path d="M104.539 204.375C153.938 173.009 385 145.971 437.19 251.313" fill="none" stroke="#6C63FF" strokeWidth="20" strokeLinecap="round" />
            <path d="M262 374.28C230.253 373.396 178.271 361.552 128 321.247C177.587 275.666 316.314 196.628 390.289 269.765C467.605 346.206 348.474 380.522 321.426 374.28C237.073 368.093 260.551 273.518 321.426 278.821C382.301 284.124 362.664 347.764 321.426 331.854" fill="none" stroke="#6C63FF" strokeWidth="22" strokeLinecap="round" />
          </svg>
        </div>
        <span className="home-brand-name">Glimpse</span>
      </div>

      <div className="home-sections">
        <div className="home-section">
          <span className="home-section-label">Shortcuts</span>
          <div className="home-section-content">
            <div className="home-shortcut-row">
              <span className="home-sc-text">Screenshot</span>
              <span className="home-sc-keys"><kbd>Cmd</kbd><kbd>Shift</kbd><kbd>Z</kbd></span>
            </div>
            <div className="home-shortcut-row">
              <span className="home-sc-text">Quick chat</span>
              <span className="home-sc-keys"><kbd>Cmd</kbd><kbd>Shift</kbd><kbd>X</kbd></span>
            </div>
          </div>
        </div>

        <div className="home-section">
          <span className="home-section-label">Recent Chats</span>
          <div className="home-section-content home-recents-list">
            {recentThreads.length > 0 ? (
              recentThreads.map(t => (
                <button key={t.id} className="home-recent-item" onClick={() => window.electronAPI?.openThreadInChat?.(t.id)}>
                  <svg className="home-recent-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="home-recent-title">{t.title}</span>
                  <span className="home-recent-time">{formatTime(t.updatedAt)}</span>
                </button>
              ))
            ) : (
              <span className="home-empty">No chats yet. Try a shortcut to get started.</span>
            )}
            {recentThreads.length > 0 && (
              <button className="home-clear-btn" onClick={async () => {
                for (const t of recentThreads) await window.electronAPI?.deleteThread(t.id)
                setRecentThreads([])
              }}>Clear all chats</button>
            )}
          </div>
        </div>
      </div>
      <div className="home-footer">
        <button className="home-footer-link" onClick={() => window.electronAPI?.openSettings()}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  )
}
