import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ChatOnlyApp from './ChatOnlyApp'

const isChatOnly = window.location.hash.startsWith('#chat-only')

ReactDOM.createRoot(document.getElementById('root')).render(
  isChatOnly ? <ChatOnlyApp /> : <App />
)
