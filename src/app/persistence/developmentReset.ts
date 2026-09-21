import { IndexedDbSaveRepository } from '../../infrastructure/persistence/indexedDbSaveRepository'

/**
 * 開発用: 保存データを消す（プレイテストのやり直し）。
 *
 * 個人開発のゲームなので、「最初から遊び直す」手段を 1 つだけ用意する。
 * 通常のプレイでは呼ばない（起動時に勝手に消す処理は入れない）。
 * UI が IndexedDB を直接知らないよう、Application 層のこの関数だけを公開する。
 */
export const clearDevelopmentSave = async (): Promise<void> => {
  await new IndexedDbSaveRepository().clear()
}
