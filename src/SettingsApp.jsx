import React, { useState, useEffect } from 'react'
import './app.css'

export default function SettingsApp() {
  const [apiKeys, setApiKeys] = useState({ ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', hasAnyKey: false, isInvite: false })
  const [prefs, setPrefs] = useState({ launchAtLogin: false, saveLocation: 'ask', savePath: '' })
  const [editingKey, setEditingKey] = useState(null) // 'anthropic' | 'gemini' | null
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [keySaved, setKeySaved] = useState(null) // provider id that was just saved
  const [keyError, setKeyError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const keys = await window.electronAPI?.getApiKeys()
    if (keys) setApiKeys(keys)
    const p = await window.electronAPI?.getPreferences()
    if (p) setPrefs(p)
  }

  const handleDeleteKey = async (provider) => {
    await window.electronAPI?.deleteApiKey(provider)
    loadData()
  }

  const handleSaveKey = async (provider) => {
    if (!keyInput.trim()) return
    setSaving(true)
    setKeyError('')
    const keys = {}
    if (provider === 'anthropic') keys.ANTHROPIC_API_KEY = keyInput.trim()
    if (provider === 'gemini') keys.GEMINI_API_KEY = keyInput.trim()
    if (provider === 'openai') keys.OPENAI_API_KEY = keyInput.trim()
    const result = await window.electronAPI?.saveApiKeys(keys)
    setSaving(false)
    if (result?.success) {
      setEditingKey(null)
      setKeyInput('')
      setKeySaved(provider)
      setTimeout(() => setKeySaved(null), 1500)
      loadData()
      window.electronAPI?.notifyProvidersChanged?.()
    } else {
      setKeyError(result?.error || 'Invalid key')
    }
  }

  const handleToggleLaunchAtLogin = async () => {
    const newVal = !prefs.launchAtLogin
    await window.electronAPI?.setPreference('launchAtLogin', newVal)
    setPrefs(p => ({ ...p, launchAtLogin: newVal }))
  }

  const handleSaveLocationChange = async (value) => {
    if (value === 'folder') {
      const result = await window.electronAPI?.selectFolder()
      if (result) {
        await window.electronAPI?.setPreference('saveLocation', 'folder')
        await window.electronAPI?.setPreference('savePath', result)
        setPrefs(p => ({ ...p, saveLocation: 'folder', savePath: result }))
      }
    } else {
      await window.electronAPI?.setPreference('saveLocation', 'ask')
      setPrefs(p => ({ ...p, saveLocation: 'ask', savePath: '' }))
    }
  }

  const handleClose = () => {
    window.electronAPI?.closeSettings?.()
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="settings-app">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <button className="settings-close" onClick={handleClose}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="settings-content">
        {/* API Keys */}
        <div className="settings-section">
          <h2 className="settings-section-title">API Keys</h2>

          {apiKeys.isInvite && (
            <div className="settings-invite-row">
              <span className="settings-invite-badge">Using invite code</span>
              <button className="settings-btn-sm" onClick={async () => {
                await window.electronAPI?.deleteApiKey('invite')
                loadData()
              }}>Use my own keys</button>
            </div>
          )}
          {!apiKeys.isInvite && (
            <>
              {[
                { id: 'anthropic', label: 'Anthropic', keyField: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-...' },
                { id: 'gemini', label: 'Gemini', keyField: 'GEMINI_API_KEY', placeholder: 'AIza...' },
                { id: 'openai', label: 'OpenAI', keyField: 'OPENAI_API_KEY', placeholder: 'sk-...' },
              ].map(p => (
                <div key={p.id} className="settings-key-row">
                  <div className="settings-key-info">
                    <span className="settings-key-label">{p.label}</span>
                    <span className={`settings-key-value ${keySaved === p.id ? 'key-saved' : ''}`}>
                      {keySaved === p.id ? '✓ Saved' : (apiKeys[p.keyField] || 'Not configured')}
                    </span>
                  </div>
                  {editingKey === p.id ? (
                    <div className="settings-key-edit">
                      <input
                        type="password"
                        placeholder={p.placeholder}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveKey(p.id)}
                        autoFocus
                        spellCheck={false}
                      />
                      <div className="settings-key-actions">
                        <button className="settings-btn-sm" onClick={() => handleSaveKey(p.id)} disabled={saving}>
                          {saving ? '...' : 'Save'}
                        </button>
                        <button className="settings-btn-sm cancel" onClick={() => { setEditingKey(null); setKeyInput(''); setKeyError('') }}>Cancel</button>
                      </div>
                      {keyError && <div className="settings-key-error">{keyError}</div>}
                    </div>
                  ) : (
                    <div className="settings-key-actions">
                      <button className="settings-btn-sm" onClick={() => { setEditingKey(p.id); setKeyInput(''); setKeyError('') }}>
                        {apiKeys[p.keyField] ? 'Update' : 'Add'}
                      </button>
                      {apiKeys[p.keyField] && (
                        <button className="settings-btn-sm danger" onClick={() => handleDeleteKey(p.id)}>Delete</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Preferences */}
        <div className="settings-section">
          <h2 className="settings-section-title">Preferences</h2>

          <div className="settings-pref-row">
            <span className="settings-pref-label">Launch at login</span>
            <button
              className={`settings-toggle ${prefs.launchAtLogin ? 'on' : ''}`}
              onClick={handleToggleLaunchAtLogin}
            >
              <div className="settings-toggle-knob" />
            </button>
          </div>

          <div className="settings-pref-row">
            <span className="settings-pref-label">Save screenshots to</span>
            <div className="settings-save-options">
              <button
                className={`settings-btn-sm ${prefs.saveLocation === 'ask' ? 'active' : ''}`}
                onClick={() => handleSaveLocationChange('ask')}
              >
                Ask each time
              </button>
              <button
                className={`settings-btn-sm ${prefs.saveLocation === 'folder' ? 'active' : ''}`}
                onClick={() => handleSaveLocationChange('folder')}
              >
                {prefs.saveLocation === 'folder' && prefs.savePath
                  ? `/${prefs.savePath.split('/').pop()}`
                  : 'Choose folder'}
              </button>
            </div>
          </div>
        </div>

        {/* Shortcuts */}
        <div className="settings-section">
          <h2 className="settings-section-title">Shortcuts</h2>
          <div className="settings-shortcut-row">
            <span className="settings-pref-label">Screenshot</span>
            <span className="settings-shortcut-keys"><kbd>Cmd</kbd><kbd>Shift</kbd><kbd>Z</kbd></span>
          </div>
          <div className="settings-shortcut-row">
            <div className="settings-shortcut-info">
              <span className="settings-pref-label">Quick chat</span>
              <span className="settings-shortcut-hint">Tip: Select text, then press to ask about it</span>
            </div>
            <span className="settings-shortcut-keys"><kbd>Cmd</kbd><kbd>Shift</kbd><kbd>X</kbd></span>
          </div>
        </div>
      </div>
    </div>
  )
}
