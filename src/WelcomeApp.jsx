import React, { useState, useEffect } from 'react'
import './app.css'

export default function WelcomeApp() {
  const [step, setStep] = useState(0) // 0: welcome, 1: permissions, 2: shortcuts
  const [permissions, setPermissions] = useState({ screen: false, accessibility: false })
  const [checking, setChecking] = useState(false)
  const [triedShortcuts, setTriedShortcuts] = useState({ screenshot: false, chat: false })
  const [eyebrowWiggle, setEyebrowWiggle] = useState(false)

  useEffect(() => {
    const times = [500, 3500, 6500]
    const timers = times.map(t => setTimeout(() => {
      setEyebrowWiggle(true)
      setTimeout(() => setEyebrowWiggle(false), 1200)
    }, t))
    return () => timers.forEach(clearTimeout)
  }, [])

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
    window.electronAPI?.welcomeDone()
  }

  const handleClose = () => {
    window.electronAPI?.closeChatWindow?.()
    window.close()
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
            <p className="welcome-desc">Snap it, ask it, right here.</p>
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
                  <button className="perm-grant" onClick={() => window.electronAPI?.openPermissionSettings('screen')}>
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
          </div>
        )}

        {step === 2 && (
          <div className="welcome-step">
            <h2 className="welcome-subtitle">Shortcuts</h2>
            <p className="welcome-desc">Glimpse runs in the background.<br/>Press each shortcut to try it out.</p>

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
                  <div className="shortcut-name">Screenshot</div>
                  <div className="shortcut-desc">Capture, annotate, and ask about anything on screen</div>
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
                  <div className="shortcut-name">Quick chat</div>
                  <div className="shortcut-desc">Start a chat, auto-grabs selected text</div>
                </div>
                <div className="shortcut-keys">
                  <kbd>Cmd</kbd><kbd>Shift</kbd><kbd>C</kbd>
                </div>
              </div>
            </div>

            <button className="welcome-btn" onClick={handleGetStarted} disabled={!triedShortcuts.screenshot || !triedShortcuts.chat}>
              {triedShortcuts.screenshot && triedShortcuts.chat ? 'Start Using Glimpse' : 'Try both shortcuts to continue'}
            </button>
          </div>
        )}

      </div>
      <div className="welcome-footer">
        <div className="welcome-dots">
          {[0, 1, 2].map(i => (
            <div key={i} className={`welcome-dot ${step === i ? 'active' : ''}`} onClick={() => { if (i <= step) setStep(i) }} />
          ))}
        </div>
        <button className="welcome-esc" onClick={handleClose}>ESC to close</button>
      </div>
    </div>
  )
}
