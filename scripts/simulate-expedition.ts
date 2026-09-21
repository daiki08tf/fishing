import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import { evaluateAccess } from '../src/domain/access/accessEngine'
import { resolveCatch } from '../src/domain/catch'
import { formatYen } from '../src/domain/economy'
import { createInitialFinanceState } from '../src/domain/economy/FinanceState'
import { planExpedition, remainingExpeditionDays } from '../src/domain/expedition'
import { FishingEngine, isTerminalPhase, type FishingEvent } from '../src/domain/fishing'
import { asRegionId, asTransportId } from '../src/domain/ids'
import type { FishIndividual } from '../src/domain/fish/FishIndividual'
import { createPlayerStore } from '../src/state/playerStore'
import { createInitialSave } from '../src/infrastructure/persistence/saveFactory'
import { migrateSave } from '../src/infrastructure/persistence/migrateSave'
import { chooseCommand } from './simulate-fishing'

/**
 * 遠征の 1 本通し（Phase 8）。
 *
 *   東京 HOME → アラスカ遠征を予約（航空券 / 宿泊 / 許可）
 *   → 世界時間が進む → Alaska Base → レンタカーで Salmon River
 *   → Chinook ねらいで釣る → Codex に記録 → 拠点へ戻る → 東京へ帰る
 *
 * seed 固定。PASS / FAIL を出し、同じ入力からは同じ結果になる。
 */

const END_EVENTS: readonly FishingEvent[] = [
  'LANDED',
  'HOOK_MISSED',
  'HOOK_ESCAPE',
  'LINE_BREAK',
  'NO_BITE',
]

export type ExpeditionSimulationCheck = {
  readonly label: string
  readonly ok: boolean
}

export type ExpeditionSimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly ExpeditionSimulationCheck[]
  readonly fingerprint: string
}

type RunResult = {
  readonly lines: readonly string[]
  readonly fingerprint: string
  readonly startCash: number
  readonly afterStartCash: number
  readonly endCash: number
  readonly startMinutes: number
  readonly arrivalMinutes: number
  readonly regionAfterStart: string
  readonly baseName: string
  readonly regionAfterReturn: string
  readonly remainingDays: number
  readonly salmonAccessible: boolean
  readonly salmonBlockedWithoutPermit: boolean
  readonly chinookInSpot: boolean
  readonly landedSpeciesId: string | null
  readonly recordedInCodex: boolean
  readonly landedLengthCm: number | null
  readonly planTotal: number
  readonly planComponents: number
  readonly reloadKeptExpedition: boolean
  readonly reloadKeptPermit: boolean
  readonly localTransportId: string | null
}

const minutesOf = (time: { day: number; hour: number; minute: number }): number =>
  (time.day * 24 + time.hour) * 60 + time.minute

