const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, clipboard, nativeImage, dialog, shell, systemPreferences, Tray, Menu } = require('electron')
const path = require('path')
const fs = require('fs')

// Crash log for debugging production issues
const CRASH_LOG = path.join(app.getPath('userData'), 'crash.log')
process.on('uncaughtException', (err) => {
  fs.writeFileSync(CRASH_LOG, `${new Date().toISOString()}\n${err.stack || err}\n`, 'utf8')
  console.error('[Glimpse] CRASH:', err)
  process.exit(1)
})

try {

const { execFile } = require('child_process')
const Anthropic = require('@anthropic-ai/sdk')
const { GoogleGenerativeAI } = require('@google/generative-ai')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

let overlayWindow = null
let chatWindow = null // single chat window for all modes (standalone, pinned, detached)
let chatWindowCreating = false
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development'
const DEV_PORT = process.env.VITE_PORT || 5173
const GET_WINDOWS_BIN = isDev
  ? path.join(__dirname, 'get-windows')
  : path.join(process.resourcesPath, 'get-windows')
const MAX_THREADS = 5
const THREADS_DIR = path.join(app.getPath('userData'), 'threads')
const KEYS_PATH = path.join(app.getPath('userData'), 'api-keys.json')
const PREFS_PATH = path.join(app.getPath('userData'), 'preferences.json')

// ── API key management ──

function loadApiKeys() {
  try {
    return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'))
  } catch { return {} }
}

function saveApiKeys(keys) {
  fs.writeFileSync(KEYS_PATH, JSON.stringify(keys), 'utf8')
  initClients()
}

function getEffectiveKey(provider) {
  const stored = loadApiKeys()
  if (provider === 'anthropic') return stored.ANTHROPIC_API_KEY || ''
  if (provider === 'gemini') return stored.GEMINI_API_KEY || ''
  return ''
}

// ── AI clients (lazy init) ──

let claudeClient = null
let geminiClient = null

function initClients() {
  const anthropicKey = getEffectiveKey('anthropic')
  const geminiKey = getEffectiveKey('gemini')
  claudeClient = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null
  geminiClient = geminiKey ? new GoogleGenerativeAI(geminiKey) : null
}

initClients()

// ── Helpers ──

function closeChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.close()
    chatWindow = null
  }
}

function getURL(hash) {
  return isDev
    ? `http://localhost:${DEV_PORT}#${hash}`
    : `file://${path.join(__dirname, '..', 'dist', 'index.html')}#${hash}`
}

function getChatOnlyURL() {
  return getURL('chat-only')
}

const ONBOARDING_PATH = path.join(app.getPath('userData'), 'onboarding-done')
let welcomeWindow = null
let tray = null

function createWelcomeWindow() {
  welcomeWindow = new BrowserWindow({
    width: 420, height: 480,
    frame: false,
    backgroundColor: '#0c121e',
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  welcomeWindow.loadURL(getURL('welcome'))
  welcomeWindow.webContents.on('did-finish-load', () => {

    welcomeWindow.show()
    welcomeWindow.focus()
  })
  welcomeWindow.on('closed', () => {

    welcomeWindow = null
  })
}

// ── Preferences ──

function loadPreferences() {
  try {
    return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'))
  } catch { return { launchAtLogin: false, saveLocation: 'ask', savePath: '' } }
}

function savePreference(key, value) {
  const prefs = loadPreferences()
  prefs[key] = value
  fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs), 'utf8')
  if (key === 'launchAtLogin') {
    app.setLoginItemSettings({ openAtLogin: value })
  }
}

// ── Settings window ──

let settingsWindow = null

function toggleSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close()
    settingsWindow = null
    return
  }
  settingsWindow = new BrowserWindow({
    width: 420, height: 520,
    frame: false,
    backgroundColor: '#0c121e',
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWindow.setAlwaysOnTop(true, 'screen-saver')
  settingsWindow.loadURL(getURL('settings'))
  settingsWindow.on('closed', () => { settingsWindow = null })
}

function checkPermissions() {
  const screenStatus = systemPreferences.getMediaAccessStatus('screen')
  const screenOk = screenStatus === 'granted' || screenStatus === 'authorized'
  const accessibilityOk = globalShortcut.isRegistered('CommandOrControl+Shift+Z')
  return { screen: screenOk, accessibility: accessibilityOk }
}

async function requestScreenPermission() {
  let granted = false
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    granted = sources.length > 0 && !sources[0].thumbnail.isEmpty()
  } catch {}
  if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.focus()
  return { granted }
}

function createChatWindow(opts = {}) {
  const { x, y, width = 420, height = 550, alwaysOnTop = false, threadData, selectedText, croppedImage, onReady } = opts

  chatWindow = new BrowserWindow({
    ...(x !== undefined ? { x, y } : {}),
    width, height,
    frame: false,
    alwaysOnTop,
    transparent: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  chatWindow.loadURL(getChatOnlyURL())

  chatWindow.webContents.on('did-finish-load', () => {
    chatWindow.webContents.send('pin-state', alwaysOnTop)
    if (threadData) chatWindow.webContents.send('load-thread-data', threadData)
    if (croppedImage) chatWindow.webContents.send('set-cropped-image', croppedImage)
    if (selectedText) chatWindow.webContents.send('text-context', selectedText)
    if (!onReady) chatWindow.show()
  })

  if (onReady) {
    const readyHandler = (event) => {
      if (chatWindow && event.sender === chatWindow.webContents) {
        ipcMain.removeListener('chat-ready', readyHandler)
        chatWindow.show()
        onReady()
      }
    }
    ipcMain.on('chat-ready', readyHandler)
  }

  chatWindow.on('closed', () => { chatWindow = null })
}

// ── Thread persistence ──

function getThreadPath(id) {
  return path.join(THREADS_DIR, `${id}.json`)
}

function loadAllThreads() {
  const files = fs.readdirSync(THREADS_DIR).filter(f => f.endsWith('.json'))
  const threads = []
  for (const file of files) {
    try {
      threads.push(JSON.parse(fs.readFileSync(path.join(THREADS_DIR, file), 'utf8')))
    } catch {}
  }
  threads.sort((a, b) => b.updatedAt - a.updatedAt)
  return threads.slice(0, MAX_THREADS)
}

function saveThread(thread) {
  fs.writeFileSync(getThreadPath(thread.id), JSON.stringify(thread), 'utf8')
  const files = fs.readdirSync(THREADS_DIR).filter(f => f.endsWith('.json'))
  if (files.length > MAX_THREADS) {
    const kept = new Set(loadAllThreads().map(t => `${t.id}.json`))
    for (const file of files) {
      if (!kept.has(file)) {
        try { fs.unlinkSync(path.join(THREADS_DIR, file)) } catch {}
      }
    }
  }
}

function deleteThread(id) {
  try { fs.unlinkSync(getThreadPath(id)) } catch {}
}

// ── Window detection ──

function getWindowBounds() {
  return new Promise((resolve) => {
    execFile(GET_WINDOWS_BIN, { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve([])
      try { resolve(JSON.parse(stdout.trim())) } catch { resolve([]) }
    })
  })
}

function getActiveDisplay() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

// ── Overlay window ──

function createOverlayWindow(display) {
  const { x, y, width, height } = display.bounds

  overlayWindow = new BrowserWindow({
    x, y, width, height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    show: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setFullScreenable(false)

  if (isDev) {
    overlayWindow.loadURL(`http://localhost:${DEV_PORT}`)
  } else {
    overlayWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  overlayWindow.on('closed', () => { overlayWindow = null })
}

async function captureScreen(display) {
  const { width, height } = display.size
  const scaleFactor = display.scaleFactor

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(width * scaleFactor),
      height: Math.round(height * scaleFactor),
    },
  })

  let source = sources[0]
  if (sources.length > 1) {
    const match = sources.find(s => s.display_id === String(display.id))
    if (match) source = match
  }

  return source ? { dataUrl: source.thumbnail.toDataURL() } : null
}

// ── AI providers ──

async function chatWithClaude(messages) {
  const response = await claudeClient.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages,
  })
  return response.content.map(c => c.text || '').join('')
}

