import React, { useRef, useState, useEffect, useCallback } from 'react'

// ── Hit testing ──

function getBounds(ann) {
  switch (ann.type) {
    case 'rect':
    case 'ellipse':
    case 'line':
    case 'arrow': {
      const x = Math.min(ann.x1, ann.x2)
      const y = Math.min(ann.y1, ann.y2)
      const w = Math.abs(ann.x2 - ann.x1)
      const h = Math.abs(ann.y2 - ann.y1)
      return { x, y, w, h }
    }
    case 'pen': {
      if (!ann.points?.length) return null
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of ann.points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }
    case 'text': {
      const charW = ann.size * 0.6
      const w = ann.text.length * charW + 12
      const lines = ann.text.split('\n').length
      const h = ann.size * lines + 6
      return { x: ann.x, y: ann.y, w, h }
    }
    case 'mosaic-rect': {
      const x = Math.min(ann.x1, ann.x2), y = Math.min(ann.y1, ann.y2)
      const w = Math.abs(ann.x2 - ann.x1), h = Math.abs(ann.y2 - ann.y1)
      return { x, y, w, h }
    }
    default: return null
  }
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function hitTest(ann, pos, threshold = 8) {
  const { x, y } = pos
  switch (ann.type) {
    case 'rect': {
      const bx = Math.min(ann.x1, ann.x2), by = Math.min(ann.y1, ann.y2)
      const bw = Math.abs(ann.x2 - ann.x1), bh = Math.abs(ann.y2 - ann.y1)
      const nearLeft = Math.abs(x - bx) < threshold && y >= by - threshold && y <= by + bh + threshold
      const nearRight = Math.abs(x - (bx + bw)) < threshold && y >= by - threshold && y <= by + bh + threshold
      const nearTop = Math.abs(y - by) < threshold && x >= bx - threshold && x <= bx + bw + threshold
      const nearBottom = Math.abs(y - (by + bh)) < threshold && x >= bx - threshold && x <= bx + bw + threshold
      return nearLeft || nearRight || nearTop || nearBottom
    }
    case 'ellipse': {
      const cx = (ann.x1 + ann.x2) / 2, cy = (ann.y1 + ann.y2) / 2
      const rx = Math.abs(ann.x2 - ann.x1) / 2, ry = Math.abs(ann.y2 - ann.y1) / 2
      if (rx === 0 || ry === 0) return false
      const val = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
      return Math.abs(val - 1) < threshold / Math.min(rx, ry)
    }
    case 'line':
    case 'arrow':
      return distToSegment(x, y, ann.x1, ann.y1, ann.x2, ann.y2) < threshold
    case 'pen': {
      if (!ann.points || ann.points.length < 2) return false
      for (let i = 1; i < ann.points.length; i++) {
        if (distToSegment(x, y, ann.points[i - 1].x, ann.points[i - 1].y, ann.points[i].x, ann.points[i].y) < threshold) return true
      }
      return false
    }
    case 'text':
    case 'mosaic-rect': {
      const bounds = getBounds(ann)
      return bounds && x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h
    }
    default: return false
  }
}

function moveAnnotation(ann, dx, dy) {
  switch (ann.type) {
    case 'rect': case 'ellipse': case 'line': case 'arrow': case 'mosaic-rect':
      return { ...ann, x1: ann.x1 + dx, y1: ann.y1 + dy, x2: ann.x2 + dx, y2: ann.y2 + dy }
    case 'pen':
      return { ...ann, points: ann.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
    case 'text':
      return { ...ann, x: ann.x + dx, y: ann.y + dy }
    default: return ann
  }
}

// ── Resize handles ──

const HANDLE_SIZE = 10
const HANDLE_HIT = 12

function getHandles(ann) {
  if (ann.type === 'line' || ann.type === 'arrow') {
    return [
      { id: 'p1', x: ann.x1, y: ann.y1 },
      { id: 'p2', x: ann.x2, y: ann.y2 },
    ]
  }
  const bounds = getBounds(ann)
  if (!bounds) return []
  const { x, y, w, h } = bounds
  return [
    { id: 'tl', x, y, cursor: 'nwse-resize' },
    { id: 'tr', x: x + w, y, cursor: 'nesw-resize' },
    { id: 'bl', x, y: y + h, cursor: 'nesw-resize' },
    { id: 'br', x: x + w, y: y + h, cursor: 'nwse-resize' },
  ]
}

function hitTestHandle(handles, pos) {
  for (const h of handles) {
    if (Math.abs(pos.x - h.x) < HANDLE_HIT && Math.abs(pos.y - h.y) < HANDLE_HIT) return h
  }
  return null
}

function resizeAnnotation(ann, handleId, pos) {
  if (ann.type === 'line' || ann.type === 'arrow') {
    if (handleId === 'p1') return { ...ann, x1: pos.x, y1: pos.y }
    if (handleId === 'p2') return { ...ann, x2: pos.x, y2: pos.y }
    return ann
  }

  if (ann.type === 'rect' || ann.type === 'ellipse') {
    let { x1, y1, x2, y2 } = ann
    // Normalize so x1,y1 is min and x2,y2 is max
    const minX = Math.min(x1, x2), minY = Math.min(y1, y2)
    const maxX = Math.max(x1, x2), maxY = Math.max(y1, y2)
    let nx1 = minX, ny1 = minY, nx2 = maxX, ny2 = maxY
    if (handleId === 'tl') { nx1 = pos.x; ny1 = pos.y }
    else if (handleId === 'tr') { nx2 = pos.x; ny1 = pos.y }
    else if (handleId === 'bl') { nx1 = pos.x; ny2 = pos.y }
    else if (handleId === 'br') { nx2 = pos.x; ny2 = pos.y }
    return { ...ann, x1: nx1, y1: ny1, x2: nx2, y2: ny2 }
  }

  if (ann.type === 'pen') {
    const oldBounds = getBounds(ann)
    if (!oldBounds || oldBounds.w === 0 || oldBounds.h === 0) return ann
    let nx = oldBounds.x, ny = oldBounds.y
    let nw = oldBounds.w, nh = oldBounds.h
    if (handleId === 'tl') { nw += nx - pos.x; nh += ny - pos.y; nx = pos.x; ny = pos.y }
    else if (handleId === 'tr') { nw = pos.x - nx; nh += ny - pos.y; ny = pos.y }
    else if (handleId === 'bl') { nw += nx - pos.x; nx = pos.x; nh = pos.y - ny }
    else if (handleId === 'br') { nw = pos.x - nx; nh = pos.y - ny }
    if (nw <= 0 || nh <= 0) return ann
    const sx = nw / oldBounds.w, sy = nh / oldBounds.h
    return {
      ...ann,
      points: ann.points.map(p => ({
        x: nx + (p.x - oldBounds.x) * sx,
        y: ny + (p.y - oldBounds.y) * sy,
      })),
    }
  }

  return ann
}

function getHandleCursor(handleId, annType) {
  if (annType === 'line' || annType === 'arrow') return 'crosshair'
  const cursors = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize' }
  return cursors[handleId] || 'default'
}

// ── Component ──

export default function DrawingCanvas({
  selection,
  activeTool,
  activeColor,
  activeSize,
  annotations,
  setAnnotations,      // raw setter — for drag updates (no undo history)
  commitAnnotations,   // wrapped — pushes to undo stack
  selectedIndex,
  setSelectedIndex,
  mosaicMode,
  screenImage,
  windowOffset,
  displayInfo,
}) {
  const screenImgRef = useRef(null)

  // Load screen image for mosaic
  useEffect(() => {
    if (!screenImage) return
    const img = new Image()
    img.onload = () => { screenImgRef.current = img }
    img.src = screenImage
  }, [screenImage])
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState(null)
  const [currentShape, setCurrentShape] = useState(null)
  const [textInput, setTextInput] = useState(null)
  const textInputRef = useRef(null)

  // Move & resize
  const preDragAnnotations = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [activeHandle, setActiveHandle] = useState(null)
  const [dragStart, setDragStart] = useState(null)
  const [hoverCursor, setHoverCursor] = useState(null)

  useEffect(() => {
    if (activeTool) setSelectedIndex(null)
  }, [activeTool])

  // Redraw
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < annotations.length; i++) {
      drawAnnotation(ctx, annotations[i], screenImgRef.current, selection, windowOffset, displayInfo)
      if (i === selectedIndex) {
        const ann = annotations[i]
        const bounds = getBounds(ann)
        if (bounds) {
          ctx.save()
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)'
          ctx.lineWidth = 1
          ctx.setLineDash([4, 3])
          ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8)
          ctx.setLineDash([])

          // Draw handles — filled circles with glow
          const handles = getHandles(ann)
          for (const h of handles) {
            ctx.save()
            ctx.shadowColor = 'rgba(0, 229, 255, 0.6)'
            ctx.shadowBlur = 6
            ctx.beginPath()
            ctx.arc(h.x, h.y, HANDLE_SIZE / 2, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(0, 229, 255, 0.9)'
            ctx.fill()
            ctx.restore()
            // Inner dot
            ctx.beginPath()
            ctx.arc(h.x, h.y, 2.5, 0, Math.PI * 2)
            ctx.fillStyle = '#ffffff'
            ctx.fill()
          }
          ctx.restore()
        }
      }
    }

    if (currentShape) drawAnnotation(ctx, currentShape, screenImgRef.current, selection, windowOffset, displayInfo)
  }, [annotations, currentShape, selectedIndex])

  useEffect(() => { redraw() }, [redraw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !selection) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = selection.w * dpr
    canvas.height = selection.h * dpr
    canvas.style.width = `${selection.w}px`
    canvas.style.height = `${selection.h}px`
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    redraw()
  }, [selection?.w, selection?.h])

  useEffect(() => {
    if (textInput && textInputRef.current) textInputRef.current.focus()
  }, [textInput])

  // Delete selected
  useEffect(() => {
    const handleKey = (e) => {
      if (selectedIndex !== null && (e.key === 'Delete' || e.key === 'Backspace') && !textInput) {
        e.preventDefault()
        commitAnnotations(prev => prev.filter((_, i) => i !== selectedIndex))
        setSelectedIndex(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedIndex, textInput, setAnnotations])

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const getTextFontSize = () => activeTool === 'text' ? activeSize : Math.max(14, activeSize * 5)

  const commitTextInput = () => {
    if (textInput && textInput.value.trim()) {
      commitAnnotations(prev => [...prev, {
        type: 'text', x: textInput.x, y: textInput.y,
        text: textInput.value, color: textInput.color, size: textInput.fontSize,
      }])
    }
    setTextInput(null)
  }

  const handleMouseDown = (e) => {
    if (textInput) { commitTextInput(); return }
    e.stopPropagation()
    const pos = getPos(e)

    // Check resize handles first (if something is selected)
    if (selectedIndex !== null && annotations[selectedIndex]?.type !== 'text') {
      const handles = getHandles(annotations[selectedIndex])
      const handle = hitTestHandle(handles, pos)
      if (handle) {
        preDragAnnotations.current = [...annotations]
        setIsResizing(true)
        setActiveHandle(handle.id)
        return
      }
    }

    // Check if clicking on an annotation
    for (let i = annotations.length - 1; i >= 0; i--) {
      if (hitTest(annotations[i], pos)) {
        preDragAnnotations.current = [...annotations]
        setSelectedIndex(i)
        setIsDragging(true)
        setDragStart(pos)
        return
      }
    }

    if (selectedIndex !== null) setSelectedIndex(null)
    if (!activeTool) return

    if (activeTool === 'mosaic') {
      setIsDrawing(true)
      setDrawStart(pos)
      if (mosaicMode === 'rect') {
        setCurrentShape({ type: 'mosaic-rect', x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
      } else {
        setCurrentShape({ type: 'mosaic', points: [pos], size: activeSize })
      }
      return
    }

    if (activeTool === 'text') {
      e.preventDefault()
      setTextInput({ x: pos.x, y: pos.y, value: '', color: activeColor, fontSize: getTextFontSize() })
      return
    }

    setIsDrawing(true)
    setDrawStart(pos)
    if (activeTool === 'pen') {
      setCurrentShape({ type: 'pen', points: [pos], color: activeColor, size: activeSize })
    }
  }

  const handleMouseMove = (e) => {
    const pos = getPos(e)

    // Resizing
    if (isResizing && selectedIndex !== null && activeHandle) {
      setAnnotations(prev => prev.map((ann, i) =>
        i === selectedIndex ? resizeAnnotation(ann, activeHandle, pos) : ann
      ))
      return
    }

    // Moving
    if (isDragging && selectedIndex !== null && dragStart) {
      const dx = pos.x - dragStart.x
      const dy = pos.y - dragStart.y
      setAnnotations(prev => prev.map((ann, i) =>
        i === selectedIndex ? moveAnnotation(ann, dx, dy) : ann
      ))
      setDragStart(pos)
      return
    }

    // Hover cursor detection
    if (!isDragging && !isDrawing && !isResizing) {
      // Check handles of selected annotation first
      if (selectedIndex !== null && annotations[selectedIndex]?.type !== 'text') {
        const handles = getHandles(annotations[selectedIndex])
        const handle = hitTestHandle(handles, pos)
        if (handle) {
          setHoverCursor(getHandleCursor(handle.id, annotations[selectedIndex].type))
          return
        }
      }
      // Check annotation bodies
      let found = false
      for (let i = annotations.length - 1; i >= 0; i--) {
        if (hitTest(annotations[i], pos)) { found = true; break }
      }
      setHoverCursor(found ? 'grab' : null)
      return
    }

    // Drawing
    if (!isDrawing || !drawStart) return
    if (activeTool === 'mosaic') {
      if (mosaicMode === 'rect') {
        setCurrentShape(prev => ({ ...prev, x2: pos.x, y2: pos.y }))
      } else {
        setCurrentShape(prev => ({ ...prev, points: [...(prev?.points || []), pos] }))
      }
      return
    }
    if (activeTool === 'pen') {
      setCurrentShape(prev => ({ ...prev, points: [...(prev?.points || []), pos] }))
    } else if (['rect', 'ellipse', 'line', 'arrow'].includes(activeTool)) {
      setCurrentShape({
        type: activeTool, x1: drawStart.x, y1: drawStart.y,
        x2: pos.x, y2: pos.y, color: activeColor, size: activeSize,
      })
    }
  }

  const handleMouseUp = () => {
    if (isResizing || isDragging) {
      // Commit the move/resize to undo history
      if (preDragAnnotations.current) {
        commitAnnotations(() => annotations)
        preDragAnnotations.current = null
      }
      setIsResizing(false)
      setActiveHandle(null)
      setIsDragging(false)
      setDragStart(null)
      return
    }
    if (!isDrawing) return
    setIsDrawing(false)
    setDrawStart(null)
    if (currentShape) {
      commitAnnotations(prev => [...prev, currentShape])
      setCurrentShape(null)
    }
  }

  const handleTextKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextInput() }
    if (e.key === 'Escape') setTextInput(null)
    e.stopPropagation()
  }

  if (!selection) return null

  let cursor = 'default'
  if (isResizing) cursor = getHandleCursor(activeHandle, annotations[selectedIndex]?.type)
  else if (isDragging) cursor = 'grabbing'
  else if (hoverCursor) cursor = hoverCursor
  else if (activeTool === 'text') cursor = 'text'
  else if (activeTool) cursor = 'crosshair'

  return (
    <>
      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        style={{
          position: 'absolute',
          left: selection.x, top: selection.y,
          width: selection.w, height: selection.h,
          cursor,
          pointerEvents: activeTool || annotations.length > 0 ? 'auto' : 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={(e) => {
          const pos = getPos(e)
          for (let i = annotations.length - 1; i >= 0; i--) {
            if (annotations[i].type === 'text' && hitTest(annotations[i], pos)) {
              const ann = annotations[i]
              setTextInput({ x: ann.x, y: ann.y, value: ann.text, color: ann.color, fontSize: ann.size })
              commitAnnotations(prev => prev.filter((_, j) => j !== i))
              setSelectedIndex(null)
              setIsDragging(false)
              return
            }
          }
        }}
      />
      {textInput && (
        <textarea
          ref={textInputRef}
          className="annotation-text-input"
          style={{
            left: selection.x + textInput.x, top: selection.y + textInput.y,
            color: textInput.color, borderColor: textInput.color, fontSize: textInput.fontSize,
          }}
          value={textInput.value}
          onChange={(e) => setTextInput(prev => ({ ...prev, value: e.target.value }))}
          onKeyDown={handleTextKeyDown}
          onBlur={commitTextInput}
          onMouseDown={(e) => e.stopPropagation()}
          rows={1}
        />
      )}
    </>
  )
}

// ── Drawing ──

function drawAnnotation(ctx, ann, screenImg, selection, windowOffset, displayInfo) {
  ctx.strokeStyle = ann.color
  ctx.fillStyle = ann.color
  ctx.lineWidth = ann.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (ann.type) {
    case 'rect': {
      const x = Math.min(ann.x1, ann.x2), y = Math.min(ann.y1, ann.y2)
      const w = Math.abs(ann.x2 - ann.x1), h = Math.abs(ann.y2 - ann.y1)
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.stroke()
      break
    }
    case 'ellipse': {
      const cx = (ann.x1 + ann.x2) / 2, cy = (ann.y1 + ann.y2) / 2
      const rx = Math.abs(ann.x2 - ann.x1) / 2, ry = Math.abs(ann.y2 - ann.y1) / 2
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke()
      break
    }
    case 'line': {
      ctx.beginPath(); ctx.moveTo(ann.x1, ann.y1); ctx.lineTo(ann.x2, ann.y2); ctx.stroke()
      break
    }
    case 'arrow': {
      const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1)
      const headLen = Math.max(10, ann.size * 4)
      ctx.beginPath(); ctx.moveTo(ann.x1, ann.y1); ctx.lineTo(ann.x2, ann.y2); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(ann.x2, ann.y2)
      ctx.lineTo(ann.x2 - headLen * Math.cos(angle - Math.PI / 6), ann.y2 - headLen * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(ann.x2, ann.y2)
      ctx.lineTo(ann.x2 - headLen * Math.cos(angle + Math.PI / 6), ann.y2 - headLen * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
      break
    }
    case 'pen': {
      if (!ann.points || ann.points.length < 2) break
      ctx.beginPath(); ctx.moveTo(ann.points[0].x, ann.points[0].y)
      for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y)
      ctx.stroke()
      break
    }
    case 'text': {
      ctx.font = `500 ${ann.size}px -apple-system, BlinkMacSystemFont, sans-serif`
      ctx.textBaseline = 'top'
      const padX = 4 + 1.5, padY = 1 + 1.5 + 1
      const lines = ann.text.split('\n')
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], ann.x + padX, ann.y + padY + i * ann.size)
      break
    }
    case 'mosaic-rect': {
      if (!screenImg || !selection) break
      const blockSize = 10
      const rx = Math.min(ann.x1, ann.x2), ry = Math.min(ann.y1, ann.y2)
      const rw = Math.abs(ann.x2 - ann.x1), rh = Math.abs(ann.y2 - ann.y1)
      if (rw < 2 || rh < 2) break
      const dw = displayInfo?.width || window.innerWidth
      const sx2 = screenImg.naturalWidth / dw
      const sy2 = screenImg.naturalHeight / (displayInfo?.height || window.innerHeight)
      const offX2 = (windowOffset?.x || 0) + selection.x
      const offY2 = (windowOffset?.y || 0) + selection.y

      const tmpC = document.createElement('canvas')
      tmpC.width = selection.w; tmpC.height = selection.h
      const tmpX = tmpC.getContext('2d')
      tmpX.drawImage(screenImg, offX2 * sx2, offY2 * sy2, selection.w * sx2, selection.h * sy2, 0, 0, selection.w, selection.h)

      ctx.save()
      for (let gx = rx; gx < rx + rw; gx += blockSize) {
        for (let gy = ry; gy < ry + rh; gy += blockSize) {
          const bw = Math.min(blockSize, rx + rw - gx)
          const bh = Math.min(blockSize, ry + rh - gy)
          if (gx < 0 || gy < 0 || gx >= selection.w || gy >= selection.h) continue
          const sd = tmpX.getImageData(Math.max(0, gx), Math.max(0, gy), Math.min(bw, selection.w - gx), Math.min(bh, selection.h - gy)).data
          let r = 0, g = 0, b = 0, cnt = 0
          for (let k = 0; k < sd.length; k += 4) { r += sd[k]; g += sd[k+1]; b += sd[k+2]; cnt++ }
          if (cnt > 0) {
            ctx.fillStyle = `rgb(${Math.round(r/cnt)},${Math.round(g/cnt)},${Math.round(b/cnt)})`
            ctx.fillRect(gx, gy, bw, bh)
          }
        }
      }
      ctx.restore()
      break
    }
    case 'mosaic': {
      if (!ann.points || ann.points.length < 2 || !screenImg || !selection) break
      const blockSize = Math.max(8, Math.round(ann.size / 3))
      const brushRadius = ann.size / 2
      const dw = displayInfo?.width || window.innerWidth
      const dh = displayInfo?.height || window.innerHeight
      const sx = screenImg.naturalWidth / dw
      const sy = screenImg.naturalHeight / dh
      const offX = (windowOffset?.x || 0) + selection.x
      const offY = (windowOffset?.y || 0) + selection.y

      // Create a temp canvas to sample the screen image at the selection area
      const tmpCanvas = document.createElement('canvas')
      tmpCanvas.width = selection.w
      tmpCanvas.height = selection.h
      const tmpCtx = tmpCanvas.getContext('2d')
      tmpCtx.drawImage(
        screenImg,
        offX * sx, offY * sy, selection.w * sx, selection.h * sy,
        0, 0, selection.w, selection.h
      )

      // For each point in the brush path, pixelate a region
      ctx.save()
      for (const p of ann.points) {
        const bx = Math.floor((p.x - brushRadius) / blockSize) * blockSize
        const by = Math.floor((p.y - brushRadius) / blockSize) * blockSize
        const ex = Math.ceil((p.x + brushRadius) / blockSize) * blockSize
        const ey = Math.ceil((p.y + brushRadius) / blockSize) * blockSize

        for (let gx = bx; gx < ex; gx += blockSize) {
          for (let gy = by; gy < ey; gy += blockSize) {
            // Check if block center is within brush radius
            const cx = gx + blockSize / 2, cy = gy + blockSize / 2
            if (Math.hypot(cx - p.x, cy - p.y) > brushRadius) continue
            if (gx < 0 || gy < 0 || gx >= selection.w || gy >= selection.h) continue

            // Sample average color from temp canvas
            const sampleData = tmpCtx.getImageData(
              Math.max(0, gx), Math.max(0, gy),
              Math.min(blockSize, selection.w - gx), Math.min(blockSize, selection.h - gy)
            ).data
            let r = 0, g = 0, b = 0, count = 0
            for (let k = 0; k < sampleData.length; k += 4) {
              r += sampleData[k]; g += sampleData[k + 1]; b += sampleData[k + 2]; count++
            }
            if (count > 0) {
              ctx.fillStyle = `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`
              ctx.fillRect(gx, gy, blockSize, blockSize)
            }
          }
        }
      }
      ctx.restore()
      break
    }
  }
}
