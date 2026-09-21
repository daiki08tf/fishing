import { describe, expect, it } from 'vitest'
import {
  advanceMinutes,
  compareWorldTime,
  daysInMonth,
  dayOfWeekOf,
  DEFAULT_WAKE_HOUR,
  formatClock,
  formatDuration,
  formatWorldTime,
  isSameDay,
  isWeekend,
  minutesOfDay,
  sleepUntilMorning,
  toMinutes,
  type WorldTime,
} from './WorldTime'

const at = (year: number, month: number, day: number, hour: number, minute: number): WorldTime => ({
  year,
  month,
  day,
  hour,
  minute,
})

describe('world time', () => {
  it('advances within a day', () => {
    const result = advanceMinutes(at(2026, 5, 2, 6, 0), 42)

    expect(result).toEqual(at(2026, 5, 2, 6, 42))
    expect(minutesOfDay(result)).toBe(6 * 60 + 42)
  })

  it('rolls over to the next day', () => {
    expect(advanceMinutes(at(2026, 5, 2, 23, 50), 20)).toEqual(at(2026, 5, 3, 0, 10))
  })

  it('rolls over to the next month and year', () => {
    expect(advanceMinutes(at(2026, 5, 31, 23, 30), 60)).toEqual(at(2026, 6, 1, 0, 30))
    expect(advanceMinutes(at(2026, 12, 31, 23, 30), 60)).toEqual(at(2027, 1, 1, 0, 30))
  })

  it('handles leap years', () => {
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(advanceMinutes(at(2028, 2, 28, 10, 0), 24 * 60)).toEqual(at(2028, 2, 29, 10, 0))
    expect(advanceMinutes(at(2026, 2, 28, 10, 0), 24 * 60)).toEqual(at(2026, 3, 1, 10, 0))
  })

  it('knows the day of the week', () => {
    expect(dayOfWeekOf(at(2026, 5, 2, 6, 0))).toBe('sat')
    expect(dayOfWeekOf(at(2026, 5, 3, 6, 0))).toBe('sun')
    expect(dayOfWeekOf(at(2026, 5, 4, 6, 0))).toBe('mon')
  })

  it('detects weekends for the calendar foundation', () => {
    expect(isWeekend(at(2026, 5, 2, 6, 0))).toBe(true)
    expect(isWeekend(at(2026, 5, 3, 6, 0))).toBe(true)
    expect(isWeekend(at(2026, 5, 4, 6, 0))).toBe(false)
  })

  it('compares and formats time', () => {
    expect(toMinutes(at(2026, 5, 2, 6, 0))).toBeLessThan(toMinutes(at(2026, 5, 2, 7, 0)))
    expect(compareWorldTime(at(2026, 5, 2, 7, 0), at(2026, 5, 2, 6, 0))).toBe(60)
    expect(isSameDay(at(2026, 5, 2, 6, 0), at(2026, 5, 2, 23, 0))).toBe(true)
    expect(isSameDay(at(2026, 5, 2, 6, 0), at(2026, 5, 3, 0, 1))).toBe(false)
  })

  it('formats for the UI', () => {
    expect(formatWorldTime(at(2026, 5, 2, 6, 5))).toBe('2026-05-02 (土) 06:05')
    expect(formatClock(at(2026, 5, 2, 6, 5))).toBe('06:05')
    expect(formatDuration(20)).toBe('20分')
    expect(formatDuration(60)).toBe('1時間')
    expect(formatDuration(95)).toBe('1時間35分')
  })

  it('is deterministic', () => {
    expect(advanceMinutes(at(2026, 5, 2, 6, 0), 1234)).toEqual(
      advanceMinutes(at(2026, 5, 2, 6, 0), 1234),
    )
  })

  it('sleeps until the next morning', () => {
    // 22:30 → 翌日 06:00
    expect(sleepUntilMorning({ year: 2026, month: 5, day: 4, hour: 22, minute: 30 })).toEqual({
      year: 2026,
      month: 5,
      day: 5,
      hour: DEFAULT_WAKE_HOUR,
      minute: 0,
    })

    // 昼間でも翌朝まで休める（仕事の予定による制限は無い）。
    expect(sleepUntilMorning({ year: 2026, month: 5, day: 4, hour: 10, minute: 0 })).toEqual({
      year: 2026,
      month: 5,
      day: 5,
      hour: 6,
      minute: 0,
    })

    // 早朝でも翌日になる。
    expect(sleepUntilMorning({ year: 2026, month: 5, day: 4, hour: 5, minute: 0 }).day).toBe(5)
  })

  it('rolls the month over when sleeping', () => {
    expect(sleepUntilMorning({ year: 2026, month: 5, day: 31, hour: 23, minute: 0 })).toEqual({
      year: 2026,
      month: 6,
      day: 1,
      hour: 6,
      minute: 0,
    })
  })
})