async function chatWithGemini(messages) {
  const model = geminiClient.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const history = []
  for (const msg of messages) {
    const parts = []
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push({ text: block.text })
        } else if (block.type === 'image') {
          parts.push({ inlineData: { data: block.source.data, mimeType: block.source.media_type } })
        }
      }
    } else {
      parts.push({ text: msg.content })
    }
    history.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts })
  }

  const chat = model.startChat({ history: history.slice(0, -1) })
  const result = await chat.sendMessage(history[history.length - 1].parts)
  return result.response.text()
}

async function chatWithProvider(messages, provider) {
  return provider === 'gemini' ? chatWithGemini(messages) : chatWithClaude(messages)
}

// ── App lifecycle ──

app.whenReady().then(() => {

  fs.mkdirSync(THREADS_DIR, { recursive: true })

  // Show welcome on first launch
  if (!fs.existsSync(ONBOARDING_PATH)) {
    createWelcomeWindow()
  }

  // Cmd+Shift+Z → screenshot mode
  const r1 = globalShortcut.register('CommandOrControl+Shift+Z', async () => {

    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.webContents.send('shortcut-tried', 'screenshot')
      return
    }
    if (!fs.existsSync(ONBOARDING_PATH)) {
      createWelcomeWindow()
      return
    }
    closeChatWindow()

    const activeDisplay = getActiveDisplay()
    const displayInfo = {
      width: activeDisplay.size.width,
      height: activeDisplay.size.height,
      scaleFactor: activeDisplay.scaleFactor,
    }

    if (overlayWindow && overlayWindow.isFocused()) {
      const capture = await captureScreen(activeDisplay)
      if (capture) {
        overlayWindow.webContents.send('new-capture', capture.dataUrl, displayInfo)
      }
      overlayWindow.focus()
      return
    }

    if (overlayWindow) {
      overlayWindow.destroy()
      overlayWindow = null
    }

    const [capture, windowBounds] = await Promise.all([
      captureScreen(activeDisplay),
      getWindowBounds(),
    ])

    if (capture) {
      createOverlayWindow(activeDisplay)

      overlayWindow.webContents.on('did-finish-load', () => {
        const actualBounds = overlayWindow.getBounds()
        const offset = {
          x: actualBounds.x - activeDisplay.bounds.x,
          y: actualBounds.y - activeDisplay.bounds.y,
        }
        overlayWindow.webContents.send('screen-captured', capture.dataUrl, windowBounds, displayInfo, offset)
        overlayWindow.show()
        overlayWindow.focus()
        setTimeout(() => {
          if (overlayWindow) overlayWindow.setVisibleOnAllWorkspaces(false)
        }, 100)
      })
    }
  })



  // Cmd+Shift+C → standalone chat (grab selected text)
  const r2 = globalShortcut.register('CommandOrControl+Shift+C', async () => {

    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.webContents.send('shortcut-tried', 'chat')
      return
    }
    if (!fs.existsSync(ONBOARDING_PATH)) {
      createWelcomeWindow()
      return
    }
    if (overlayWindow) { overlayWindow.destroy(); overlayWindow = null }

    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.focus()
      return
    }

    if (chatWindowCreating) return
    chatWindowCreating = true

    // Grab selected text: simulate Cmd+C, poll clipboard
    const savedClipboard = clipboard.readText()
    clipboard.writeText('')

    const { execSync } = require('child_process')
    try {
      execSync('osascript -e \'tell application "System Events" to keystroke "c" using command down\'', { timeout: 1000 })
    } catch {}

    let selectedText = ''
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 30))
      selectedText = clipboard.readText()
      if (selectedText) break
    }

    clipboard.writeText(savedClipboard)

    createChatWindow({ selectedText })
    chatWindowCreating = false
  })


  // ── Menu bar tray ──
  // TODO: Tray icon — needs debugging on macOS 26
  // tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.icns')).resize({ width: 18, height: 18 }))
  // tray.setToolTip('Glimpse')
  // tray.setContextMenu(Menu.buildFromTemplate([
  //   { label: 'Screenshot', accelerator: 'CmdOrCtrl+Shift+Z', enabled: false },
  //   { label: 'Quick chat', accelerator: 'CmdOrCtrl+Shift+C', enabled: false },
  //   { type: 'separator' },
  //   { label: 'Settings', click: () => toggleSettingsWindow() },
  //   { type: 'separator' },
  //   { label: 'Quit Glimpse', click: () => app.quit() },
  // ]))

  // ── IPC handlers ──

  ipcMain.on('close-overlay', () => {
    if (overlayWindow) { overlayWindow.destroy(); overlayWindow = null }
    if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.close(); settingsWindow = null }
  })

  ipcMain.on('close-chat-window', () => {
    closeChatWindow()
  })

  // Pin: detach chat from overlay into standalone window
  ipcMain.on('pin-chat', (_, pinData, bounds) => {
    const threadData = pinData?.thread || pinData
    const overlayBounds = overlayWindow ? overlayWindow.getBounds() : { x: 0, y: 0 }
    const prevOverlay = overlayWindow

    // Fade out overlay immediately so user sees a smooth transition
    if (prevOverlay && !prevOverlay.isDestroyed()) {
      prevOverlay.webContents.executeJavaScript('document.body.style.transition="opacity 0.15s";document.body.style.opacity="0"')
    }

    createChatWindow({
      x: bounds ? overlayBounds.x + bounds.x : undefined,
      y: bounds ? overlayBounds.y + bounds.y : undefined,
      width: bounds ? bounds.width : 380,
      height: bounds ? bounds.height : 500,
      alwaysOnTop: true,
      threadData,
      croppedImage: pinData?.croppedImage,
      onReady: () => {
        if (prevOverlay && !prevOverlay.isDestroyed()) { prevOverlay.destroy() }
        overlayWindow = null
      },
    })
  })

  // Toggle pin (alwaysOnTop) on current chat window
  ipcMain.on('toggle-pin', () => {
    if (chatWindow && !chatWindow.isDestroyed()) {
      const isPinned = chatWindow.isAlwaysOnTop()
      chatWindow.setAlwaysOnTop(!isPinned)
      chatWindow.webContents.send('pin-state', !isPinned)
    }
  })

  // Toast notification
  ipcMain.on('show-toast', (_, message) => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const toastW = 220
    const toastH = 44
    const x = Math.round(display.bounds.x + (display.bounds.width - toastW) / 2)
    const y = display.bounds.y + Math.round(display.bounds.height * 0.18)

    const toast = new BrowserWindow({
      x, y, width: toastW, height: toastH,
      frame: false, transparent: true, alwaysOnTop: true,
      skipTaskbar: true, resizable: false, movable: false,
      focusable: false, hasShadow: false,
      webPreferences: { contextIsolation: true },
    })
    toast.setVisibleOnAllWorkspaces(true)
    toast.setIgnoreMouseEvents(true)

    const html = `
      <html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100%;background:transparent;">
        <div style="
          background:rgba(20,24,36,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          border:1px solid rgba(0,229,255,0.2);border-radius:10px;padding:8px 20px;
          display:flex;align-items:center;gap:8px;
          font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;
          color:rgba(230,240,255,0.9);box-shadow:0 4px 20px rgba(0,0,0,0.4);
          animation:fadeIn 0.15s ease-out;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          ${message}
        </div>
        <style>@keyframes fadeIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }</style>
      </body></html>`

    toast.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    setTimeout(() => { if (!toast.isDestroyed()) toast.destroy() }, 1200)
  })

  // IME support — lower overlay for IME visibility, don't restore to avoid flash
  ipcMain.on('input-focus', () => {
    if (overlayWindow) overlayWindow.setAlwaysOnTop(true, 'floating')
  })

  ipcMain.on('open-external', (_, url) => {
    shell.openExternal(url)
  })

  // Welcome / onboarding
  ipcMain.handle('check-permissions', () => checkPermissions())
  ipcMain.handle('request-screen-permission', () => requestScreenPermission())

  ipcMain.on('open-permission-settings', (_, type) => {
    if (type === 'screen') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    } else if (type === 'accessibility') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
    }
  })

  ipcMain.on('welcome-done', () => {
    fs.writeFileSync(ONBOARDING_PATH, Date.now().toString(), 'utf8')
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.close()
      welcomeWindow = null
    }
  })

  ipcMain.on('close-welcome', () => {
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.close()
      welcomeWindow = null
    }
  })

  // Settings
  ipcMain.on('open-settings', () => { toggleSettingsWindow() })
  ipcMain.on('close-settings', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.close(); settingsWindow = null }
  })

  ipcMain.handle('get-preferences', () => loadPreferences())

  ipcMain.handle('set-preference', (_, key, value) => {
    savePreference(key, value)
    return { success: true }
  })

  ipcMain.handle('delete-api-key', (_, provider) => {
    const keys = loadApiKeys()
    if (provider === 'anthropic') delete keys.ANTHROPIC_API_KEY
    if (provider === 'gemini') delete keys.GEMINI_API_KEY
    if (provider === 'invite') {
      delete keys._invite
      delete keys.ANTHROPIC_API_KEY
      delete keys.GEMINI_API_KEY
    }
    saveApiKeys(keys)
    return { success: true }
  })

  ipcMain.handle('select-folder', async () => {
    if (overlayWindow) overlayWindow.setAlwaysOnTop(false)
    if (settingsWindow) settingsWindow.setAlwaysOnTop(false)
    const prefs = loadPreferences()
    const result = await dialog.showOpenDialog({
      defaultPath: prefs.savePath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver')
      overlayWindow.focus()
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.setAlwaysOnTop(true, 'screen-saver')
      settingsWindow.focus()
    }
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  ipcMain.on('resize-chat-window', (_, { width, height }) => {
    if (chatWindow && !chatWindow.isDestroyed()) {
      const [curW, curH] = chatWindow.getSize()
      if (curW < width || curH < height) {
        chatWindow.setSize(Math.max(curW, width), Math.max(curH, height), true)
      }
    }
  })

  // Thread CRUD
  ipcMain.handle('get-threads', () => loadAllThreads())
  ipcMain.handle('save-thread', (_, thread) => { saveThread(thread); return { success: true } })
  ipcMain.handle('delete-thread', (_, id) => { deleteThread(id); return { success: true } })

  // AI
  ipcMain.handle('chat-with-ai', async (_, { messages, provider }) => {
    try {
      const text = await chatWithProvider(messages, provider)
      return { success: true, content: [{ type: 'text', text }] }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('generate-title', async (_, { messages, provider }) => {
    try {
      const titleMessages = [
        ...messages,
        { role: 'user', content: [{ type: 'text', text: 'Generate a very short title (3-6 words) for this conversation. Reply with ONLY the title, nothing else.' }] },
      ]
      const text = await chatWithProvider(titleMessages, provider)
      return { success: true, title: text.trim() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-available-providers', () => {
    const providers = []
    if (claudeClient) providers.push({ id: 'claude', name: 'Claude', model: 'Haiku 4.5' })
    if (geminiClient) providers.push({ id: 'gemini', name: 'Gemini', model: '2.5 Flash' })
    return providers
  })

  ipcMain.handle('get-api-keys', () => {
    const stored = loadApiKeys()
    const anthropicKey = getEffectiveKey('anthropic')
    const geminiKey = getEffectiveKey('gemini')
    return {
      ANTHROPIC_API_KEY: anthropicKey ? '••••' + anthropicKey.slice(-4) : '',
      GEMINI_API_KEY: geminiKey ? '••••' + geminiKey.slice(-4) : '',
      hasAnyKey: !!(anthropicKey || geminiKey),
      isInvite: !!stored._invite,
    }
  })

  ipcMain.handle('save-api-keys', async (_, keys) => {
    const errors = []

    // Validate Anthropic key
    if (keys.ANTHROPIC_API_KEY) {
      try {
        const client = new Anthropic({ apiKey: keys.ANTHROPIC_API_KEY })
        await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        })
      } catch (e) {
        if (e.status === 401 || e.message?.includes('auth') || e.message?.includes('API key')) {
          errors.push('Anthropic key is invalid')
        }
        // Other errors (rate limit, network) mean the key format is likely valid
      }
    }

    // Validate Gemini key
    if (keys.GEMINI_API_KEY) {
      try {
        const client = new GoogleGenerativeAI(keys.GEMINI_API_KEY)
        const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' })
        await model.generateContent('hi')
      } catch (e) {
        if (e.status === 400 || e.status === 403 || e.message?.includes('API key')) {
          errors.push('Gemini key is invalid')
        }
      }
    }

    if (errors.length) {
      return { success: false, error: errors.join('. ') + '. Please check and try again.' }
    }

    try {
      const current = loadApiKeys()
      if (keys.ANTHROPIC_API_KEY) current.ANTHROPIC_API_KEY = keys.ANTHROPIC_API_KEY
      if (keys.GEMINI_API_KEY) current.GEMINI_API_KEY = keys.GEMINI_API_KEY
      saveApiKeys(current)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('validate-invite-code', (_, code) => {
    const validCode = process.env.INVITE_CODE
    if (!validCode) return { success: false, error: 'Invite codes are not enabled' }
    if (code.trim() !== validCode) return { success: false, error: 'Invalid invite code' }
    // Use built-in keys
    const keys = {}
    if (process.env.ANTHROPIC_API_KEY) keys.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    if (process.env.GEMINI_API_KEY) keys.GEMINI_API_KEY = process.env.GEMINI_API_KEY
    keys._invite = true
    saveApiKeys(keys)
    return { success: true }
  })

  // Image export
  ipcMain.handle('copy-image', (_, dataUrl) => {
    try {
      const img = nativeImage.createFromDataURL(dataUrl)
      clipboard.writeImage(img)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('save-image', async (_, dataUrl) => {
    try {
      const prefs = loadPreferences()
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const fileName = `glimpse-${Date.now()}.png`

      // Auto-save to fixed folder if configured
      if (prefs.saveLocation === 'folder' && prefs.savePath) {
        try {
          const autoPath = path.join(prefs.savePath, fileName)
          fs.writeFileSync(autoPath, Buffer.from(base64, 'base64'))
          return { success: true, filePath: autoPath }
        } catch {
          // Folder invalid, fall through to dialog
        }
      }

      if (overlayWindow) overlayWindow.setAlwaysOnTop(false)
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: fileName,
        filters: [{ name: 'Images', extensions: ['png', 'jpg'] }],
      })
      if (overlayWindow) { overlayWindow.setAlwaysOnTop(true, 'screen-saver'); overlayWindow.focus() }
      if (canceled || !filePath) return { success: false }
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
      return { success: true, filePath }
    } catch (error) {
      if (overlayWindow) { overlayWindow.setAlwaysOnTop(true, 'screen-saver'); overlayWindow.focus() }
      return { success: false, error: error.message }
    }
  })
})

app.on('will-quit', () => { globalShortcut.unregisterAll() })
app.on('window-all-closed', () => {})

} catch (err) {
  fs.writeFileSync(CRASH_LOG, `${new Date().toISOString()} INIT\n${err.stack || err}\n`, 'utf8')
  console.error('[Glimpse] INIT CRASH:', err)
}
