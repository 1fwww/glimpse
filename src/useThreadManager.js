import { useState, useCallback, useEffect } from 'react'

const STALE_THRESHOLD = 5 * 60 * 1000

function newThread() {
  return { id: null, title: 'New Chat', messages: [], createdAt: Date.now(), updatedAt: Date.now() }
}

export default function useThreadManager() {
  const [currentThread, setCurrentThread] = useState(null)
  const [recentThreads, setRecentThreads] = useState([])
  const [isNewThread, setIsNewThread] = useState(false)
  const [provider, setProvider] = useState('claude')
  const [availableProviders, setAvailableProviders] = useState([])

  // Load threads + providers on mount
  useEffect(() => {
    const load = () => {
      if (!window.electronAPI?.getThreads) {
        setTimeout(load, 100)
        return
      }
      window.electronAPI.getAvailableProviders?.().then(providers => {
        setAvailableProviders(providers || [])
        if (providers?.length > 0) setProvider(providers[0].id)
      })
      window.electronAPI.getThreads().then(threads => {
        setRecentThreads(threads || [])
        const mostRecent = threads?.[0]
        if (mostRecent && (Date.now() - mostRecent.updatedAt) < STALE_THRESHOLD) {
          setCurrentThread(mostRecent)
          setIsNewThread(false)
        } else {
          setCurrentThread(newThread())
          setIsNewThread(true)
        }
      })
    }
    load()
  }, [])


  const handleThreadChange = useCallback((thread) => {
    setCurrentThread(thread)
    setIsNewThread(false)
  }, [])

  const handleNewThread = useCallback(() => {
    setCurrentThread(newThread())
    setIsNewThread(true)
  }, [])

  const handleSetCurrentThread = useCallback((thread) => {
    setCurrentThread(thread)
    window.electronAPI?.getThreads?.().then(threads => {
      setRecentThreads(threads || [])
    })
  }, [])

  const refreshThreads = useCallback(() => {
    window.electronAPI?.getThreads?.().then(threads => {
      setRecentThreads(threads || [])
    })
  }, [])

  const handleClearAllThreads = useCallback(async () => {
    for (const t of recentThreads) {
      await window.electronAPI?.deleteThread(t.id)
    }
    setRecentThreads([])
    setCurrentThread(newThread())
    setIsNewThread(true)
  }, [recentThreads])

  // Refresh threads with time heuristic (called by overlay on screen capture)
  const refreshWithHeuristic = useCallback(() => {
    window.electronAPI?.getThreads?.().then(threads => {
      setRecentThreads(threads || [])
      const mostRecent = threads?.[0]
      if (mostRecent && (Date.now() - mostRecent.updatedAt) < STALE_THRESHOLD) {
        setCurrentThread(mostRecent)
        setIsNewThread(false)
      } else {
        setCurrentThread(newThread())
        setIsNewThread(true)
      }
    })
  }, [])

  return {
    currentThread,
    setCurrentThread: handleSetCurrentThread,
    recentThreads,
    isNewThread,
    setIsNewThread,
    provider,
    setProvider,
    availableProviders,
    handleThreadChange,
    handleNewThread,
    handleClearAllThreads,
    refreshThreads,
    refreshWithHeuristic,
  }
}
