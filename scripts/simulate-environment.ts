import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import { resolveEnvironment } from '../src/domain/environment/environmentResolver'
import {
  resolveFishingConditions,
  speciesEnvironmentMultiplier,
} from '../src/domain/environment/fishingConditions'
import { NEUTRAL_FISHING_MODIFIERS } from '../src/domain/fishing/PlayerFishingModifiers'
import type { EnvironmentSnapshot, TimeOfDay, Tide, Weather } from '../src/domain/environment'
import { seasonOf } from '../src/domain/environment'
import type { FishingSpot } from '../src/domain/world/FishingSpot'
import type { WorldTime } from '../src/domain/world/WorldTime'

/**
 * Environment の比較（Phase 9）。
 *
 * 同じ Spot でも、季節・時間・天候・潮・水の状態で
 * 「どの魚がどれだけ釣れやすいか」が変わることを確認する。
 *
 * 気象・潮汐の再現ではなく、決定論的で説明可能な差が出ているかを見る。
 */

export type EnvironmentCheck = {
  readonly label: string
  readonly ok: boolean
}

export type EnvironmentSimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly EnvironmentCheck[]
  readonly fingerprint: string
}

const at = (month: number, day: number, hour: number, minute = 0): WorldTime => ({
  year: 2026,
  month,
  day,
  hour,
  minute,
})

