import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useAppStore } from '../state/appStore'
import { AppShell } from '../ui/AppShell'
import '../ui/styles/global.css'
import { registerServiceWorker } from './registerServiceWorker'

const container = document.getElementById('root')

if (container === null) {
  throw new Error('Root container #root was not found in index.html')
}

createRoot(container).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
)

useAppStore.getState().setStatus('ready')

if (import.meta.env.PROD) {
  registerServiceWorker()
}
