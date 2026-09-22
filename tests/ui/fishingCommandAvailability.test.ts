import { describe, expect, it } from 'vitest'
import { ALLOWED_COMMANDS, FISHING_COMMANDS, type FishingCommand } from '../../src/domain/fishing'
import {
  ACTION_LABELS,
  FIGHT_COMMANDS,
  LANDING_COMMANDS,
  PRE_FIGHT_COMMANDS,
} from '../../src/ui/fishing/FishingScreen'

/**
 * Phase 14 — 釣り画面のコマンドボタン availability。
 *
 * FishingScreen は「許可されたコマンドを送る」だけで、勝敗判定はしない
 * （ARCHITECTURE.md §6 / FishingPhase.ts のコメント通り）。
 *
 * ここでは、既存の renderToStaticMarkup では追えない実際のボタン disabled 状態の
 * 代わりに、UI が持つボタングループ（FIGHT_COMMANDS / LANDING_COMMANDS /
 * PRE_FIGHT_COMMANDS）が Domain の ALLOWED_COMMANDS と過不足なく一致していることを
 * 保証する。ここがズレると「押せるのに拒否される」「押せるはずが出ない」ボタンが生まれる。
 * （FishingSnapshot の初期化は useEffect 内で行われるため、renderToStaticMarkup では
 * 常に「読み込み中」までしか到達せず、実際の disabled 状態は検証できない。）
 */

describe('fishing command wiring', () => {
  it('exposes a label for every domain fishing command', () => {
    for (const command of FISHING_COMMANDS) {
      expect(ACTION_LABELS[command]).toBeTruthy()
    }
  })

  it('FIGHT_COMMANDS matches exactly what FIGHTING allows', () => {
    expect([...FIGHT_COMMANDS].sort()).toEqual([...ALLOWED_COMMANDS.FIGHTING].sort())
  })

  it('LANDING_COMMANDS matches exactly what LANDING allows', () => {
    expect([...LANDING_COMMANDS].sort()).toEqual([...ALLOWED_COMMANDS.LANDING].sort())
  })

  it('PRE_FIGHT_COMMANDS (cast/hook) matches IDLE ∪ HOOK_WINDOW', () => {
    const expected = new Set<FishingCommand>([
      ...ALLOWED_COMMANDS.IDLE,
      ...ALLOWED_COMMANDS.HOOK_WINDOW,
    ])

    expect(new Set(PRE_FIGHT_COMMANDS)).toEqual(expected)
  })

  it('cast is only ever allowed from IDLE, hook only from HOOK_WINDOW', () => {
    for (const phase of Object.keys(ALLOWED_COMMANDS) as (keyof typeof ALLOWED_COMMANDS)[]) {
      if (phase !== 'IDLE') {
        expect(ALLOWED_COMMANDS[phase]).not.toContain('cast')
      }

      if (phase !== 'HOOK_WINDOW') {
        expect(ALLOWED_COMMANDS[phase]).not.toContain('hook')
      }
    }
  })
})
