import React, { useState, useEffect } from 'react'
import './app.css'

export default function WelcomeApp() {
  const [step, setStep] = useState(() => {
    const saved = localStorage.getItem('welcome-step')
    return saved ? parseInt(saved, 10) : 0
  })
  const [permissions, setPermissions] = useState({ screen: false, accessibility: false })
  const [checking, setChecking] = useState(false)
  const [triedShortcuts, setTriedShortcuts] = useState({ screenshot: false, chat: false })
  const [showShortcutSkip, setShowShortcutSkip] = useState(false)
  const [eyebrowWiggle, setEyebrowWiggle] = useState(true)

  // Auto-wiggle on first load
  useEffect(() => {
    const timer = setTimeout(() => setEyebrowWiggle(false), 1200)
    return () => clearTimeout(timer)
  }, [])
  const [pinnedEgg, setPinnedEgg] = useState(false)

  // Show skip link on shortcuts page after timeout
  useEffect(() => {
    if (step === 2) {
      const timer = setTimeout(() => setShowShortcutSkip(true), 10000)
      return () => clearTimeout(timer)
    }
  }, [step])

  // Persist step across restarts
  useEffect(() => {
    localStorage.setItem('welcome-step', step.toString())
  }, [step])

  const checkPermissions = async () => {
    setChecking(true)
    const result = await window.electronAPI?.checkPermissions()
    if (result) setPermissions(result)
    setChecking(false)
  }

  useEffect(() => {
    checkPermissions()
    const interval = setInterval(checkPermissions, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    window.electronAPI?.onShortcutTried?.((type) => {
      setTriedShortcuts(prev => ({ ...prev, [type]: true }))
    })
  }, [])

  const allGranted = permissions.screen && permissions.accessibility

  const handleGetStarted = () => {
    localStorage.removeItem('welcome-step')
    window.electronAPI?.welcomeDone()
  }

  const handleClose = () => {
    window.electronAPI?.closeWelcome?.()
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="welcome-app">
      <div className="welcome-drag-bar">
        <button className="welcome-close" onClick={handleClose}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="welcome-content">
        {step === 0 && (
          <div className="welcome-step">
            <div
              className={`welcome-logo glimpse-icon-fixed ${eyebrowWiggle ? 'glimpse-loading' : ''}`}
              onClick={() => { setEyebrowWiggle(true); setTimeout(() => setEyebrowWiggle(false), 1200) }}
              style={{ cursor: 'pointer' }}
            >
              <svg viewBox="60 140 420 280" width={64} height={43}>
                <path d="M104.539 204.375C153.938 173.009 385 145.971 437.19 251.313" fill="none" stroke="#6C63FF" strokeWidth="20" strokeLinecap="round" />
                <path d="M262 374.28C230.253 373.396 178.271 361.552 128 321.247C177.587 275.666 316.314 196.628 390.289 269.765C467.605 346.206 348.474 380.522 321.426 374.28C237.073 368.093 260.551 273.518 321.426 278.821C382.301 284.124 362.664 347.764 321.426 331.854" fill="none" stroke="#6C63FF" strokeWidth="22" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="welcome-title">Welcome to Glimpse</h1>
            <p className="welcome-desc">Snap it. Ask it. Never lose your flow.</p>
            <button className="welcome-btn" onClick={() => setStep(1)}>Get Started</button>
          </div>
        )}

        {step === 1 && (
          <div className="welcome-step">
            <h2 className="welcome-subtitle">Permissions</h2>
            <p className="welcome-desc">Glimpse needs two permissions to work properly.</p>

            <div className="welcome-permissions">
              <div className={`welcome-perm ${permissions.screen ? 'granted' : ''}`}>
                <div className="perm-icon">
                  {permissions.screen ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#34c759" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                  )}
                </div>
                <div className="perm-info">
                  <div className="perm-name">Screen Recording</div>
                  <div className="perm-why">Required to capture screenshots</div>
                </div>
                {!permissions.screen && (
                  <button className="perm-grant" onClick={async () => {
                    const result = await window.electronAPI?.requestScreenPermission()
                    if (result?.granted) checkPermissions()
                  }}>
                    Grant
                  </button>
                )}
              </div>

              <div className={`welcome-perm ${permissions.accessibility ? 'granted' : ''}`}>
                <div className="perm-icon">
                  {permissions.accessibility ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#34c759" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                  )}
                </div>
                <div className="perm-info">
                  <div className="perm-name">Accessibility</div>
                  <div className="perm-why">Required for global keyboard shortcuts</div>
                </div>
                {!permissions.accessibility && (
                  <button className="perm-grant" onClick={() => window.electronAPI?.openPermissionSettings('accessibility')}>
                    Grant
                  </button>
                )}
              </div>
            </div>

            <button className="welcome-btn" onClick={() => setStep(2)} disabled={!allGranted}>
              {allGranted ? 'Continue' : 'Waiting for permissions...'}
            </button>
            <div style={{ minHeight: 28 }}>
              {!allGranted && (
                <button className="welcome-skip-link" onClick={() => setStep(2)}>
                  I've granted permissions, continue
                </button>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="welcome-step">
            <h2 className="welcome-subtitle">Two ways to start</h2>
            <p className="welcome-desc">Try each shortcut now.</p>

            <div className="welcome-shortcuts">
              <div className={`shortcut-row ${triedShortcuts.screenshot ? 'shortcut-done' : !triedShortcuts.screenshot ? 'shortcut-pulse' : ''}`}>
                <div className="shortcut-status">
                  {triedShortcuts.screenshot ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#34c759" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8"/></svg>
                  )}
                </div>
                <div className="shortcut-info">
                  <div className="shortcut-name">Start with a screenshot</div>
                  <div className="shortcut-desc">Capture, annotate, ask AI</div>
                </div>
                <div className="shortcut-keys">
                  <kbd>Cmd</kbd><kbd>Shift</kbd><kbd>Z</kbd>
                </div>
              </div>
              <div className={`shortcut-row ${triedShortcuts.chat ? 'shortcut-done' : triedShortcuts.screenshot ? 'shortcut-pulse' : ''}`}>
                <div className="shortcut-status">
                  {triedShortcuts.chat ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#34c759" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8"/></svg>
                  )}
                </div>
                <div className="shortcut-info">
                  <div className="shortcut-name">Start with text</div>
                  <div className="shortcut-desc">Select text, ask AI about it</div>
                </div>
                <div className="shortcut-keys">
                  <kbd>Cmd</kbd><kbd>Shift</kbd><kbd>X</kbd>
                </div>
              </div>
            </div>

            <button className="welcome-btn" onClick={() => setStep(3)} disabled={!triedShortcuts.screenshot || !triedShortcuts.chat}>
              {triedShortcuts.screenshot && triedShortcuts.chat ? 'Continue' : 'Try both shortcuts to continue'}
            </button>
            <div style={{ minHeight: 28 }}>
              {showShortcutSkip && !(triedShortcuts.screenshot && triedShortcuts.chat) && (
                <button className="welcome-skip-link" onClick={() => setStep(3)}>
                  Shortcuts not working? Continue anyway
                </button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="welcome-step">
            <h2 className="welcome-subtitle">Pin to screen</h2>
            <p className="welcome-desc">Keep the chat visible while you work.</p>

            <div className="welcome-features">
              <div
                className={`welcome-feature-row ${pinnedEgg ? 'welcome-feature-pinned' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setPinnedEgg(p => !p)}
              >
                <div className="welcome-feature-icon">
                  <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={pinnedEgg ? '#00E5FF' : '#00E5FF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 17v5" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
                  </svg>
                </div>
                <div className="welcome-feature-info">
                  <div className="welcome-feature-name">{pinnedEgg ? 'Pinned!' : 'Pin your chat'}</div>
                  <div className="welcome-feature-desc">{pinnedEgg ? 'You got it. Now go build something.' : 'Click the pin icon to pop out as a floating window'}</div>
                </div>
              </div>
            </div>

            <button className="welcome-btn" onClick={handleGetStarted}>Start Using Glimpse</button>
          </div>
        )}

      </div>
      <div className="welcome-footer">
        <div className="welcome-dots">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`welcome-dot ${step === i ? 'active' : ''}`} onClick={() => { if (i <= step) setStep(i) }} />
          ))}
        </div>
      </div>
    </div>
  )
}
