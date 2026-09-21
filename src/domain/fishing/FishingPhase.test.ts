import { describe, expect, it } from 'vitest'
import {
  ALLOWED_COMMANDS,
  FISHING_COMMANDS,
  FISHING_EVENTS,
  FISHING_FAILURE_PHASES,
  FISHING_PHASES,
  isAutoAdvancingPhase,
  isCommandAllowed,
  isFailurePhase,
  isFishingPhase,
  isTerminalPhase,
  TERMINAL_PHASES,
} from './FishingPhase'

describe('fishing state machine definition', () => {
  it('defines exactly the states documented in ARCHITECTURE.md §6', () => {
    expect(FISHING_PHASES).toEqual([
      'IDLE',
      'CASTING',
      'WAITING',
      'BITE',
      'HOOK_WINDOW',
      'HOOKED',
      'FIGHTING',
      'LANDING',
      'LANDED',
      'HOOK_MISSED',
      'HOOK_ESCAPE',
      'LINE_BREAK',
    ])
  })

  it('defines a command table for every phase', () => {
    for (const phase of FISHING_PHASES) {
      expect(ALLOWED_COMMANDS[phase]).toBeDefined()
    }
  })

  it('only accepts commands that belong to the phase', () => {
    expect(ALLOWED_COMMANDS.IDLE).toEqual(['cast'])
    expect(ALLOWED_COMMANDS.HOOK_WINDOW).toEqual(['hook'])
    expect(ALLOWED_COMMANDS.FIGHTING).toEqual([
      'reel',
      'power_reel',
      'hold',
      'give',
      'loosen_drag',
      'tighten_drag',
    ])
    expect(ALLOWED_COMMANDS.CASTING).toEqual([])
    expect(ALLOWED_COMMANDS.WAITING).toEqual([])
    expect(ALLOWED_COMMANDS.BITE).toEqual([])
    expect(ALLOWED_COMMANDS.HOOKED).toEqual([])
    expect(ALLOWED_COMMANDS.LANDING).toEqual(['land', 'wait'])
  })

  it('cannot be skipped or rewound by player commands', () => {
    expect(isCommandAllowed('IDLE', 'reel')).toBe(false)
    expect(isCommandAllowed('IDLE', 'hook')).toBe(false)
    expect(isCommandAllowed('WAITING', 'reel')).toBe(false)
    expect(isCommandAllowed('BITE', 'hook')).toBe(false)
    expect(isCommandAllowed('CASTING', 'cast')).toBe(false)
    expect(isCommandAllowed('FIGHTING', 'cast')).toBe(false)
    expect(isCommandAllowed('FIGHTING', 'hook')).toBe(false)
    expect(isCommandAllowed('LANDED', 'cast')).toBe(false)
  })

  it('allows reset only after the trip has ended', () => {
    for (const phase of TERMINAL_PHASES) {
      expect(ALLOWED_COMMANDS[phase]).toEqual(['reset'])
    }

    for (const phase of FISHING_PHASES) {
      if (!isTerminalPhase(phase)) {
        expect(ALLOWED_COMMANDS[phase]).not.toContain('reset')
      }
    }
  })

  it('classifies terminal and failure phases', () => {
    expect(isTerminalPhase('LANDED')).toBe(true)

    for (const phase of FISHING_FAILURE_PHASES) {
      expect(isFailurePhase(phase)).toBe(true)
      expect(isTerminalPhase(phase)).toBe(true)
    }

    expect(isTerminalPhase('FIGHTING')).toBe(false)
    expect(isFailurePhase('FIGHTING')).toBe(false)
  })

  it('marks the phases that advance on their own', () => {
    // Phase 10: FIGHTING / LANDING はコマンド駆動（自動では進まない）。
    for (const phase of ['CASTING', 'WAITING', 'BITE', 'HOOKED'] as const) {
      expect(isAutoAdvancingPhase(phase)).toBe(true)
    }

    expect(isAutoAdvancingPhase('LANDING')).toBe(false)

    expect(isAutoAdvancingPhase('IDLE')).toBe(false)
    expect(isAutoAdvancingPhase('HOOK_WINDOW')).toBe(false)
    expect(isAutoAdvancingPhase('FIGHTING')).toBe(false)
  })

  it('validates phase names at runtime', () => {
    expect(isFishingPhase('FIGHTING')).toBe(true)
    expect(isFishingPhase('fighting')).toBe(false)
    expect(isFishingPhase('')).toBe(false)
  })

  it('exposes the documented commands and events', () => {
    expect(FISHING_COMMANDS).toEqual([
      'cast',
      'hook',
      'reel',
      'power_reel',
      'hold',
      'give',
      'loosen_drag',
      'tighten_drag',
      'land',
      'wait',
      'reset',
    ])
    expect(FISHING_EVENTS).toContain('LINE_BREAK')
    expect(FISHING_EVENTS).toContain('HOOK_ESCAPE')
    expect(FISHING_EVENTS).toContain('HOOK_MISSED')
  })
})
