import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IndexedDbSaveRepository } from '../infrastructure/persistence/indexedDbSaveRepository'
import { useAppStore } from '../state/appStore'
import { usePlayerStore } from '../state/playerStore'
import { AppShell } from '../ui/AppShell'
import '../ui/styles/tokens.css'
import '../ui/styles/global.css'
import { createPersistenceCoordinator } from './persistence/persistenceCoordinator'
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

// Service Worker は本番ビルドでのみ登録する。
if (import.meta.env.PROD) {
  registerServiceWorker()
}

/*
 * Save / Load の配線。
 *
 * hydration が終わるまで Store の操作は無効で、保存も始まらない。
 * 壊れた Save は読み込まずに error 状態へ移る（上書きはしない）。
 */
const coordinator = createPersistenceCoordinator({
  repository: new IndexedDbSaveRepository(),
  store: usePlayerStore,
})

void coordinator.start()
