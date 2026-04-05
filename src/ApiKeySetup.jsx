import React, { useState } from 'react'

export default function ApiKeySetup({ onDone, onSkip }) {
  const [mode, setMode] = useState('keys') // 'keys' or 'invite'
  const [anthropicKey, setAnthropicKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hasInput = mode === 'keys'
    ? (anthropicKey.trim() || geminiKey.trim())
    : inviteCode.trim()

  const handleSave = async () => {
    if (!hasInput) return
    setSaving(true)
    setError('')

    if (mode === 'invite') {
      const result = await window.electronAPI?.validateInviteCode(inviteCode.trim())
      setSaving(false)
      if (result?.success) {
        onDone()
      } else {
        setError(result?.error || 'Invalid invite code')
      }
      return
    }

    const keys = {}
    if (anthropicKey.trim()) keys.ANTHROPIC_API_KEY = anthropicKey.trim()
    if (geminiKey.trim()) keys.GEMINI_API_KEY = geminiKey.trim()
    const result = await window.electronAPI?.saveApiKeys(keys)
    setSaving(false)
    if (result?.success) {
      onDone()
    } else {
      setError(result?.error || 'Failed to save')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && hasInput) handleSave()
  }

  const switchMode = () => {
    setError('')
    setMode(mode === 'keys' ? 'invite' : 'keys')
  }

  return (
    <div className="api-key-setup">
      <div className="api-key-header">
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
        <h2>Glimpse Chat Setup</h2>
      </div>
      <p className="api-key-desc">
        {mode === 'keys'
          ? 'Connect an AI provider to start chatting.'
          : 'Enter your invite code to get started.'}
      </p>

      {mode === 'keys' ? (
        <>
          <div className="api-key-field">
            <label>Anthropic API Key</label>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
            <span className="api-key-hint">
              <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI?.openExternal('https://console.anthropic.com/settings/keys') }}>
                Get key
              </a>
            </span>
          </div>

          <div className="api-key-field">
            <label>Google Gemini API Key</label>
            <input
              type="password"
              placeholder="AIza..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
            <span className="api-key-hint">
              <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI?.openExternal('https://aistudio.google.com/apikey') }}>
                Get key
              </a>
            </span>
          </div>
          <p className="api-key-privacy">Keys are stored locally on this device.</p>
        </>
      ) : (
        <div className="api-key-field">
          <label>Invite Code</label>
          <input
            type="text"
            placeholder="Enter invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoFocus
          />
        </div>
      )}

      {error && <div className="api-key-error">{error}</div>}

      <button
        className="api-key-save"
        onClick={handleSave}
        disabled={!hasInput || saving}
      >
        {saving ? 'Verifying...' : 'Save & Continue'}
      </button>

      <div className="api-key-footer">
        <button className="api-key-link" onClick={switchMode}>
          {mode === 'keys' ? 'Invite code' : 'Use API keys'}
        </button>
        {onSkip && (
          <>
            <span className="api-key-dot">·</span>
            <button className="api-key-link" onClick={onSkip}>Continue without AI</button>
          </>
        )}
      </div>
    </div>
  )
}