const runExpedition = (seed: string): RunResult => {
  const content = loadContentFromDirectory()
  const lines: string[] = []
  const log = (message: string): void => {
    lines.push(message)
  }

  const store = createPlayerStore()
  const base = createInitialSave({ now: '2026-05-02T00:00:00.000Z' })
  const cash = 800_000

  store.getState().hydrateFromSave({
    ...base,
    finance: { ...createInitialFinanceState(), cash },
  })

  const definition = content.expeditionById['alaska-expedition']
  const region = content.regionById['alaska']
  const country = content.countryById['united-states']

  if (definition === undefined || region === undefined || country === undefined) {
    throw new Error('missing alaska content')
  }

  const plan = planExpedition({
    definition,
    countryId: region.countryId,
    countryName: country.name,
    regionName: region.name,
    baseId: region.base.id,
    baseName: region.base.name,
    domestic: country.domestic,
    lodgingId: 'alaska-budget-lodge',
  })

  if (plan === null) {
    throw new Error('could not plan the expedition')
  }

  const startCash = store.getState().finance.cash
  const startMinutes = minutesOf(store.getState().world.time)
  log(`HOME（東京）: ${formatYen(startCash)} / Lv ${store.getState().progression.anglerLevel}`)
  log(
    `遠征計画 ${plan.name}: ${plan.nights}泊 / 総額 ${formatYen(plan.totalCostYen)}` +
      `（${plan.costComponents.map((component) => `${component.label} ${formatYen(component.amount)}`).join(' / ')}）`,
  )

  const started = store.getState().startExpedition(plan)

  if (!started.ok) {
    throw new Error(`could not start the expedition: ${started.message}`)
  }

  const afterStart = store.getState()
  const arrivalMinutes = minutesOf(afterStart.world.time)
  log(
    `出発 → ${afterStart.world.time.year}-${String(afterStart.world.time.month)}-${String(
      afterStart.world.time.day,
    )} ${String(afterStart.world.time.hour)}:${String(afterStart.world.time.minute).padStart(2, '0')}` +
      ` / 拠点 ${afterStart.expedition.current?.baseName ?? '?'} / 残り ${String(
        remainingExpeditionDays(afterStart.expedition.current!, afterStart.world.time),
      )} 日`,
  )

  const salmon = content.spots.find((spot) => String(spot.id) === 'alaska-salmon-river')

  if (salmon === undefined) {
    throw new Error('missing salmon river content')
  }

  const permitIds = afterStart.expedition.permits.map((permitId) => String(permitId))
  const accessWithPermit = evaluateAccess({
    spot: salmon,
    transports: content.transports,
    playerTransports: afterStart.transport,
    knowledge: afterStart.knowledge,
    permitsEnabled: true,
    permits: permitIds,
  })
  const accessWithoutPermit = evaluateAccess({
    spot: salmon,
    transports: content.transports,
    playerTransports: afterStart.transport,
    knowledge: afterStart.knowledge,
    permitsEnabled: true,
    permits: [],
  })
  const option =
    accessWithPermit.travelOptions.find(
      (candidate) => String(candidate.transportId) === 'rental-car',
    ) ?? null

  log(
    `現地アクセス ${salmon.name}: ${
      accessWithPermit.accessible
        ? `行ける（${option?.transportName ?? '?'} ${String(option?.minutes ?? 0)}分）`
        : '行けない'
    }`,
  )

  const travelled = store
    .getState()
    .travelToSpot(salmon, content.transports, asTransportId('rental-car'))

  if (!travelled.ok) {
    throw new Error(`could not travel to the salmon river: ${travelled.message}`)
  }

  log(
    `移動（${salmon.name} / ${option?.transportName ?? '?'}）: 到着 ${String(
      store.getState().world.time.hour,
    )}:${String(store.getState().world.time.minute).padStart(2, '0')}`,
  )

  // 現地の魚（Chinook を含む）を釣る。Engine は Spot も国も知らない。
  const encounters = salmon.fishTable.flatMap((occurrence) => {
    const species = content.speciesById[String(occurrence.speciesId)]

    return species === undefined ? [] : [{ species, presence: occurrence.basePresence }]
  })
  const runAttempt = (
    attemptSeed: string,
  ): { readonly phase: string; readonly individual: FishIndividual | null } => {
    const engine = new FishingEngine({ encounters, seed: attemptSeed, spotId: salmon.id })
    let guard = 0

    while (guard < 5000) {
      const snapshot = engine.snapshot()
      engine.dispatch(chooseCommand('balanced', snapshot))
      const ticked = engine.tick()
      guard += 1

      if (
        ticked.events.some((event) => END_EVENTS.includes(event)) ||
        isTerminalPhase(ticked.snapshot.phase)
      ) {
        break
      }
    }

    const final = engine.snapshot()

    return {
      phase: final.phase === 'IDLE' ? 'NO_BITE' : final.phase,
      individual: final.phase === 'LANDED' ? (final.fish?.individual ?? null) : null,
    }
  }

  let individual: FishIndividual | null = null
  let landedPhase = 'NO_BITE'

  // 釣れるまで数回キャストする（現実の 1 釣行と同じ）。
  for (let attempt = 0; attempt < 8 && individual === null; attempt += 1) {
    const result = runAttempt(`${seed}#alaska#${String(attempt)}`)
    landedPhase = result.phase
    individual = result.individual
    const recorded = store.getState().recordAttempt({
      spot: salmon,
      outcome: individual === null ? 'failed' : 'landed',
      xpGained: 0,
      ...(individual === null ? {} : { caughtLengthCm: individual.lengthCm }),
    })

    if (!recorded.ok) {
      throw new Error(`could not record the attempt: ${recorded.message}`)
    }

    if (individual !== null) {
      lines.push(`釣り ${String(attempt + 1)} 回目: ヒット`)
    }
  }

  let codex = store.getState().codex
  let landedSpeciesId: string | null = null
  let recordedInCodex = false
  let landedLengthCm: number | null = null

  if (individual !== null) {
    const species = content.speciesById[String(individual.speciesId)]

    if (species !== undefined) {
      const resolution = resolveCatch({
        individual,
        species,
        codex,
        progression: store.getState().progression,
        spotId: String(salmon.id),
        capturedAt: '2026-05-03T00:00:00.000Z',
      })
      codex = resolution.codex
      landedSpeciesId = String(individual.speciesId)
      landedLengthCm = individual.lengthCm
      recordedInCodex = codex.species[String(individual.speciesId)] !== undefined
      store.getState().recordCatch({
        individual,
        species,
        spotId: String(salmon.id),
        capturedAt: '2026-05-03T00:00:00.000Z',
      })
      log(
        `釣果: ${species.japaneseName} ${String(individual.lengthCm)}cm / +${String(
          resolution.xp.total,
        )} XP / Codex ${recordedInCodex ? '記録済み' : '未記録'}`,
      )
    }
  }

  if (individual === null) {
    log(`釣果: 今回は釣れなかった（${landedPhase}）`)
  }

  const backToBase = store.getState().returnHome(salmon, content.transports)

  if (!backToBase.ok) {
    throw new Error(`could not return to the base: ${backToBase.message}`)
  }

  log(`拠点へ戻る: ${String(store.getState().world.phase)}`)

  // 遠征中の Save / reload（遠征 state と許可が残ること）。
  const saved = migrateSave({
    ...base,
    finance: store.getState().finance,
    world: store.getState().world,
    transport: store.getState().transport,
    expedition: store.getState().expedition,
    knowledge: store.getState().knowledge,
    codex: store.getState().codex,
    progression: store.getState().progression,
  })
  const reloadStore = createPlayerStore()
  let reloadKeptExpedition = false
  let reloadKeptPermit = false

  if (saved.ok) {
    reloadStore.getState().hydrateFromSave(saved.save)
    reloadKeptExpedition =
      reloadStore.getState().expedition.current?.regionId === asRegionId('alaska')
    reloadKeptPermit = reloadStore
      .getState()
      .expedition.permits.map((permitId) => String(permitId))
      .includes('alaska-fishing-permit')
  }

  const returned = store.getState().endExpedition()

  if (!returned.ok) {
    throw new Error(`could not return home: ${returned.message}`)
  }

  log(
    `帰国: ${String(store.getState().world.currentRegionId)} / 遠征 ${
      store.getState().expedition.current === null ? '終了' : '継続'
    } / 現金 ${formatYen(store.getState().finance.cash)}`,
  )

  const end = store.getState()
  const fingerprint = JSON.stringify({
    cash: end.finance.cash,
    region: String(end.world.currentRegionId),
    time: end.world.time,
    codex: Object.keys(end.codex.species).sort(),
    landed: landedSpeciesId,
    length: landedLengthCm,
  })

  return {
    lines,
    fingerprint,
    startCash,
    afterStartCash: afterStart.finance.cash,
    endCash: end.finance.cash,
    startMinutes,
    arrivalMinutes,
    regionAfterStart: String(afterStart.world.currentRegionId),
    baseName: afterStart.expedition.current?.baseName ?? '',
    regionAfterReturn: String(end.world.currentRegionId),
    remainingDays: remainingExpeditionDays(afterStart.expedition.current!, afterStart.world.time),
    salmonAccessible: accessWithPermit.accessible,
    salmonBlockedWithoutPermit: !accessWithoutPermit.accessible,
    chinookInSpot: encounters.some(
      (candidate) => String(candidate.species.id) === 'alaska-chinook-salmon',
    ),
    landedSpeciesId,
    recordedInCodex,
    landedLengthCm,
    planTotal: plan.totalCostYen,
    planComponents: plan.costComponents.length,
    reloadKeptExpedition,
    reloadKeptPermit,
    localTransportId: option === null ? null : String(option.transportId),
  }
}

