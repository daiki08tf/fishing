import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadPhase1SampleContent } from '../../content/catalog'
import {
  FishingEngine,
  isTerminalPhase,
  type FishingCommand,
  type FishingSnapshot,
} from '../../domain/fishing'

/**
 * 釣行 1 回分のセッション。
 *
 * Domain の FishingEngine を保持し、UI 側の都合（tick の刻み、再描画、
 * セッションの作り直し）だけを担当する。
 * 勝敗の判定は一切ここで行わない。
 */

export type FishingSession = {
  readonly contentError: string | null
  readonly snapshot: FishingSnapshot | null
  /** このセッションの seed。同じ seed なら同じ経過を再現できる。 */
  readonly seed: string
  readonly send: (command: FishingCommand) => void
  /** 新しい seed でやり直す。seed を渡すと同じ経過を再挑戦できる。 */
  readonly restart: (seed?: string) => void
}

const createSessionSeed = (): string => `s${Date.now().toString(36)}`

export const useFishingSession = (): FishingSession => {
  const [session, setSession] = useState(() => ({ seed: createSessionSeed(), nonce: 0 }))
  const engineRef = useRef<FishingEngine | null>(null)
  const [snapshot, setSnapshot] = useState<FishingSnapshot | null>(null)

  // コンテンツは起動時に 1 度だけ検証する。
  const content = useMemo(() => {
    try {
      return { ok: true as const, value: loadPhase1SampleContent() }
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
      encounters: [{ species: content.value.species, presence: content.value.presence }],
      seed: session.seed,
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
    send,
    restart,
  }
}