export const simulateEnvironment = (): EnvironmentSimulationResult => {
  const content = loadContentFromDirectory()
  const lines: string[] = ['Environment simulation（同じ Spot でも条件で変わる）']
  const checks: EnvironmentCheck[] = []

  const spot = (id: string): FishingSpot => {
    const found = content.spots.find((entry) => String(entry.id) === id)

    if (found === undefined) {
      throw new Error(`missing spot: ${id}`)
    }

    return found
  }

  const environmentFor = (spotId: string, time: WorldTime): EnvironmentSnapshot => {
    const target = spot(spotId)
    const region = content.regionById[String(target.regionId)]

    if (region === undefined) {
      throw new Error(`missing region: ${String(target.regionId)}`)
    }

    return resolveEnvironment({
      time,
      climate: region.climate,
      regionId: String(region.id),
      environment: target.environment,
      tideDrivenFlow: target.tideDrivenFlow,
    })
  }

  const speciesOf = (spotId: string) => {
    const target = spot(spotId)

    return target.fishTable.flatMap((occurrence) => {
      const species = content.speciesById[String(occurrence.speciesId)]
      return species === undefined ? [] : [species]
    })
  }

  /** 条件一致の日時を探す（決定的に走査するだけ。乱数は使わない）。 */
  const findTime = (input: {
    readonly spotId: string
    readonly month: number
    readonly weather?: Weather
    readonly tide?: Tide
    readonly timeOfDay?: TimeOfDay
  }): WorldTime => {
    for (let day = 1; day <= 28; day += 1) {
      for (let hour = 0; hour < 24; hour += 3) {
        const time = at(input.month, day, hour)
        const environment = environmentFor(input.spotId, time)

        if (input.weather !== undefined && environment.weather !== input.weather) {
          continue
        }

        if (input.tide !== undefined && environment.tide !== input.tide) {
          continue
        }

        if (input.timeOfDay !== undefined && environment.timeOfDay !== input.timeOfDay) {
          continue
        }

        return time
      }
    }

    throw new Error(`no time found for ${JSON.stringify(input)}`)
  }

  const describe = (label: string, environment: EnvironmentSnapshot): readonly string[] => [
    `${label}: ${environment.date} / ${String(environment.month)}月 / 季節 ${environment.season} / 時間帯 ${environment.timeOfDay}`,
    `  天候 ${environment.weather} / 潮 ${String(environment.tide)} / 水温 ${String(
      environment.water.temperatureC,
    )}℃ / 濁り ${String(environment.water.clarity)} / 流れ ${environment.water.flow} / 風 ${environment.water.wind}`,
  ]

  const multiplierTable = (spotId: string, time: WorldTime): readonly string[] =>
    speciesOf(spotId)
      .map((species) => ({
        name: species.japaneseName,
        value: speciesEnvironmentMultiplier(species, environmentFor(spotId, time)),
      }))
      .sort((left, right) => right.value - left.value)
      .map((entry) => `${entry.name} ${entry.value.toFixed(2)}`)

  // 1. 東京湾岸: 朝まずめ + 上げ潮 vs 日中 + 干潮
  const tokyoDawn = findTime({
    spotId: 'tokyo-bay-shore',
    month: 6,
    tide: 'rising',
    timeOfDay: 'dawn',
  })
  const tokyoDay = findTime({
    spotId: 'tokyo-bay-shore',
    month: 6,
    tide: 'low',
    timeOfDay: 'daytime',
  })
  const tokyoDawnEnv = environmentFor('tokyo-bay-shore', tokyoDawn)
  const tokyoDayEnv = environmentFor('tokyo-bay-shore', tokyoDay)
  const tokyoDawnConditions = resolveFishingConditions({
    environment: tokyoDawnEnv,
    species: speciesOf('tokyo-bay-shore'),
    tackleModifiers: NEUTRAL_FISHING_MODIFIERS,
    hasFishFinder: false,
    searchSign: null,
    knowledgeScore: 60,
  })
  const tokyoDayConditions = resolveFishingConditions({
    environment: tokyoDayEnv,
    species: speciesOf('tokyo-bay-shore'),
    tackleModifiers: NEUTRAL_FISHING_MODIFIERS,
    hasFishFinder: false,
    searchSign: null,
    knowledgeScore: 60,
  })

  lines.push('', '=== 東京湾岸: 朝まずめ×上げ潮 vs 日中×干潮 ===')
  lines.push(...describe('良条件', tokyoDawnEnv))
  lines.push(...describe('悪条件', tokyoDayEnv))
  lines.push(
    `  釣況: ${tokyoDawnConditions.summary}（score ${String(tokyoDawnConditions.score)}） vs ${tokyoDayConditions.summary}（score ${String(tokyoDayConditions.score)}）`,
  )
  lines.push(`  魚種別: ${multiplierTable('tokyo-bay-shore', tokyoDawn).join(' / ')}`)
  lines.push(`        vs ${multiplierTable('tokyo-bay-shore', tokyoDay).join(' / ')}`)

  checks.push({
    label: '東京湾岸: 条件の良い時間帯の方が釣況スコアが高い',
    ok: tokyoDawnConditions.score > tokyoDayConditions.score,
  })
  checks.push({
    label: '東京湾岸: 魚種ごとの重みが条件で変わる（差が出る）',
    ok: speciesOf('tokyo-bay-shore').some(
      (species) =>
        Math.abs(
          (tokyoDawnConditions.speciesModifiers[String(species.id)] ?? 1) -
            (tokyoDayConditions.speciesModifiers[String(species.id)] ?? 1),
        ) >= 0.15,
    ),
  })

  // 2. アラスカ: サケの季節 vs 季節外
  const alaskaSummer = findTime({
    spotId: 'alaska-salmon-river',
    month: 7,
    timeOfDay: 'dawn',
  })
  const alaskaWinter = findTime({
    spotId: 'alaska-salmon-river',
    month: 1,
    timeOfDay: 'dawn',
  })
  // Phase 12 以降 species id は canonical（`chinook-salmon`）。
  const chinook = content.speciesById['chinook-salmon']

  if (chinook === undefined) {
    throw new Error('missing chinook')
  }

  const chinookSummer = speciesEnvironmentMultiplier(
    chinook,
    environmentFor('alaska-salmon-river', alaskaSummer),
  )
  const chinookWinter = speciesEnvironmentMultiplier(
    chinook,
    environmentFor('alaska-salmon-river', alaskaWinter),
  )

  lines.push('', '=== アラスカ: サケの季節 vs 季節外 ===')
  lines.push(...describe('夏（7月）', environmentFor('alaska-salmon-river', alaskaSummer)))
  lines.push(...describe('冬（1月）', environmentFor('alaska-salmon-river', alaskaWinter)))
  lines.push(`  Chinook の重み: 夏 ${chinookSummer.toFixed(2)} / 冬 ${chinookWinter.toFixed(2)}`)

  checks.push({
    label: '季節で魚種の重みが変わる（サケは夏が高い）',
    ok: chinookSummer > chinookWinter,
  })

  // 3. 淡水: 雨 vs 晴れ（流れ・濁り）
  const rainy = findTime({ spotId: 'tama-river-lower', month: 6, weather: 'rain' })
  const clear = findTime({ spotId: 'tama-river-lower', month: 6, weather: 'clear' })
  const rainyEnv = environmentFor('tama-river-lower', rainy)
  const clearEnv = environmentFor('tama-river-lower', clear)

  lines.push('', '=== 多摩川 下流: 雨 vs 晴れ ===')
  lines.push(...describe('雨', rainyEnv))
  lines.push(...describe('晴れ', clearEnv))

  checks.push({
    label: '淡水では潮が N/A（null）',
    ok: rainyEnv.tide === null && clearEnv.tide === null,
  })
  checks.push({
    label: '雨の日は流れが強く / 濁る（晴れより）',
    ok: rainyEnv.water.flow === 'strong' && rainyEnv.water.clarity < clearEnv.water.clarity,
  })

  // 4. 決定論と下限（0 にならない）
  const repeatA = environmentFor('tokyo-bay-shore', tokyoDawn)
  const repeatB = environmentFor('tokyo-bay-shore', tokyoDawn)
  const tideLater = environmentFor(
    'tokyo-bay-shore',
    at(tokyoDawn.month, tokyoDawn.day, tokyoDawn.hour + 6),
  )
  const poorConditions = resolveFishingConditions({
    environment:
      alaskaWinter === undefined
        ? tokyoDayEnv
        : environmentFor('alaska-salmon-river', alaskaWinter),
    species: speciesOf('alaska-salmon-river'),
    tackleModifiers: NEUTRAL_FISHING_MODIFIERS,
    hasFishFinder: false,
    searchSign: null,
    knowledgeScore: 0,
  })

  lines.push('', '=== その他 ===')
  lines.push(
    `  季節の対応: 4月=${seasonOf(4)} / 7月=${seasonOf(7)} / 10月=${seasonOf(10)} / 1月=${seasonOf(1)}`,
  )
  lines.push(
    `  季節外の魚種別重み（下限確認）: ${multiplierTable('alaska-salmon-river', alaskaWinter).join(' / ')}`,
  )

  checks.push({
    label: '同じ日時なら同じ Environment（決定論的）',
    ok: JSON.stringify(repeatA) === JSON.stringify(repeatB),
  })
  checks.push({ label: '時間が進むと潮が変わる', ok: repeatA.tide !== tideLater.tide })
  checks.push({
    label: '条件が悪くても魚種の重みは 0 にならない（下限 0.35）',
    ok: Object.values(poorConditions.speciesModifiers).every((value) => value >= 0.35),
  })

  const fingerprint = JSON.stringify({
    tokyoDawn: tokyoDawnEnv,
    tokyoDay: tokyoDayEnv,
    rainy: rainyEnv,
    clear: clearEnv,
    chinookSummer,
    chinookWinter,
  })

  lines.push('', '--- checks ---')
  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('', allOk ? 'OK: environment is healthy' : 'FAILED: environment has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks, fingerprint }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateEnvironment()
    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }
    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
