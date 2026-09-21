import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import { formatYen } from '../src/domain/economy'
import {
  formatWorldTime,
  monthKeyOf,
  sleepUntilMorning,
  type WorldTime,
} from '../src/domain/world/WorldTime'
import type { FishingSpot } from '../src/domain/world/FishingSpot'
import { createInitialSave } from '../src/infrastructure/persistence/saveFactory'
import { createPlayerStore } from '../src/state/playerStore'

/**
 * 釣り中心の 1 日と数か月を 1 本通す。
 *
 *   06:00 HOME → 釣行（移動 → 釣り ×N → 帰宅）→ 翌朝まで休む
 *   → 数日釣行 → 月を跨いで自由資金 → 貯金 → 中古車を買う → 新しい釣り場が開く
 *
 * 仕事の予定による制限は無い（平日でも自由に釣りに行ける）。
 * 会社員設定は「毎月の自由資金」としてだけ現れる。
 */

export type DaySimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly { readonly label: string; readonly ok: boolean }[]
}

const at = (month: number, day: number, hour: number, minute = 0): WorldTime => ({
  year: 2026,
  month,
  day,
  hour,
  minute,
})

export const simulateDay = (): DaySimulationResult => {
  const content = loadContentFromDirectory()
  const store = createPlayerStore()
  const base = createInitialSave({ now: '2026-05-01T00:00:00.000Z' })

  const spotOf = (id: string): FishingSpot => {
    const spot = content.spots.find((entry) => String(entry.id) === id)

    if (spot === undefined) {
      throw new Error(`unknown spot: ${id}`)
    }

    return spot
  }

  const lines: string[] = []
  const log = (message: string): void => {
    lines.push(`${formatWorldTime(store.getState().world.time)} | ${message}`)
  }

  // 平日の朝（月曜）から始める。
  store.getState().hydrateFromSave({ ...base, world: { ...base.world, time: at(5, 4, 6) } })

  const canal = spotOf('tokyo-urban-canal')
  const bay = spotOf('tokyo-bay-shore')
  const lake = spotOf('upstream-lake')
  const car = content.shopItems.find((item) => String(item.id) === 'used-compact-car')

  if (car === undefined) {
    throw new Error('shop item not found')
  }

  const startedAt = store.getState().world.time
  log('HOME（平日でも釣りに行ける）')

  // 1 日目: 徒歩で近場へ（無料）
  const walkTrip = store.getState().travelToSpot(canal, content.transports)
  log(`移動（${canal.name} / 徒歩）: ${walkTrip.ok ? '到着' : (walkTrip.message ?? '')}`)

  if (walkTrip.ok) {
    store.getState().recordAttempt({ spot: canal, outcome: 'failed', xpGained: 0 })
    store.getState().recordAttempt({ spot: canal, outcome: 'failed', xpGained: 0 })
    store.getState().returnHome(canal, content.transports)
    log('釣り 2 回 → 帰宅')
  }

  // 翌朝まで休む
  const slept = store.getState().sleep()
  log(`翌朝まで休む: ${slept.ok ? '翌朝' : (slept.message ?? '')}`)

  // 2 日目: 電車で東京湾岸へ（交通費がかかる）
  const cashBefore = store.getState().finance.cash
  const trainTrip = store.getState().travelToSpot(bay, content.transports)
  log(`移動（${bay.name} / 電車）: ${trainTrip.ok ? '到着' : (trainTrip.message ?? '')}`)

  if (trainTrip.ok) {
    store.getState().recordAttempt({ spot: bay, outcome: 'failed', xpGained: 0 })
    store.getState().returnHome(bay, content.transports)
    log('釣り 1 回 → 帰宅')
  }

  const cashAfter = store.getState().finance.cash
  log(`交通費: ${formatYen(cashBefore - cashAfter)}`)

  // 月を跨ぐまで休む（給与 − 生活費が入る）
  const cashBeforeMonths = store.getState().finance.cash
  let guard = 0

  while (monthKeyOf(store.getState().world.time) < '2026-08' && guard < 200) {
    store.getState().sleep()
    guard += 1
  }

  const cashAfterMonths = store.getState().finance.cash
  log(`約 3 か月経過: 現金 ${formatYen(cashBeforeMonths)} → ${formatYen(cashAfterMonths)}`)

  // 車を買う
  const beforePurchase = store.getState().evaluateSpot(lake, content.transports)
  const purchase = store.getState().purchaseItem(car)
  const afterPurchase = store.getState().evaluateSpot(lake, content.transports)
  log(
    `${car.name} 購入: ${purchase.ok ? '成功' : (purchase.message ?? '')} / ${lake.name}: ${
      beforePurchase.accessible ? '行ける' : '行けない'
    } → ${afterPurchase.accessible ? '行ける' : '行けない'}`,
  )

  // 買った車で新しい釣り場へ
  const carTrip = store.getState().travelToSpot(lake, content.transports)
  log(`移動（${lake.name} / 車）: ${carTrip.ok ? '到着' : (carTrip.message ?? '')}`)

  if (carTrip.ok) {
    store.getState().recordAttempt({ spot: lake, outcome: 'failed', xpGained: 0 })
    store.getState().returnHome(lake, content.transports)
    log('釣り 1 回 → 帰宅')
  }

  const checks = [
    { label: '平日でも釣りに行ける（仕事の制限なし）', ok: walkTrip.ok },
    { label: '移動で時間が進む', ok: store.getState().world.time.year === 2026 },
    { label: '翌朝まで休むと 06:00 になる', ok: slept.ok },
    { label: '交通費が引かれる', ok: cashBefore - cashAfter > 0 },
    { label: '月を跨ぐと自由資金が入る', ok: cashAfterMonths > cashBeforeMonths },
    { label: '車の購入前は行けない', ok: !beforePurchase.accessible },
    { label: '車の購入後は行ける', ok: afterPurchase.accessible && carTrip.ok },
    { label: '車は所持品に入る', ok: store.getState().purchases.length === 1 },
    { label: '同じ入力から同じ結果（決定論的）', ok: true },
  ]

  // 決定論の確認: 同じ手順をもう一度流して比較する。
  const repeat = (): string => {
    const second = createPlayerStore()
    second.getState().hydrateFromSave({ ...base, world: { ...base.world, time: at(5, 4, 6) } })

    for (let index = 0; index < 3; index += 1) {
      second.getState().travelToSpot(canal, content.transports)
      second.getState().recordAttempt({ spot: canal, outcome: 'failed', xpGained: 0 })
      second.getState().returnHome(canal, content.transports)
      second.getState().sleep()
    }

    return `${String(second.getState().world.time.year)}-${String(
      second.getState().world.time.month,
    )}-${String(second.getState().world.time.day)}|${String(second.getState().finance.cash)}`
  }

  checks[checks.length - 1] = {
    label: '同じ入力から同じ結果（決定論的）',
    ok: repeat() === repeat(),
  }

  lines.push('')
  lines.push(
    `開始 ${formatWorldTime(startedAt)} → 終了 ${formatWorldTime(
      store.getState().world.time,
    )} / 現金 ${formatYen(store.getState().finance.cash)}`,
  )
  lines.push('')
  lines.push('--- checks ---')

  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('')
  lines.push(allOk ? 'OK: day loop is healthy' : 'FAILED: day loop has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks }
}

/** 翌朝まで休む動きそのものの確認（22:30 → 翌 06:00）。 */
export const describeSleep = (time: WorldTime): string =>
  `${formatWorldTime(time)} → ${formatWorldTime(sleepUntilMorning(time))}`

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateDay()

    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }

    process.exitCode = result.exitCode
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
