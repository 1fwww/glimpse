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
  chatWithAI: (messages, provider) => ipcRenderer.invoke('chat-with-ai', { messages, provider }),
  generateTitle: (messages, provider) => ipcRenderer.invoke('generate-title', { messages, provider }),
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
  copyImage: (dataUrl) => ipcRenderer.invoke('copy-image', dataUrl),
  saveImage: (dataUrl) => ipcRenderer.invoke('save-image', dataUrl),
})
