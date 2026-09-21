import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadBuiltInContent } from '../../content/catalog'
import {
  emptyCodexState,
  recordCatch,
  toRecordEntry,
  type CatchRecordOutcome,
  type CodexState,
} from '../../domain/codex'
import {
  FishingEngine,
  isTerminalPhase,
  type FishingCommand,
  type FishingSnapshot,
} from '../../domain/fishing'

/**
 * 釣行 1 回分のセッション。
 *
 * Domain の FishingEngine と Codex を保持し、UI 側の都合
 * （tick の刻み、再描画、セッションの作り直し）だけを担当する。
 * 勝敗の判定も、個体生成も、記録のルールもここでは決めない。
 */

export type FishingSession = {
  readonly contentError: string | null
  readonly snapshot: FishingSnapshot | null
  /** このセッションの seed。同じ seed なら同じ経過を再現できる。 */
  readonly seed: string
  readonly codex: CodexState
  /** 直近の捕獲で記録がどう更新されたか。 */
  readonly lastCatch: CatchRecordOutcome | null
  readonly send: (command: FishingCommand) => void
  /** 新しい seed でやり直す。seed を渡すと同じ経過を再挑戦できる。 */
  readonly restart: (seed?: string) => void
}

const createSessionSeed = (): string => `s${Date.now().toString(36)}`

export const useFishingSession = (): FishingSession => {
  const [session, setSession] = useState(() => ({ seed: createSessionSeed(), nonce: 0 }))
  const engineRef = useRef<FishingEngine | null>(null)
  const [snapshot, setSnapshot] = useState<FishingSnapshot | null>(null)

  // Codex はセッションをまたいで保持する（アプリ実行中のみ。永続化は後 Phase）。
  const codexRef = useRef<CodexState>(emptyCodexState())
  const [codex, setCodex] = useState<CodexState>(() => codexRef.current)
  const [lastCatch, setLastCatch] = useState<CatchRecordOutcome | null>(null)

  // コンテンツは起動時に 1 度だけ検証する。
  const content = useMemo(() => {
    try {
      return { ok: true as const, value: loadBuiltInContent() }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }, [])

  // セッション開始（内容・seed が変わったとき）。
  useEffect(() => {
    if (!content.ok) {
      return
    }

    const engine = new FishingEngine({
      encounters: content.value.encounters,
      seed: session.seed,
      spotId: content.value.primarySpot.id,
    })

    engineRef.current = engine
    setSnapshot(engine.snapshot())
  }, [content, session])

  const isRunning = snapshot !== null && !isTerminalPhase(snapshot.phase)

  // tick を刻む。終了状態では止める。
  useEffect(() => {
    if (!isRunning) {
      return
    }

    const engine = engineRef.current

    if (engine === null) {
      return
    }

    const interval = window.setInterval(() => {
      const result = engine.tick()
      setSnapshot(result.snapshot)

      // 取り込んだ瞬間だけ記録する（LANDED は 1 回しか出ない）。
      if (result.events.includes('LANDED')) {
        const individual = result.snapshot.fish?.individual

        if (individual !== undefined) {
          const outcome = recordCatch(
            codexRef.current,
            toRecordEntry(individual, new Date().toISOString()),
          )
          codexRef.current = outcome.state
          setCodex(outcome.state)
          setLastCatch(outcome)
        }
      }
    }, engine.tuning.tickMs)

    return () => {
      window.clearInterval(interval)
    }
  }, [isRunning, session])

  const send = useCallback((command: FishingCommand) => {
    const engine = engineRef.current

    if (engine === null) {
      return
    }

    setSnapshot(engine.dispatch(command).snapshot)
  }, [])

  const restart = useCallback((seed?: string) => {
    setSession((previous) => ({
      seed: seed ?? createSessionSeed(),
      nonce: previous.nonce + 1,
    }))
  }, [])

  return {
    contentError: content.ok ? null : content.message,
    snapshot,
    seed: session.seed,
    codex,
    lastCatch,
    send,
    restart,
  }
}
