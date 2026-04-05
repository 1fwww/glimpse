import React, { useState, useEffect, useRef, useCallback } from 'react'
import ChatPanel from './ChatPanel'
import EditToolbar from './EditToolbar'
import DrawingCanvas from './DrawingCanvas'
import useThreadManager from './useThreadManager'
import './app.css'

export default function App() {
  const [screenImage, setScreenImage] = useState(null)
  const [selection, setSelection] = useState(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [startPos, setStartPos] = useState(null)
  const [chatVisible, setChatVisible] = useState(false)
  const [croppedImage, setCroppedImage] = useState(null)
  const [windowBounds, setWindowBounds] = useState([])
  const [hoveredWindow, setHoveredWindow] = useState(null)
  const [displayInfo, setDisplayInfo] = useState(null)
  const [windowOffset, setWindowOffset] = useState({ x: 0, y: 0 })

  // Shared thread/provider state
  const tm = useThreadManager()

  const [chatFullSize, setChatFullSize] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [chatMinimized, setChatMinimized] = useState(false)
  const userMinimizedRef = useRef(false)
  const chatWasOpenRef = useRef(false)
  const [activeTool, setActiveTool] = useState(null)
  const [activeColor, setActiveColor] = useState('#e5243a')
  const [activeSize, setActiveSize] = useState(4)
  const [annotations, setAnnotations] = useState([])
  const [undoStack, setUndoStack] = useState([])
  const [selectedAnnotation, setSelectedAnnotation] = useState(null)
  const [mosaicMode, setMosaicMode] = useState('brush')

  // Wrap setAnnotations to track undo/redo
  const updateAnnotations = useCallback((updater) => {
    setAnnotations(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      setUndoStack(stack => [...stack, prev])
      return next
    })
  }, [])

  const undo = useCallback(() => {
    setUndoStack(stack => {
      if (stack.length === 0) return stack
      const prev = stack[stack.length - 1]
      setAnnotations(prev)
      setSelectedAnnotation(null)
      return stack.slice(0, -1)
    })
  }, [])

  const clearAll = useCallback(() => {
    if (annotations.length === 0) return
    setUndoStack(stack => [...stack, annotations])
    setAnnotations([])
    setSelectedAnnotation(null)
  }, [annotations])
  const overlayRef = useRef(null)


  useEffect(() => {
    if (!window.electronAPI) return

    const resetState = () => {
      setSelection(null)
      setChatVisible(false)
      setChatFullSize(false)
      setIsSelecting(false)
      setHoveredWindow(null)
      setFrozenChatPos(null)
    }

    const removeScreenCaptured = window.electronAPI.onScreenCaptured((dataUrl, bounds, dispInfo, offset) => {
      setScreenImage(dataUrl)
      setDisplayInfo(dispInfo || null)
      setWindowOffset(offset || { x: 0, y: 0 })
      const off = offset || { x: 0, y: 0 }
      setWindowBounds((bounds || []).map(win => ({
        ...win,
        x: win.x - off.x,
        y: win.y - off.y,
      })))
      resetState()

      tm.refreshWithHeuristic()
    })

    const removeNewCapture = window.electronAPI.onNewCapture((dataUrl, dispInfo) => {
      setScreenImage(dataUrl)
      setDisplayInfo(dispInfo || null)
      resetState()
    })

    return () => {
      removeScreenCaptured?.()
      removeNewCapture?.()
    }
  }, [])

  const closeWithAnimation = useCallback(() => {
    if (isExiting) return
    setIsExiting(true)
    setTimeout(() => {
      window.electronAPI?.closeOverlay()
    }, 200)
  }, [isExiting])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeWithAnimation()
      }
      // Cmd+Z / Ctrl+Z = undo, Cmd+Shift+Z / Ctrl+Shift+Z = redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeWithAnimation, undo])

  // Compose screenshot + annotations (compressed for AI chat)
  const getCompositeImage = useCallback(() => {
    return new Promise((resolve) => {
      if (!croppedImage) return resolve(null)
      const base = new Image()
      base.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = base.naturalWidth
        canvas.height = base.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(base, 0, 0)

        const drawingCanvas = document.querySelector('.drawing-canvas')
        if (drawingCanvas) {
          ctx.drawImage(drawingCanvas, 0, 0, canvas.width, canvas.height)
        }

        resolve(canvas.toDataURL('image/png'))
      }
      base.src = croppedImage
    })
  }, [croppedImage])

  // High-res composite for save/copy (full resolution from original screenshot)
  const getHiResComposite = useCallback(() => {
    return new Promise((resolve) => {
      if (!screenImage || !selection) return resolve(null)
      const img = new Image()
      img.onload = () => {
        const displayW = displayInfo?.width || window.innerWidth
        const displayH = displayInfo?.height || window.innerHeight
        const scaleX = img.naturalWidth / displayW
        const scaleY = img.naturalHeight / displayH

        const sx = (selection.x + windowOffset.x) * scaleX
        const sy = (selection.y + windowOffset.y) * scaleY
        const sw = selection.w * scaleX
        const sh = selection.h * scaleY

        const canvas = document.createElement('canvas')
        canvas.width = sw
        canvas.height = sh
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

        // Draw annotations scaled to full resolution
        const drawingCanvas = document.querySelector('.drawing-canvas')
        if (drawingCanvas) {
          ctx.drawImage(drawingCanvas, 0, 0, sw, sh)
        }

        resolve(canvas.toDataURL('image/png'))
      }
      img.src = screenImage
    })
  }, [screenImage, selection, displayInfo, windowOffset])

  const [copyFeedback, setCopyFeedback] = useState(false)

  const handleCopy = useCallback(async () => {
    const img = await getHiResComposite()
    if (img) {
      await window.electronAPI?.copyImage(img)
      setCopyFeedback(true)
      // Exit and show toast
      window.electronAPI?.showToast('Copied to clipboard')
      window.electronAPI?.closeOverlay()
    }
  }, [getHiResComposite])

  const [saveFeedback, setSaveFeedback] = useState(false)

  const handleSave = useCallback(async () => {
    const img = await getHiResComposite()
    if (img) {
      const result = await window.electronAPI?.saveImage(img)
      if (result?.success) {
        setSaveFeedback(true)
        const folder = result.filePath?.split('/').slice(-2, -1)[0]
        window.electronAPI?.showToast(folder ? `Saved to ${folder}` : 'Saved')
        window.electronAPI?.closeOverlay()
      }
    }
  }, [getHiResComposite])

  const cropSelection = useCallback((sel, imgDataUrl) => {
    if (!sel || !imgDataUrl) return

    const img = new Image()
    img.onload = () => {
      const displayW = displayInfo?.width || window.innerWidth
      const displayH = displayInfo?.height || window.innerHeight
      const scaleX = img.naturalWidth / displayW
      const scaleY = img.naturalHeight / displayH

      const canvas = document.createElement('canvas')
      const sx = (sel.x + windowOffset.x) * scaleX
      const sy = (sel.y + windowOffset.y) * scaleY
      const sw = sel.w * scaleX
      const sh = sel.h * scaleY

      // Resize if too large (keep under ~4MB for API limit)
      const MAX_DIM = 1200
      let outW = sw
      let outH = sh
      if (outW > MAX_DIM || outH > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / outW, MAX_DIM / outH)
        outW = Math.round(outW * ratio)
        outH = Math.round(outH * ratio)
      }

      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
      setCroppedImage(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = imgDataUrl
  }, [displayInfo, windowOffset])

  const findWindowAtPoint = useCallback((x, y) => {
    for (const win of windowBounds) {
      if (x >= win.x && x <= win.x + win.w && y >= win.y && y <= win.y + win.h) {
        return win
      }
    }
    return null
  }, [windowBounds])

  const [isMovingSelection, setIsMovingSelection] = useState(false)
  const [isResizingSelection, setIsResizingSelection] = useState(false)
  const moveStart = useRef(null)
  const resizeEdge = useRef(null)

  const getSelectionEdge = (e) => {
    if (!selection) return null
    const margin = 6
    const { x, y, w, h } = selection
    const cx = e.clientX, cy = e.clientY
    const onLeft = Math.abs(cx - x) < margin
    const onRight = Math.abs(cx - (x + w)) < margin
    const onTop = Math.abs(cy - y) < margin
    const onBottom = Math.abs(cy - (y + h)) < margin
    const inX = cx >= x - margin && cx <= x + w + margin
    const inY = cy >= y - margin && cy <= y + h + margin

    if (onTop && onLeft && inX && inY) return 'nw'
    if (onTop && onRight && inX && inY) return 'ne'
    if (onBottom && onLeft && inX && inY) return 'sw'
    if (onBottom && onRight && inX && inY) return 'se'
    if (onTop && inX) return 'n'
    if (onBottom && inX) return 's'
    if (onLeft && inY) return 'w'
    if (onRight && inY) return 'e'
    return null
  }

  const getEdgeCursor = (edge) => {
    const map = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', w: 'ew-resize', e: 'ew-resize' }
    return map[edge] || 'default'
  }

  const handleMouseDown = (e) => {
    if (e.target.closest('.chat-panel')) return
    if (e.target.closest('.edit-toolbar')) return
    if (e.target.closest('.drawing-canvas')) return

    // Check resize edges first
    if (selection && !activeTool && annotations.length === 0) {
      const edge = getSelectionEdge(e)
      if (edge) {
        setIsResizingSelection(true)
        resizeEdge.current = edge
        moveStart.current = { x: e.clientX, y: e.clientY, sel: { ...selection } }
        return
      }
    }

    // If clicking inside existing selection, start moving it
    if (selection && e.clientX >= selection.x && e.clientX <= selection.x + selection.w
        && e.clientY >= selection.y && e.clientY <= selection.y + selection.h) {
      setIsMovingSelection(true)
      moveStart.current = { x: e.clientX, y: e.clientY, sel: { ...selection } }
      return
    }

    // Remember if chat was open before re-selecting
    chatWasOpenRef.current = chatVisible && !chatMinimized
    setFrozenChatPos(null)

    // Start tracking — will distinguish click vs drag on mouseUp
    setIsSelecting(true)
    setStartPos({ x: e.clientX, y: e.clientY })
    setSelection(null)
    setChatVisible(false)
    if (!chatWasOpenRef.current) setChatFullSize(false)
    setAnnotations([])
    setUndoStack([])
    setActiveTool(null)
    setSelectedAnnotation(null)
  }

  const handleMouseMove = (e) => {
    // Resizing existing selection
    if (isResizingSelection && moveStart.current) {
      const dx = e.clientX - moveStart.current.x
      const dy = e.clientY - moveStart.current.y
      const s = moveStart.current.sel
      const edge = resizeEdge.current
      let { x, y, w, h } = s

      const moveTop = edge === 'n' || edge === 'nw' || edge === 'ne'
      const moveBottom = edge === 's' || edge === 'sw' || edge === 'se'
      const moveLeft = edge === 'w' || edge === 'nw' || edge === 'sw'
      const moveRight = edge === 'e' || edge === 'ne' || edge === 'se'

      if (moveTop) { y = s.y + dy; h = s.h - dy }
      if (moveBottom) { h = s.h + dy }
      if (moveLeft) { x = s.x + dx; w = s.w - dx }
      if (moveRight) { w = s.w + dx }

      if (w < 20) { w = 20; if (moveLeft) x = s.x + s.w - 20 }
      if (h < 20) { h = 20; if (moveTop) y = s.y + s.h - 20 }

      setSelection({ x, y, w, h })
      return
    }

    // Moving existing selection
    if (isMovingSelection && moveStart.current) {
      const dx = e.clientX - moveStart.current.x
      const dy = e.clientY - moveStart.current.y
      const s = moveStart.current.sel
      setSelection({
        x: Math.max(0, Math.min(s.x + dx, window.innerWidth - s.w)),
        y: Math.max(0, Math.min(s.y + dy, window.innerHeight - s.h)),
        w: s.w,
        h: s.h,
      })
      return
    }

    // Update cursor when hovering near selection edges
    if (selection && !activeTool && annotations.length === 0 && !isSelecting) {
      const edge = getSelectionEdge(e)
      if (edge) {
        document.body.style.cursor = getEdgeCursor(edge)
        return
      } else if (e.clientX >= selection.x && e.clientX <= selection.x + selection.w
          && e.clientY >= selection.y && e.clientY <= selection.y + selection.h) {
        document.body.style.cursor = 'move'
        return
      } else {
        document.body.style.cursor = ''
      }
    }

    if (isSelecting && startPos) {
      const dx = Math.abs(e.clientX - startPos.x)
      const dy = Math.abs(e.clientY - startPos.y)

      if (dx > 5 || dy > 5) {
        setHoveredWindow(null)
        const x = Math.min(startPos.x, e.clientX)
        const y = Math.min(startPos.y, e.clientY)
        setSelection({ x, y, w: dx, h: dy })
      }
      return
    }

    if (!selection && !chatVisible) {
      const win = findWindowAtPoint(e.clientX, e.clientY)
      setHoveredWindow(win)
    }
  }

  const handleMouseUp = (e) => {
    if (e.target.closest('.edit-toolbar')) return
    if (e.target.closest('.chat-panel')) return

    // Finish resizing selection
    if (isResizingSelection) {
      setIsResizingSelection(false)
      resizeEdge.current = null
      moveStart.current = null
      document.body.style.cursor = ''
      if (selection) cropSelection(selection, screenImage)
      return
    }

    // Finish moving selection
    if (isMovingSelection) {
      setIsMovingSelection(false)
      moveStart.current = null
      document.body.style.cursor = ''
      if (selection) cropSelection(selection, screenImage)
      return
    }

    if (!isSelecting) return
    setIsSelecting(false)
    setStartPos(null)

    // Dragged a selection
    if (selection && selection.w > 10 && selection.h > 10) {
      setHoveredWindow(null)
      setChatVisible(true)
      setChatMinimized(chatWasOpenRef.current ? false : (userMinimizedRef.current || tm.isNewThread))
      cropSelection(selection, screenImage)
      return
    }

    // It was a click (no drag)
    setSelection(null)
    const win = findWindowAtPoint(e.clientX, e.clientY)
    if (win) {
      const sel = { x: win.x, y: win.y, w: win.w, h: win.h }
      setSelection(sel)
      setHoveredWindow(null)
      setChatVisible(true)
      setChatMinimized(chatWasOpenRef.current ? false : (userMinimizedRef.current || tm.isNewThread))
      cropSelection(sel, screenImage)
    } else {
      closeWithAnimation()
    }
  }



  const handleMinimizeChat = () => {
    setChatMinimized(true)
    userMinimizedRef.current = true
  }

  const handleRestoreChat = () => {
    setChatMinimized(false)
    userMinimizedRef.current = false
  }

  const [frozenChatPos, setFrozenChatPos] = useState(null)

  const handleDismissScreenshot = () => {
    setFrozenChatPos(getChatPosition())
    setSelection(null)
    setCroppedImage(null)
    setAnnotations([])
    setUndoStack([])
    setActiveTool(null)
    setSelectedAnnotation(null)
  }

  const getChatPosition = () => {
    const panelWidth = 380
    const gap = 16
    const margin = 12
    const screenW = window.innerWidth
    const screenH = window.innerHeight
    const compactHeight = 320
    const expandedMax = 550

    if (!selection) return { left: 0, bottom: margin, top: undefined, maxHeight: chatFullSize ? expandedMax : compactHeight }

    const selTop = selection.y
    const selBottom = selection.y + selection.h
    const selMidY = selTop + selection.h / 2

    let pos = {}

    if (selMidY > screenH * 0.4) {
      const bottom = Math.max(margin, screenH - selBottom)
      const availHeight = screenH - bottom - margin
      const maxHeight = chatFullSize ? Math.min(expandedMax, availHeight) : Math.min(compactHeight, availHeight)
      pos = { bottom, top: undefined, maxHeight }
    } else {
      const top = Math.max(margin, selTop)
      const availHeight = screenH - top - margin
      const maxHeight = chatFullSize ? Math.min(expandedMax, availHeight) : Math.min(compactHeight, availHeight)
      pos = { top, bottom: undefined, maxHeight }
    }

    const rightSpace = screenW - (selection.x + selection.w)
    if (rightSpace >= panelWidth + gap) {
      return { left: selection.x + selection.w + gap, ...pos }
    }

    return { left: Math.max(margin, selection.x - panelWidth - gap), ...pos }
  }

  if (!screenImage) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <div className="loading-text">Capturing screen</div>
      </div>
    )
  }

  const chatPos = frozenChatPos || getChatPosition()
  const hasConversation = chatVisible

  return (
    <div
      ref={overlayRef}
      className={`overlay ${isExiting ? 'overlay-exiting' : ''} ${isMovingSelection ? 'overlay-moving' : ''} ${isResizingSelection ? 'overlay-resizing' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="overlay-mask">
        {selection && selection.w > 0 && selection.h > 0 && (
          <svg width="100%" height="100%" className="mask-svg">
            <defs>
              <mask id="selectionMask">
                <rect width="100%" height="100%" fill="white" />
                <rect x={selection.x} y={selection.y} width={selection.w} height={selection.h} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(4, 8, 16, 0.55)" mask="url(#selectionMask)" />
          </svg>
        )}
        {!selection && hoveredWindow && (
          <svg width="100%" height="100%" className="mask-svg">
            <defs>
              <mask id="hoverMask">
                <rect width="100%" height="100%" fill="white" />
                <rect x={hoveredWindow.x} y={hoveredWindow.y} width={hoveredWindow.w} height={hoveredWindow.h} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(4, 8, 16, 0.55)" mask="url(#hoverMask)" />
          </svg>
        )}
        {!selection && !hoveredWindow && <div className="full-dim" />}
      </div>

      {selection && selection.w > 0 && selection.h > 0 && !activeTool && annotations.length === 0 && (
        <div
          className="selection-move-handle"
          style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
        >
          <div className="sel-handle sel-nw" />
          <div className="sel-handle sel-n" />
          <div className="sel-handle sel-ne" />
          <div className="sel-handle sel-w" />
          <div className="sel-handle sel-e" />
          <div className="sel-handle sel-sw" />
          <div className="sel-handle sel-s" />
          <div className="sel-handle sel-se" />
        </div>
      )}

      {!selection && hoveredWindow && (
        <div
          className="window-hover-border"
          style={{ left: hoveredWindow.x, top: hoveredWindow.y, width: hoveredWindow.w, height: hoveredWindow.h }}
        >
          <div className="window-hover-label">
            {hoveredWindow.owner}{hoveredWindow.name ? ` — ${hoveredWindow.name}` : ''}
          </div>
        </div>
      )}

      {selection && selection.w > 0 && (
        <div
          className="selection-border"
          style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
        >
          <div className="corner-tr" />
          <div className="corner-bl" />
          <div className="selection-dimensions">
            {Math.round(selection.w)} × {Math.round(selection.h)}
          </div>
        </div>
      )}

      {/* Drawing canvas overlay */}
      {selection && selection.w > 0 && chatVisible && (
        <DrawingCanvas
          selection={selection}
          activeTool={activeTool}
          activeColor={activeColor}
          activeSize={activeSize}
          annotations={annotations}
          setAnnotations={setAnnotations}
          commitAnnotations={updateAnnotations}
          selectedIndex={selectedAnnotation}
          setSelectedIndex={setSelectedAnnotation}
          mosaicMode={mosaicMode}
          screenImage={screenImage}
          windowOffset={windowOffset}
          displayInfo={displayInfo}
        />
      )}

      {/* Edit toolbar — shown when selection exists */}
      {selection && selection.w > 0 && chatVisible && (
        <EditToolbar
          selection={selection}
          chatPos={chatPos}
          chatHeight={chatPos.maxHeight}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          activeColor={activeColor}
          setActiveColor={setActiveColor}
          activeSize={activeSize}
          setActiveSize={setActiveSize}
          selectedIndex={selectedAnnotation}
          annotations={annotations}
          setAnnotations={updateAnnotations}
          mosaicMode={mosaicMode}
          setMosaicMode={setMosaicMode}
          undo={undo}
          clearAll={clearAll}
          canUndo={undoStack.length > 0}
          onCopy={handleCopy}
          onSave={handleSave}
          copyFeedback={copyFeedback}
          saveFeedback={saveFeedback}
          chatMinimized={chatMinimized}
          onToggleChat={chatMinimized ? handleRestoreChat : handleMinimizeChat}
          onClose={closeWithAnimation}
        />
      )}

      {!chatVisible && !selection && !hoveredWindow && (
        <>
          <div className="hint">
            <div className="hint-icon">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
                <path d="M9 3v18M15 3v18M3 9h18M3 15h18" opacity="0.3" />
              </svg>
            </div>
            <div className="hint-text">Drag to select a region</div>
            <div className="hint-sub">or hover over a window to select it</div>
          </div>
          <div className="shortcut-hint">
            <kbd>ESC</kbd> to close
          </div>
        </>
      )}

      {hasConversation && !chatMinimized && (
        <ChatPanel
          style={{ left: chatPos.left, bottom: chatPos.bottom, top: chatPos.top, height: chatPos.maxHeight }}
          croppedImage={croppedImage}
          getCompositeImage={getCompositeImage}
          currentThread={tm.currentThread}
          setCurrentThread={tm.setCurrentThread}
          recentThreads={tm.recentThreads}
          onThreadChange={tm.handleThreadChange}
          onNewThread={tm.handleNewThread}
          onClearAllThreads={tm.handleClearAllThreads}
          onDismissScreenshot={handleDismissScreenshot}
          annotationCount={annotations.length}
          chatFullSize={chatFullSize}
          setChatFullSize={setChatFullSize}
          isNewThread={tm.isNewThread}
          setIsNewThread={tm.setIsNewThread}
          refreshThreads={tm.refreshThreads}
          refreshProviders={tm.refreshProviders}
          onClose={closeWithAnimation}
          onMinimize={handleMinimizeChat}
          onPin={() => {
            const panel = document.querySelector('.chat-panel')
            const bounds = panel ? {
              x: Math.round(panel.getBoundingClientRect().left),
              y: Math.round(panel.getBoundingClientRect().top),
              width: Math.round(panel.getBoundingClientRect().width),
              height: Math.round(panel.getBoundingClientRect().height),
            } : null
            window.electronAPI?.pinChat({ thread: tm.currentThread, croppedImage }, bounds)
          }}
          provider={tm.provider}
          setProvider={tm.setProvider}
          availableProviders={tm.availableProviders}
        />
      )}

    </div>
  )
}
