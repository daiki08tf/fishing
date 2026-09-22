import { isTerminalPhase, type FishingPhase } from '../../domain/fishing'

/**
 * 釣り画面の「結果優先」レイアウト判定（Phase 14.1）。
 *
 * Phase 14.1 の課題は「LANDED 直後に結果が初期 viewport の下へ隠れる」ことだった。
 * ここでは **表示の順序と出し分けの判定だけ** を純粋関数として持つ
 * （Domain の phase 判定 `isTerminalPhase` をそのまま使い、新しいルールは作らない）。
 */

/** 釣りが終わった phase（LANDED / HOOK_MISSED / HOOK_ESCAPE / LINE_BREAK）。 */
export const isFishingFinished = (phase: FishingPhase): boolean => isTerminalPhase(phase)

/**
 * ファイト系 UI（Fish stamina / Tension / Hook hold / Distance / Drag / 行動ログ /
 * ファイトコマンド / AUTO）を出してよいか。
 *
 * 終了後は操作できない戦闘 UI が結果を押し下げるだけなので出さない。
 */
export const isFightUiVisible = (phase: FishingPhase): boolean => !isTerminalPhase(phase)

/** 結果を最優先で見せる phase か（Phase 14.1 は LANDED だけを対象にする）。 */
export const isResultFirstPhase = (phase: FishingPhase): boolean => phase === 'LANDED'
