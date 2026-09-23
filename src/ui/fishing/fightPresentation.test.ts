import { describe, expect, it } from 'vitest'
import {
  dragLabel,
  failureExplanation,
  fightHint,
  leaderConditionOf,
  lineRemainingText,
  lineStatusOf,
} from './fightPresentation'

describe('fightPresentation', () => {
  describe('lineStatusOf', () => {
    it('is normal above the reserve band', () => {
      expect(lineStatusOf(500, 40)).toBe('normal')
      expect(lineStatusOf(81, 40)).toBe('normal')
    })

    it('is reserve inside the warning band (<= reserve x2)', () => {
      expect(lineStatusOf(80, 40)).toBe('reserve')
      expect(lineStatusOf(41, 40)).toBe('reserve')
    })

    it('is critical at or below reserve', () => {
      expect(lineStatusOf(40, 40)).toBe('critical')
      expect(lineStatusOf(0, 40)).toBe('critical')
    })

    it('is normal when capacity is unknown (null remaining)', () => {
      expect(lineStatusOf(null, 40)).toBe('normal')
    })
  })

  describe('lineRemainingText', () => {
    it('labels each status for humans', () => {
      expect(lineRemainingText(300, 'normal')).toBe('残り 300m')
      expect(lineRemainingText(60, 'reserve')).toBe('残り 60m — 残量注意')
      expect(lineRemainingText(20, 'critical')).toBe('残り 20m — スプール危険')
    })
  })

  describe('leaderConditionOf', () => {
    it('bands integrity into good / worn / danger', () => {
      expect(leaderConditionOf(1)).toBe('good')
      expect(leaderConditionOf(0.75)).toBe('good')
      expect(leaderConditionOf(0.74)).toBe('worn')
      expect(leaderConditionOf(0.4)).toBe('worn')
      expect(leaderConditionOf(0.39)).toBe('danger')
      expect(leaderConditionOf(0)).toBe('danger')
    })
  })

  describe('dragLabel', () => {
    it('translates drag to human words', () => {
      expect(dragLabel(0.2)).toBe('緩め')
      expect(dragLabel(0.5)).toBe('標準')
      expect(dragLabel(0.9)).toBe('強め')
    })
  })

  describe('fightHint', () => {
    const base = {
      phase: 'FIGHTING' as const,
      behaviour: 'normal' as const,
      lineRemainingM: 300,
      reserveLineM: 40,
      leaderIntegrity: 1,
      pumpUseful: false,
    }

    it('returns null outside the fight phases', () => {
      expect(fightHint({ ...base, phase: 'WAITING' })).toBeNull()
      expect(fightHint({ ...base, phase: 'IDLE' })).toBeNull()
      expect(fightHint({ ...base, phase: 'LINE_BREAK' })).toBeNull()
    })

    it('prioritises low line over other hints', () => {
      expect(
        fightHint({ ...base, lineRemainingM: 30, behaviour: 'run', leaderIntegrity: 0.2 }),
      ).toBe('ライン残量が少ない。走らせすぎない')
    })

    it('warns about a badly worn leader', () => {
      expect(fightHint({ ...base, leaderIntegrity: 0.3 })).toBe(
        'リーダーが傷んでいる。高テンションに注意',
      )
    })

    it('warns against reeling into a running fish', () => {
      expect(fightHint({ ...base, behaviour: 'run' })).toBe('走っている。無理に巻くと危険')
      expect(fightHint({ ...base, behaviour: 'surge' })).toBe('走っている。無理に巻くと危険')
      expect(fightHint({ ...base, behaviour: 'second_run' })).toBe('走っている。無理に巻くと危険')
    })

    it('suggests PUMP only when a large fish is resting', () => {
      expect(fightHint({ ...base, behaviour: 'rest', pumpUseful: true })).toBe(
        '今なら PUMP が効きそう',
      )
      expect(fightHint({ ...base, behaviour: 'rest', pumpUseful: false })).toBeNull()
      expect(fightHint({ ...base, behaviour: 'normal', pumpUseful: true })).toBeNull()
    })

    it('uses a landing-specific message while the fish struggles at the boat', () => {
      expect(fightHint({ ...base, phase: 'LANDING', behaviour: 'head_shake' })).toBe(
        'まだ暴れている。落ち着くまで取り込まない',
      )
    })
  })

  describe('failureExplanation', () => {
    it('explains SPOOLED with the capacity when known', () => {
      const result = failureExplanation({
        phase: 'SPOOLED',
        weakLink: null,
        lineCapacityM: 45,
        hookHold: 0.5,
      })
      expect(result?.title).toBe('ラインをすべて引き出された')
      expect(result?.state).toBe('スプール容量 45m を出し尽くした')
    })

    it('names the weak link for LINE_BREAK when known', () => {
      const result = failureExplanation({
        phase: 'LINE_BREAK',
        weakLink: 'leader',
        lineCapacityM: null,
        hookHold: 0.8,
      })
      expect(result?.title).toBe('負荷に耐えきれずライン系統が破断した')
      expect(result?.state).toBe('弱点だったリーダーが限界に達した')
    })

    it('explains HOOK_ESCAPE without claiming an unproven cause', () => {
      const result = failureExplanation({
        phase: 'HOOK_ESCAPE',
        weakLink: null,
        lineCapacityM: null,
        hookHold: 0.12,
      })
      expect(result?.title).toBe('テンションまたはフック保持を失い、魚が外れた')
      expect(result?.state).toBe('最後のフック保持 12%')
    })

    it('omits state when the battle values are unavailable', () => {
      const result = failureExplanation({
        phase: 'LINE_BREAK',
        weakLink: null,
        lineCapacityM: null,
        hookHold: null,
      })
      expect(result?.state).toBeNull()
    })

    it('returns null for non-failure phases', () => {
      expect(
        failureExplanation({
          phase: 'FIGHTING',
          weakLink: null,
          lineCapacityM: null,
          hookHold: null,
        }),
      ).toBeNull()
      expect(
        failureExplanation({
          phase: 'LANDED',
          weakLink: null,
          lineCapacityM: null,
          hookHold: null,
        }),
      ).toBeNull()
    })
  })
})
