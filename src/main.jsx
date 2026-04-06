import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ChatOnlyApp from './ChatOnlyApp'
import WelcomeApp from './WelcomeApp'
import SettingsApp from './SettingsApp'
import HomeApp from './HomeApp'

const hash = window.location.hash
const root = ReactDOM.createRoot(document.getElementById('root'))

if (hash.startsWith('#home')) {
  root.render(<HomeApp />)
} else if (hash.startsWith('#welcome')) {
  root.render(<WelcomeApp />)
} else if (hash.startsWith('#settings')) {
  root.render(<SettingsApp />)
} else if (hash.startsWith('#chat-only')) {
  root.render(<ChatOnlyApp />)
} else {
  root.render(<App />)
}
