const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  onScreenCaptured: (callback) => {
    const handler = (_, dataUrl, windowBounds, displayInfo, offset) => callback(dataUrl, windowBounds, displayInfo, offset)
    ipcRenderer.on('screen-captured', handler)
    return () => ipcRenderer.removeListener('screen-captured', handler)
  },
  onNewCapture: (callback) => {
    const handler = (_, dataUrl, displayInfo) => callback(dataUrl, displayInfo)
    ipcRenderer.on('new-capture', handler)
    return () => ipcRenderer.removeListener('new-capture', handler)
  },
  closeOverlay: () => ipcRenderer.send('close-overlay'),
  inputFocus: () => ipcRenderer.send('input-focus'),
  closeChatWindow: () => ipcRenderer.send('close-chat-window'),
  chatWithAI: (messages, provider, modelId) => ipcRenderer.invoke('chat-with-ai', { messages, provider, modelId }),
  generateTitle: (messages, provider, modelId) => ipcRenderer.invoke('generate-title', { messages, provider, modelId }),
  getThreads: () => ipcRenderer.invoke('get-threads'),
  saveThread: (thread) => ipcRenderer.invoke('save-thread', thread),
  deleteThread: (id) => ipcRenderer.invoke('delete-thread', id),
  getAvailableProviders: () => ipcRenderer.invoke('get-available-providers'),
  showToast: (message) => ipcRenderer.send('show-toast', message),
  pinChat: (threadData, bounds) => ipcRenderer.send('pin-chat', threadData, bounds),
  togglePin: () => ipcRenderer.send('toggle-pin'),
  onPinState: (callback) => ipcRenderer.on('pin-state', (_, isPinned) => callback(isPinned)),
  onLoadThreadData: (callback) => ipcRenderer.on('load-thread-data', (_, data) => callback(data)),
  onSetCroppedImage: (callback) => ipcRenderer.on('set-cropped-image', (_, img) => callback(img)),
  onTextContext: (callback) => ipcRenderer.on('text-context', (_, text) => callback(text)),
  chatReady: () => ipcRenderer.send('chat-ready'),
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
  saveApiKeys: (keys) => ipcRenderer.invoke('save-api-keys', keys),
  validateInviteCode: (code) => ipcRenderer.invoke('validate-invite-code', code),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  closeHome: () => ipcRenderer.send('close-home'),
  openThreadInChat: (threadId) => ipcRenderer.send('open-thread-in-chat', threadId),
  lowerOverlay: () => ipcRenderer.send('lower-overlay'),
  restoreOverlay: () => ipcRenderer.send('restore-overlay'),
  checkPermissions: () => ipcRenderer.invoke('check-permissions'),
  requestScreenPermission: () => ipcRenderer.invoke('request-screen-permission'),
  openPermissionSettings: (type) => ipcRenderer.send('open-permission-settings', type),
  welcomeDone: () => ipcRenderer.send('welcome-done'),
  closeWelcome: () => ipcRenderer.send('close-welcome'),
  onShortcutTried: (callback) => ipcRenderer.on('shortcut-tried', (_, type) => callback(type)),
  openSettings: (panelBounds) => ipcRenderer.send('open-settings', panelBounds),
  notifyProvidersChanged: () => ipcRenderer.send('providers-changed'),
  onProvidersChanged: (callback) => ipcRenderer.on('providers-changed', () => callback()),
  closeSettings: () => ipcRenderer.send('close-settings'),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  setPreference: (key, value) => ipcRenderer.invoke('set-preference', key, value),
  deleteApiKey: (provider) => ipcRenderer.invoke('delete-api-key', provider),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  resizeChatWindow: (size) => ipcRenderer.send('resize-chat-window', size),
  copyImage: (dataUrl) => ipcRenderer.invoke('copy-image', dataUrl),
  saveImage: (dataUrl) => ipcRenderer.invoke('save-image', dataUrl),
})
