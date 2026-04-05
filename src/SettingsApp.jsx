import React, { useState, useEffect } from 'react'
import './app.css'

export default function SettingsApp() {
  const [apiKeys, setApiKeys] = useState({ ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', hasAnyKey: false, isInvite: false })
  const [prefs, setPrefs] = useState({ launchAtLogin: false, saveLocation: 'ask', savePath: '' })
  const [editingKey, setEditingKey] = useState(null) // 'anthropic' | 'gemini' | null
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
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
    const result = await window.electronAPI?.saveApiKeys(keys)
    setSaving(false)
    if (result?.success) {
      setEditingKey(null)
      setKeyInput('')
      loadData()
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
    <div className="settings-app">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
      </div>
      <div className="settings-content">
        {/* API Keys */}
        <div className="settings-section">
          <h2 className="settings-section-title">API Keys</h2>

          {apiKeys.isInvite ? (
            <div className="settings-invite-badge">Using invite code</div>
          ) : (
            <>
              {/* Anthropic */}
              <div className="settings-key-row">
                <div className="settings-key-info">
                  <span className="settings-key-label">Anthropic</span>
                  <span className="settings-key-value">
                    {apiKeys.ANTHROPIC_API_KEY || 'Not configured'}
                  </span>
                </div>
                {editingKey === 'anthropic' ? (
                  <div className="settings-key-edit">
                    <input
                      type="password"
                      placeholder="sk-ant-..."
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveKey('anthropic')}
                      autoFocus
                      spellCheck={false}
                    />
                    <div className="settings-key-actions">
                      <button className="settings-btn-sm" onClick={() => handleSaveKey('anthropic')} disabled={saving}>
                        {saving ? '...' : 'Save'}
                      </button>
                      <button className="settings-btn-sm cancel" onClick={() => { setEditingKey(null); setKeyInput(''); setKeyError('') }}>Cancel</button>
                    </div>
                    {keyError && <div className="settings-key-error">{keyError}</div>}
                  </div>
                ) : (
                  <div className="settings-key-actions">
                    <button className="settings-btn-sm" onClick={() => { setEditingKey('anthropic'); setKeyInput(''); setKeyError('') }}>
                      {apiKeys.ANTHROPIC_API_KEY ? 'Update' : 'Add'}
                    </button>
                    {apiKeys.ANTHROPIC_API_KEY && (
                      <button className="settings-btn-sm danger" onClick={() => handleDeleteKey('anthropic')}>Delete</button>
                    )}
                  </div>
                )}
              </div>

              {/* Gemini */}
              <div className="settings-key-row">
                <div className="settings-key-info">
                  <span className="settings-key-label">Gemini</span>
                  <span className="settings-key-value">
                    {apiKeys.GEMINI_API_KEY || 'Not configured'}
                  </span>
                </div>
                {editingKey === 'gemini' ? (
                  <div className="settings-key-edit">
                    <input
                      type="password"
                      placeholder="AIza..."
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveKey('gemini')}
                      autoFocus
                      spellCheck={false}
                    />
                    <div className="settings-key-actions">
                      <button className="settings-btn-sm" onClick={() => handleSaveKey('gemini')} disabled={saving}>
                        {saving ? '...' : 'Save'}
                      </button>
                      <button className="settings-btn-sm cancel" onClick={() => { setEditingKey(null); setKeyInput(''); setKeyError('') }}>Cancel</button>
                    </div>
                    {keyError && <div className="settings-key-error">{keyError}</div>}
                  </div>
                ) : (
                  <div className="settings-key-actions">
                    <button className="settings-btn-sm" onClick={() => { setEditingKey('gemini'); setKeyInput(''); setKeyError('') }}>
                      {apiKeys.GEMINI_API_KEY ? 'Update' : 'Add'}
                    </button>
                    {apiKeys.GEMINI_API_KEY && (
                      <button className="settings-btn-sm danger" onClick={() => handleDeleteKey('gemini')}>Delete</button>
                    )}
                  </div>
                )}
              </div>
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
            <span className="settings-shortcut-keys"><kbd>Cmd</kbd><kbd>Shift</kbd><kbd>C</kbd></span>
          </div>
        </div>
      </div>
      <div className="settings-footer">
        <button className="settings-esc" onClick={handleClose}>ESC to close settings</button>
      </div>
    </div>
  )
}
