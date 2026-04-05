import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ApiKeySetup from './ApiKeySetup'

const GlimpseIcon = ({ size = 20 }) => (
  <svg viewBox="60 140 420 280" width={size} height={Math.round(size * 280 / 420)}>
    {/* Eyebrow — first path, targeted by CSS animation */}
    <path d="M104.539 204.375C153.938 173.009 385 145.971 437.19 251.313" fill="none" stroke="#6C63FF" strokeWidth="20" strokeLinecap="round" />
    {/* Eye + spiral */}
    <path d="M262 374.28C230.253 373.396 178.271 361.552 128 321.247C177.587 275.666 316.314 196.628 390.289 269.765C467.605 346.206 348.474 380.522 321.426 374.28C237.073 368.093 260.551 273.518 321.426 278.821C382.301 284.124 362.664 347.764 321.426 331.854" fill="none" stroke="#6C63FF" strokeWidth="22" strokeLinecap="round" />
  </svg>
)

function Tooltip({ text, children }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  return (
    <span
      ref={ref}
      onMouseEnter={() => {
        const r = ref.current?.getBoundingClientRect()
        if (!r) return
        const spaceBelow = window.innerHeight - r.bottom
        if (spaceBelow > 34) {
          setPos({ left: r.left + r.width / 2, top: r.bottom + 6, above: false })
        } else {
          setPos({ left: r.left + r.width / 2, top: r.top - 6, above: true })
        }
      }}
      onMouseLeave={() => setPos(null)}
      style={{ display: 'inline-flex' }}
      data-no-drag
    >
      {children}
      {pos && ReactDOM.createPortal(
        <div className="chat-tooltip" style={{
          left: pos.left,
          top: pos.above ? undefined : pos.top,
          bottom: pos.above ? (window.innerHeight - pos.top) : undefined,
          transform: 'translateX(-50%)',
        }}>{text}</div>,
        document.body
      )}
    </span>
  )
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export default function ChatPanel({
  style,
  croppedImage,
  getCompositeImage,
  currentThread,
  setCurrentThread,
  recentThreads,
  onThreadChange,
  onNewThread,
  onClearAllThreads,
  onDismissScreenshot,
  initialContext = '',
  annotationCount,
  chatFullSize,
  setChatFullSize,
  isNewThread,
  setIsNewThread,
  refreshThreads,
  refreshProviders,
  onClose,
  onMinimize,
  onPin,
  isPinned,
  onTogglePin,
  provider,
  setProvider,
  availableProviders,
}) {
  const [input, setInput] = useState('')
  const [threadMenuOpen, setThreadMenuOpen] = useState(false)
  const [textContext, setTextContext] = useState(initialContext || '')
  const [showApiKeySetup, setShowApiKeySetup] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const pendingQuestion = useRef(null)
  const pendingImageRef = useRef(null)

  // Update textContext when initialContext arrives via IPC
  useEffect(() => {
    if (initialContext) setTextContext(initialContext)
  }, [initialContext])
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState([])
  const [screenshotAttached, setScreenshotAttached] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const messagesEndRef = useRef(null)
  const lastAssistantRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)
  const apiMessages = useRef([])
  const lastSentImageRef = useRef(null)
  const prevThreadIdRef = useRef(null)

  // Load messages from current thread
  useEffect(() => {
    const prevId = prevThreadIdRef.current
    const newId = currentThread?.id
    const isNewThreadGettingId = prevId === null && newId && apiMessages.current.length > 0

    // Skip reload when a new thread just gets its first ID (preserve in-session images)
    if (!isNewThreadGettingId) {
      if (currentThread?.messages?.length > 0) {
        setMessages(currentThread.messages.map(m => ({
          role: m.role,
          text: m.role === 'assistant'
            ? m.content.map(c => c.text || '').join('')
            : m.content.map(c => c.type === 'text' ? c.text : '[image]').join(' '),
        })))
        apiMessages.current = [...currentThread.messages]
      } else {
        setMessages([])
        apiMessages.current = []
      }
    }
    if (!isNewThreadGettingId) {
      setScreenshotAttached(true)
      lastSentImageRef.current = null
    }
    prevThreadIdRef.current = newId

    setIsAtBottom(true)
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    }, 50)
  }, [currentThread?.id])

  // Auto-focus input
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [currentThread?.id])

  // Close thread menu on outside click
  useEffect(() => {
    if (!threadMenuOpen) return
    const handleClick = (e) => {
      if (!e.target.closest('.thread-menu-popup') && !e.target.closest('.chat-header-title-btn')) {
        setThreadMenuOpen(false)
      }
    }
    setTimeout(() => window.addEventListener('click', handleClick), 0)
    return () => window.removeEventListener('click', handleClick)
  }, [threadMenuOpen, setThreadMenuOpen])

  // When croppedImage changes (new screenshot), re-attach
  useEffect(() => {
    if (croppedImage) {
      setScreenshotAttached(true)
      lastSentImageRef.current = null
    }
  }, [croppedImage])

  // When annotations change (user edited the screenshot), re-attach
  const prevAnnotationCount = useRef(0)
  useEffect(() => {
    if (annotationCount !== prevAnnotationCount.current && croppedImage) {
      prevAnnotationCount.current = annotationCount
      if (!screenshotAttached && annotationCount > 0) {
        setScreenshotAttached(true)
      }
    }
  }, [annotationCount])

  // Expand panel when setup appears
  useEffect(() => {
    if (showApiKeySetup) {
      if (!chatFullSize) setChatFullSize(true)
      window.electronAPI?.resizeChatWindow?.({ width: 420, height: 520 })
    }
  }, [showApiKeySetup])

  // After welcome animation, auto-send pending question (skip re-adding user msg)
  useEffect(() => {
    if (!showWelcome && pendingQuestion.current && availableProviders.length > 0) {
      const q = pendingQuestion.current
      const pendingImage = pendingImageRef.current
      pendingQuestion.current = null
      pendingImageRef.current = null
      setInput('')

      // Build API message from the already-displayed user message
      const contentBlocks = []
      if (pendingImage) {
        const mediaType = pendingImage.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: pendingImage.split(',')[1] } })
      }
      contentBlocks.push({ type: 'text', text: q })
      apiMessages.current.push({ role: 'user', content: contentBlocks })

      // Send to AI without re-adding user message to UI
      setIsLoading(true)
      setTimeout(() => scrollToBottom(), 50)
      ;(async () => {
        try {
          const result = await window.electronAPI.chatWithAI(apiMessages.current, provider)
          setIsLoading(false)
          if (result.success) {
            const assistantText = result.content.map(c => c.text || '').join('')
            apiMessages.current.push({ role: 'assistant', content: result.content })
            setMessages(prev => [...prev, { role: 'assistant', text: assistantText }])
            if (!chatFullSize) setChatFullSize(true)
            setTimeout(() => scrollToLastAssistant(), 550)

            // Save thread + generate title
            const now = Date.now()
            const thread = {
              id: currentThread?.id || generateId(),
              title: currentThread?.title || 'New Chat',
              messages: [...apiMessages.current],
              createdAt: currentThread?.createdAt || now,
              updatedAt: now,
            }
            await saveCurrentThread(thread)

            const titleMsgs = apiMessages.current.map(m => ({
              ...m,
              content: Array.isArray(m.content)
                ? m.content.filter(c => c.type !== 'image')
                : m.content,
            }))
            const title = await generateTitle(titleMsgs)
            if (title) {
              thread.title = title
              await saveCurrentThread(thread)
              setIsNewThread(false)
            }
          }
        } catch {
          setIsLoading(false)
        }
      })()
    }
  }, [showWelcome, availableProviders])

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const threshold = 30
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    setIsAtBottom(atBottom)
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const scrollToLastAssistant = useCallback(() => {
    if (lastAssistantRef.current) {
      lastAssistantRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const saveCurrentThread = useCallback(async (thread) => {
    setCurrentThread(thread)
    await window.electronAPI?.saveThread({
      ...thread,
      messages: thread.messages.map(m => ({
        ...m,
        content: m.content.map(c =>
          c.type === 'image' ? { type: 'text', text: '[screenshot]' } : c
        ),
      })),
    })
  }, [setCurrentThread])

  const generateTitle = useCallback(async (msgs) => {
    if (!window.electronAPI?.generateTitle) return null
    try {
      const result = await window.electronAPI.generateTitle(msgs, provider)
      if (result.success) return result.title
    } catch {}
    return null
  }, [provider])

  const sendMessage = async (overrideText) => {
    const text = (overrideText || input).trim()
    if (!text || isLoading) return

    // No API keys configured → show message briefly, then setup
    if (!availableProviders.length) {
      pendingQuestion.current = text
      setInput('')
      if (!chatFullSize) setChatFullSize(true)
      // Show user's message in chat
      const msgEntry = { role: 'user', text }
      if (croppedImage) {
        const composite = await getCompositeImage?.()
        msgEntry.image = composite || croppedImage
        pendingImageRef.current = msgEntry.image
        setScreenshotAttached(false)
      }
      setMessages([msgEntry])
      setIsLoading(true)
      setTimeout(() => {
        setIsLoading(false)
        setShowApiKeySetup(true)
        if (!chatFullSize) setChatFullSize(true)
      }, 1000)
      return
    }

    setInput('')
    const contentBlocks = []

    // Auto-attach: first message, new screenshot, or annotations changed
    const noMessagesSentYet = apiMessages.current.length === 0
    const willAttachImage = croppedImage && (noMessagesSentYet || screenshotAttached)
    let imageForChat = croppedImage
    if (willAttachImage) {
      // Use annotated composite if available
      const composite = await getCompositeImage?.()
      if (composite) imageForChat = composite
      const mediaType = imageForChat.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: imageForChat.split(',')[1],
        },
      })
    }

    // Build API text with context
    let apiText = text
    const sentSnippet = textContext || null
    if (textContext) {
      apiText = `[Referenced text: "${textContext}"]\n\n${text}`
      setTextContext('')
    }
    if (willAttachImage && annotationCount > 0) {
      apiText = `[Note: The user has drawn annotations on the screenshot to highlight areas of interest. Pay close attention to the marked/highlighted regions.]\n\n${apiText}`
    }
    contentBlocks.push({ type: 'text', text: apiText })

    const userApiMsg = { role: 'user', content: contentBlocks }
    apiMessages.current.push(userApiMsg)

    // UI message shows clean text only
    const uiMsg = {
      role: 'user',
      text,
      image: willAttachImage ? imageForChat : null,
      snippet: sentSnippet,
    }
    setMessages(prev => [...prev, uiMsg])
    setIsLoading(true)

    // Scroll to bottom when user sends
    setTimeout(() => scrollToBottom(), 50)

    if (willAttachImage) {
      lastSentImageRef.current = croppedImage
      setScreenshotAttached(false)
    }

    const isFirstMessage = apiMessages.current.length === 1

    try {
      const result = await window.electronAPI.chatWithAI(apiMessages.current, provider)

      // Hide loading dots before adding the response
      setIsLoading(false)

      if (result.success) {
        const assistantText = result.content.map(c => c.text || '').join('')
        const assistantApiMsg = { role: 'assistant', content: result.content }
        apiMessages.current.push(assistantApiMsg)

        setMessages(prev => [...prev, { role: 'assistant', text: assistantText }])

        // Expand panel after AI responds
        if (!chatFullSize) setChatFullSize(true)

        // Scroll to start of assistant message after expansion completes
        setTimeout(() => scrollToLastAssistant(), 550)

        const now = Date.now()
        const thread = {
          id: currentThread?.id || generateId(),
          title: currentThread?.title || 'New Chat',
          messages: [...apiMessages.current],
          createdAt: currentThread?.createdAt || now,
          updatedAt: now,
        }

        await saveCurrentThread(thread)

        if (isFirstMessage) {
          // Strip images to save tokens for title generation
          const titleMsgs = apiMessages.current.map(m => ({
            ...m,
            content: Array.isArray(m.content)
              ? m.content.filter(c => c.type !== 'image')
              : m.content,
          }))
          const title = await generateTitle(titleMsgs)
          if (title) {
            thread.title = title
            await saveCurrentThread(thread)
            setIsNewThread(false)
          }
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${result.error}` }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}` }])
    }

    setIsLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
    if (e.key === 'Escape') {
      inputRef.current?.blur()
    }
  }

  const threadTitle = currentThread?.title || 'New Chat'
  const showScrollDown = !isAtBottom && !isLoading
  const [eyebrowWiggle, setEyebrowWiggle] = useState(false)

  // Draggable panel
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })

  // Resizable panel
  const [sizeOffset, setSizeOffset] = useState({ w: 0, h: 0 })
  const isResizingPanel = useRef(false)
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const resizeEdge = useRef(null)

  const handleHeaderMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('[data-no-drag]')) return
    isDragging.current = true
    dragStart.current = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y }

    const handleMouseMove = (ev) => {
      if (!isDragging.current) return
      setDragOffset({
        x: ev.clientX - dragStart.current.x,
        y: ev.clientY - dragStart.current.y,
      })
    }
    const handleMouseUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const handleResizeMouseDown = (edge) => (e) => {
    e.stopPropagation()
    e.preventDefault()
    isResizingPanel.current = true
    resizeEdge.current = edge
    resizeStart.current = { x: e.clientX, y: e.clientY, w: sizeOffset.w, h: sizeOffset.h }

    const handleMouseMove = (ev) => {
      if (!isResizingPanel.current) return
      const dx = ev.clientX - resizeStart.current.x
      const dy = ev.clientY - resizeStart.current.y
      const newOffset = { ...sizeOffset }

      if (edge === 'left') newOffset.w = resizeStart.current.w - dx
      else if (edge === 'right') newOffset.w = resizeStart.current.w + dx
      if (edge === 'top') newOffset.h = resizeStart.current.h - dy
      else if (edge === 'bottom') newOffset.h = resizeStart.current.h + dy

      // Clamp: min width 300, max 600; min height 200
      newOffset.w = Math.max(-80, Math.min(220, newOffset.w))
      newOffset.h = Math.max(-120, Math.min(300, newOffset.h))
      setSizeOffset(newOffset)
    }
    const handleMouseUp = () => {
      isResizingPanel.current = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const panelStyle = {
    ...style,
    width: 380 + sizeOffset.w,
    height: (style.height || 320) + sizeOffset.h,
    transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
  }

  return (
    <div
      className={`chat-panel ${isNewThread ? 'chat-panel-new' : ''} ${isPinned ? 'chat-panel-pinned' : ''}`}
      style={panelStyle}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Resize handles */}
      <div className="panel-resize-edge left" onMouseDown={handleResizeMouseDown('left')} />
      <div className="panel-resize-edge right" onMouseDown={handleResizeMouseDown('right')} />
      <div className="panel-resize-edge top" onMouseDown={handleResizeMouseDown('top')} />
      <div className="panel-resize-edge bottom" onMouseDown={handleResizeMouseDown('bottom')} />

      {/* Header — drag handle */}
      <div className="chat-header" onMouseDown={handleHeaderMouseDown}>
        <span
          className={`glimpse-icon-fixed ${(isLoading || eyebrowWiggle) ? 'glimpse-loading' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if (!isLoading) {
              setEyebrowWiggle(true)
              setTimeout(() => setEyebrowWiggle(false), 1200)
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <GlimpseIcon size={28} />
        </span>
        <div className="chat-header-info" style={{ position: 'relative' }}>
          <button
            className="chat-header-title-btn"
            onClick={() => { if (!threadMenuOpen) refreshThreads(); setThreadMenuOpen(!threadMenuOpen) }}
            title="Switch thread"
          >
            <span className="chat-header-title">{threadTitle}</span>
            <svg className={`chat-header-chevron ${threadMenuOpen ? 'open' : ''}`} viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {threadMenuOpen && (
            <>
              <div className="thread-menu-popup header-popup">
                <button className="thread-menu-item" onClick={() => { onNewThread(); setThreadMenuOpen(false) }}>
                  <span>New chat</span>
                </button>
                {recentThreads.filter(t => t.id !== currentThread?.id).slice(0, 3).map(t => (
                  <button key={t.id} className="thread-menu-item" onClick={() => { onThreadChange(t); setThreadMenuOpen(false) }} title={t.title}>
                    <span>{t.title}</span>
                  </button>
                ))}
                {recentThreads.length > 0 && (
                  <>
                    <div className="thread-menu-divider" />
                    <button className="thread-menu-item thread-menu-clear" onClick={() => { onClearAllThreads(); setThreadMenuOpen(false) }}>
                      <span>Clear all chats</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        {(onTogglePin || onPin) && (
          <Tooltip text={isPinned ? 'Unpin' : 'Pin to screen'}>
            <button
              className={`chat-header-pin ${isPinned ? 'pinned' : ''}`}
              onClick={onTogglePin || (() => onPin(currentThread?.id))}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 17v5" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
              </svg>
            </button>
          </Tooltip>
        )}
        <Tooltip text="New chat">
          <button
            className="chat-header-new"
            onClick={onNewThread}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {/* Messages */}
      <div className="chat-messages-wrapper">
        {showApiKeySetup ? (
          <ApiKeySetup onSkip={() => {
            setShowApiKeySetup(false)
            setMessages([])
            pendingQuestion.current = null
            pendingImageRef.current = null
            setChatFullSize(false)
            if (onMinimize) onMinimize()
          }} onDone={async () => {
            setShowApiKeySetup(false)
            if (refreshProviders) await refreshProviders()
            setShowWelcome(true)
            setEyebrowWiggle(true)
            setTimeout(() => {
              setShowWelcome(false)
              setEyebrowWiggle(false)
            }, 2000)
          }} />
        ) : showWelcome ? (
          <div className="api-key-welcome">
            <span className="glimpse-icon-fixed glimpse-loading">
              <GlimpseIcon size={32} />
            </span>
            <span>Key added. Happy chatting!</span>
          </div>
        ) : (
          <>
            <div
              className="chat-messages"
              ref={messagesContainerRef}
              onScroll={handleScroll}
            >
              {messages.map((msg, i) => {
                const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1
                return (
                  <div
                    key={i}
                    className={`chat-msg ${msg.role}`}
                    ref={isLastAssistant ? lastAssistantRef : null}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="msg-text"><Markdown remarkPlugins={[remarkGfm]}>{msg.text}</Markdown></div>
                    ) : (
                      <>
                        {msg.image && (
                          <img src={msg.image} alt="screenshot" className="msg-image" />
                        )}
                        {msg.snippet && (
                          <div className="msg-snippet">
                            <div className="msg-snippet-text">{msg.snippet.length > 200 ? msg.snippet.slice(0, 200) + '…' : msg.snippet}</div>
                          </div>
                        )}
                        <div className="msg-text">{msg.text}</div>
                      </>
                    )}
                  </div>
                )
              })}
              {isLoading && (
                <div className="chat-msg assistant" ref={lastAssistantRef}>
                  <div className="thinking-text">thinking...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Scroll to bottom arrow */}
            {showScrollDown && (
              <button
                className="scroll-to-bottom"
                onClick={scrollToBottom}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
                </svg>
              </button>
            )}
          </>
        )}
        </div>

      {/* Input */}
      <div className="chat-input-area">
        <div className="chat-input-box">
          {screenshotAttached && croppedImage && (
            <div className="input-attachment-cue">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span>Screenshot attached</span>
              {onDismissScreenshot && (
                <button className="attachment-dismiss" onClick={() => { onDismissScreenshot(); setTimeout(() => inputRef.current?.focus(), 50) }}>×</button>
              )}
            </div>
          )}
          {textContext && (
            <div className="text-context-snippet">
              <div className="snippet-text">{textContext.length > 120 ? textContext.slice(0, 120) + '…' : textContext}</div>
              <button className="snippet-dismiss" onClick={() => setTextContext('')}>×</button>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => window.electronAPI?.inputFocus?.()}
            placeholder={isNewThread ? (croppedImage ? 'Ask about this screenshot...' : 'Start a conversation...') : 'Continue discussion...'}
            rows={2}
            disabled={showApiKeySetup}
          />
          <button className="chat-send-arrow" onClick={sendMessage} disabled={isLoading || !input.trim() || showApiKeySetup}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="thread-actions">
        {onClose && (!croppedImage || isPinned) && (
          <button className="thread-action-link" onClick={onClose}>
            ESC to close
          </button>
        )}
        <span className="thread-actions-spacer" />
        {availableProviders.length > 1 ? (
          <Tooltip text="Switch model">
            <button
              className="thread-action-link model-link"
              onClick={() => {
                const idx = availableProviders.findIndex(p => p.id === provider)
                const next = availableProviders[(idx + 1) % availableProviders.length]
                setProvider(next.id)
              }}
            >
              {availableProviders.find(p => p.id === provider)?.model || 'AI'}
            </button>
          </Tooltip>
        ) : (
          <span className="thread-action-model">
            {availableProviders.find(p => p.id === provider)?.model || 'AI'}
          </span>
        )}
      </div>
    </div>
  )
}