/**
 * Angler Level が遠征の条件になっていないことを確認する。
 *
 * - Content（遠征 / 地域 / Spot）に Level 条件のフィールドが無い
 * - 遠征計画は progression を入力に持たない（Lv1 でも同じ計画になる）
 * - 実際に Lv1 で遠征を開始できる（runExpedition が Lv1 で通っている）
 */
const levelIndependence = (): boolean => {
  const content = loadContentFromDirectory()
  const definition = content.expeditionById['alaska-expedition']
  const region = content.regionById['alaska']
  const country = content.countryById['united-states']
  const alaskaSpots = content.spots.filter((spot) => String(spot.regionId) === 'alaska')

  if (definition === undefined || region === undefined || country === undefined) {
    return false
  }

  const serialized = JSON.stringify([definition, region, alaskaSpots])

  return !/requiredLevel|minLevel|anglerLevel|levelGate/.test(serialized)
}

export const simulateExpedition = (): ExpeditionSimulationResult => {
  const seed = 'alaska-demo'
  const run = runExpedition(seed)
  const again = runExpedition(seed)
  const lines: string[] = ['Expedition simulation（東京 → アラスカ → 東京）', ...run.lines]

  const checks: ExpeditionSimulationCheck[] = [
    {
      label: '遠征費が引かれる（残高が総額ぶん減る）',
      ok: run.startCash - run.afterStartCash === run.planTotal && run.planTotal > 0,
    },
    {
      label: 'WorldTime が進む（航空移動で日付が変わる）',
      ok: run.arrivalMinutes - run.startMinutes === 1080,
    },
    {
      label: 'current region が Alaska になり、現地の拠点に入る',
      ok: run.regionAfterStart === 'alaska' && run.baseName === 'Alaska Fishing Base',
    },
    {
      label: '遠征の残り日数が計画どおり（5 泊）',
      ok: run.remainingDays === 5,
    },
    {
      label: '現地の移動（rental car）で Salmon River に行ける',
      ok: run.salmonAccessible && run.localTransportId === 'rental-car',
    },
    {
      label: '許可（permit）が無いと Salmon River に入れない',
      ok: run.salmonBlockedWithoutPermit,
    },
    {
      label: 'Salmon River の Encounter に Chinook が出る',
      ok: run.chinookInSpot,
    },
    {
      label: '釣った魚が Codex に記録される（サーモン / トラウト）',
      ok: run.landedSpeciesId !== null && run.recordedInCodex,
    },
    {
      label: '拠点へ戻り、東京へ帰れる（current region が戻る）',
      ok: run.regionAfterReturn === 'tokyo-area',
    },
    {
      label: '遠征中の Save / reload で遠征と許可が残る',
      ok: run.reloadKeptExpedition && run.reloadKeptPermit,
    },
    {
      label: 'Angler Level は遠征の条件ではない（Lv1 で開始できる）',
      ok: levelIndependence(),
    },
    {
      label: '同じ入力から同じ結果（決定論的）',
      ok: run.fingerprint === again.fingerprint,
    },
  ]

  lines.push('', '--- checks ---')
  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('', allOk ? 'OK: expedition loop is healthy' : 'FAILED: expedition loop has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks, fingerprint: run.fingerprint }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateExpedition()
    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }
    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
