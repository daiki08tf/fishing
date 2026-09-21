/**
 * ゲーム内時間。ARCHITECTURE.md の「Environment を独立した Domain として扱う」に対応する。
 *
 * - 現実時間ではなくゲーム内時間。移動・釣り・帰宅で進む。
 * - タイムゾーンや夏時間は扱わない（ゲーム内の暦としてのみ正しければよい）。
 * - `Date` は使わない。純粋計算にして、いつ・どこで動かしても同じ結果にする。
 */

export const DAY_OF_WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type DayOfWeek = (typeof DAY_OF_WEEK)[number]

export const DAY_OF_WEEK_LABELS: Readonly<Record<DayOfWeek, string>> = {
  sun: '日',
  mon: '月',
  tue: '火',
  wed: '水',
  thu: '木',
  fri: '金',
  sat: '土',
}

export type WorldTime = {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
}

export const MINUTES_PER_HOUR = 60
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

export const daysInMonth = (year: number, month: number): number => {
  if (month === 2 && isLeapYear(year)) {
    return 29
  }

  return DAYS_IN_MONTH[month - 1] ?? 30
}

/** 1970-01-01 からの通算日数（Howard Hinnant の civil_from_days 系）。 */
export const daysFromCivil = (year: number, month: number, day: number): number => {
  const adjustedYear = month <= 2 ? year - 1 : year
  const era = Math.floor(adjustedYear / 400)
  const yearOfEra = adjustedYear - era * 400
  const shiftedMonth = month > 2 ? month - 3 : month + 9
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear

  return era * 146097 + dayOfEra - 719468
}

export const civilFromDays = (days: number): { year: number; month: number; day: number } => {
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const dayOfEra = z - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  )
  const year = yearOfEra + era * 400
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1
  const month = monthPrime < 10 ? monthPrime + 3 : monthPrime - 9

  return { year: month <= 2 ? year + 1 : year, month, day }
}

export const dayOfWeekOf = (time: WorldTime): DayOfWeek => {
  const days = daysFromCivil(time.year, time.month, time.day)
  // 1970-01-01 は木曜日（index 4）。
  const index = (((days + 4) % 7) + 7) % 7

  return DAY_OF_WEEK[index] ?? 'thu'
}

export const isWeekend = (time: WorldTime): boolean => {
  const day = dayOfWeekOf(time)
  return day === 'sat' || day === 'sun'
}

/** 分単位の通算値。 */
export const toMinutes = (time: WorldTime): number =>
  daysFromCivil(time.year, time.month, time.day) * MINUTES_PER_DAY +
  time.hour * MINUTES_PER_HOUR +
  time.minute

export const fromMinutes = (minutes: number): WorldTime => {
  const totalDays = Math.floor(minutes / MINUTES_PER_DAY)
  const remainder = minutes - totalDays * MINUTES_PER_DAY
  const { year, month, day } = civilFromDays(totalDays)

  return {
    year,
    month,
    day,
    hour: Math.floor(remainder / MINUTES_PER_HOUR),
    minute: remainder % MINUTES_PER_HOUR,
  }
}

/** 時間を進める。日付・月・年をまたぐ。負の値も受け付ける（検証用）。 */
export const advanceMinutes = (time: WorldTime, minutes: number): WorldTime =>
  fromMinutes(toMinutes(time) + Math.trunc(minutes))

/** 0 時からの経過分。 */
export const minutesOfDay = (time: WorldTime): number => time.hour * MINUTES_PER_HOUR + time.minute

export const compareWorldTime = (left: WorldTime, right: WorldTime): number =>
  toMinutes(left) - toMinutes(right)

export const isSameDay = (left: WorldTime, right: WorldTime): boolean =>
  left.year === right.year && left.month === right.month && left.day === right.day

const pad = (value: number): string => String(value).padStart(2, '0')

/** 例: 2026-05-02 (Sat) 06:42 */
export const formatWorldTime = (time: WorldTime): string =>
  `${String(time.year)}-${pad(time.month)}-${pad(time.day)} (${DAY_OF_WEEK_LABELS[dayOfWeekOf(time)]}) ${pad(
    time.hour,
  )}:${pad(time.minute)}`

/** 例: 06:42 */
export const formatClock = (time: WorldTime): string => `${pad(time.hour)}:${pad(time.minute)}`

/** 例: 2時間15分 / 45分 */
export const formatDuration = (minutes: number): string => {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / MINUTES_PER_HOUR)
  const rest = safe % MINUTES_PER_HOUR

  if (hours === 0) {
    return `${String(rest)}分`
  }

  return rest === 0 ? `${String(hours)}時間` : `${String(hours)}時間${String(rest)}分`
}
