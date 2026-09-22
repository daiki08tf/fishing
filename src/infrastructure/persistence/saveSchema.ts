import { z } from 'zod'
import { TRANSACTION_KINDS } from '../../domain/economy/FinanceState'
import { FISH_TRAITS } from '../../domain/fish/FishTrait'
import {
  asContactRewardId,
  asCountryId,
  asExpeditionId,
  asFishIndividualId,
  asFishSpeciesId,
  asFishingSpotId,
  asGearId,
  asJobId,
  asPermitId,
  asRegionId,
  asShopItemId,
  asTransportId,
} from '../../domain/ids'
import { PERK_IDS } from '../../domain/progression/perks'
import { ANGLER_SKILL_MAX, ANGLER_SKILL_MIN } from '../../domain/progression/AnglerSkill'
import {
  SAVE_SCHEMA_VERSION_V1,
  SAVE_SCHEMA_VERSION_V2,
  SAVE_SCHEMA_VERSION_V3,
  SAVE_SCHEMA_VERSION_V4,
  SAVE_SCHEMA_VERSION_V5,
  SAVE_SCHEMA_VERSION_V6,
  SAVE_SCHEMA_VERSION_V7,
  SAVE_SCHEMA_VERSION_V8,
  SAVE_SCHEMA_VERSION_V9,
} from '../../domain/save/SaveGame'
import { WORLD_PHASES } from '../../domain/world/worldSession'

/**
 * Save の実行時検証。ARCHITECTURE.md §9 に対応する。
 *
 * Save はブラウザの永続化領域から戻ってくる「未検証の外部入力」である。
 * 必ず schemaVersion を要求し、未知の version は読み込まない。
 *
 * Zod は Infrastructure にのみ置く。Domain は検証ライブラリに依存しない。
 */

const isoDateTimeSchema = z.string().min(1)

const anglerSkillsSchema = z.strictObject({
  casting: z.number().nonnegative(),
  lineControl: z.number().nonnegative(),
  hooking: z.number().nonnegative(),
  fighting: z.number().nonnegative(),
  landing: z.number().nonnegative(),
  detection: z.number().nonnegative(),
  rigging: z.number().nonnegative(),
})

const progressionSchema = z.strictObject({
  anglerLevel: z.number().int().min(1),
  anglerXp: z.number().nonnegative(),
  skillPoints: z.number().int().nonnegative(),
  skills: anglerSkillsSchema,
  reputation: z.number().nonnegative(),
  methodProficiency: z.record(z.string(), z.number().nonnegative()),
})

const knowledgeSchema = z.strictObject({
  fish: z.record(z.string(), z.number().nonnegative()),
  spots: z.record(z.string(), z.number().nonnegative()),
  regions: z.record(z.string(), z.number().nonnegative()),
  methods: z.record(z.string(), z.number().nonnegative()),
})

const careerSchema = z.strictObject({
  jobId: z.string().min(1).transform(asJobId),
  careerLevel: z.number().int().nonnegative(),
  salaryBand: z.number().int().nonnegative(),
  workStyle: z.strictObject({
    remoteDays: z.number().int().nonnegative(),
    flexTime: z.boolean(),
    overtimeLoad: z.number().nonnegative(),
    commuteMinutes: z.number().nonnegative(),
  }),
  paidLeave: z.number().nonnegative(),
  careerXp: z.number().nonnegative(),
})

/**
 * 資金はマイナスもあり得る。
 * 設計は「軽微な赤字でゲームオーバーにしない」ため（GAME_DESIGN.md §12.3）、
 * cash の下限は設けない。
 */
/** v3 までの資金ブロック。 */
const financeSchemaV3 = z.strictObject({
  cash: z.number().finite(),
  salaryIncome: z.number().nonnegative(),
  simplifiedLivingCost: z.number().nonnegative(),
})

/** 現行の資金ブロック。 */
const financeSchema = z.strictObject({
  cash: z.number().finite(),
  salaryIncome: z.number().nonnegative(),
  simplifiedLivingCost: z.number().nonnegative(),
  lastSettledMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  transactions: z.array(
    z.strictObject({
      id: z.string().min(1),
      kind: z.enum(TRANSACTION_KINDS),
      amount: z.number().finite(),
      label: z.string().min(1),
      at: z.string().min(1),
    }),
  ),
})

export const saveGameV1Schema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  progression: progressionSchema,
  knowledge: knowledgeSchema,
  career: careerSchema,
  finance: financeSchemaV3,
})

const skillValueSchema = z.number().int().min(ANGLER_SKILL_MIN).max(ANGLER_SKILL_MAX)

/** Phase 3 の成長状態。AnglerProgression と対応する。 */
const anglerProgressionSchema = z.strictObject({
  anglerLevel: z.number().int().min(1),
  anglerXp: z.number().nonnegative(),
  totalXp: z.number().nonnegative(),
  skillPoints: z.number().int().nonnegative(),
  skills: z.strictObject({
    casting: skillValueSchema,
    lineControl: skillValueSchema,
    hooking: skillValueSchema,
    fighting: skillValueSchema,
    landing: skillValueSchema,
    detection: skillValueSchema,
    rigging: skillValueSchema,
  }),
  unlockedPerks: z.array(z.enum(PERK_IDS)),
  repetition: z.strictObject({
    species: z.record(z.string(), z.number().int().nonnegative()),
    spots: z.record(z.string(), z.number().int().nonnegative()),
    methods: z.record(z.string(), z.number().int().nonnegative()),
  }),
  reputation: z.number().nonnegative(),
  methodProficiency: z.record(z.string(), z.number().nonnegative()),
})

/**
 * Codex（捕獲記録）。Domain の CodexState / SpeciesRecord / FishRecordEntry と
 * 同じ形を検証するだけで、記録のルール（何が自己記録か等）は持たない。
 */
const fishRecordEntrySchema = z.strictObject({
  individualId: z.string().min(1).transform(asFishIndividualId),
  speciesId: z.string().min(1).transform(asFishSpeciesId),
  lengthCm: z.number().positive(),
  weightKg: z.number().positive(),
  condition: z.number().min(0).max(1),
  percentile: z.number().min(0).max(100),
  traits: z.array(z.enum(FISH_TRAITS)),
  capturedAt: isoDateTimeSchema.optional(),
})

const speciesRecordSchema = z.strictObject({
  speciesId: z.string().min(1).transform(asFishSpeciesId),
  catchCount: z.number().int().nonnegative(),
  largestLengthCm: z.number().positive(),
  heaviestWeightKg: z.number().positive(),
  bestPercentile: z.number().min(0).max(100),
  caughtTraits: z.array(z.enum(FISH_TRAITS)),
  personalBest: fishRecordEntrySchema,
})

const codexSchema = z.strictObject({
  species: z.record(z.string(), speciesRecordSchema),
})

export const saveGameV2Schema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V2),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  progression: anglerProgressionSchema,
  /*
   * Codex は Phase 3 の途中で保存対象に加わった。
   * そのため開発中の v2 Save（codex を持たない）も読み込めるよう、
   * 省略時は空の Codex へ正規化する。
   *
   * 「欠落」と「破損」は区別する:
   * - キーが無い（古い v2）→ 空の Codex で正規化して読み込む
   * - キーはあるが中身が不正 → invalid_save として拒否する
   */
  /*
   * 既定値は `emptyCodexState()` と同じ形。Domain の値は readonly 配列を持つため
   * スキーマの出力型（mutable 配列）へは直接代入できないので、ここでは形を直接書く。
   * 逆方向（スキーマ出力 → CodexState）は代入可能で、migration の戻り値はその経路で型が通る。
   */
  codex: codexSchema.default(() => ({ species: {} })),
  knowledge: knowledgeSchema,
  career: careerSchema,
  finance: financeSchemaV3,
})

/** ゲーム内時間（WorldTime）。 */
const worldTimeSchema = z.strictObject({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
})

/** v3〜v5 の 1 回の釣行記録。 */
const legacyTripSchema = z.strictObject({
  spotId: z.string().min(1).transform(asFishingSpotId),
  spotName: z.string().min(1),
  startedAt: worldTimeSchema,
  arrivedAt: worldTimeSchema,
  attempts: z.number().int().nonnegative(),
  catches: z.number().int().nonnegative(),
  xpGained: z.number().nonnegative(),
  knowledgeGained: z.number().nonnegative(),
  largestLengthCm: z.number().positive().nullable(),
})

const legacyTransportTypeSchema = z.enum([
  'walk',
  'train',
  'bus',
  'bicycle',
  'motorcycle',
  'car',
  'suv',
  'kayak',
  'trailer_boat',
  'boat',
])

/** v3〜v5 の World。Transport state は v6 migration で分離する。 */
const legacyWorldSchema = z.strictObject({
  time: worldTimeSchema,
  phase: z.enum(WORLD_PHASES),
  homeLocationId: z.string().min(1),
  currentSpotId: z.string().min(1).transform(asFishingSpotId).nullable(),
  arrivalTime: worldTimeSchema.nullable(),
  trip: legacyTripSchema.nullable(),
  discoveredSpotIds: z.array(z.string().min(1).transform(asFishingSpotId)),
  availableTransports: z.array(legacyTransportTypeSchema),
})

export const saveGameV3Schema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V3),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  progression: anglerProgressionSchema,
  codex: codexSchema.default(() => ({ species: {} })),
  world: legacyWorldSchema,
  knowledge: knowledgeSchema,
  career: careerSchema,
  finance: financeSchemaV3,
})

export const saveGameV4Schema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V4),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  progression: anglerProgressionSchema,
  codex: codexSchema.default(() => ({ species: {} })),
  world: legacyWorldSchema,
  knowledge: knowledgeSchema,
  finance: financeSchema,
  purchases: z.array(z.string().min(1).transform(asShopItemId)),
})

const gearIdSchema = z.string().min(1).transform(asGearId)

/** 所持している Gear。Phase 6 では数量を持たない（耐久・消費を扱わない）。 */
const inventorySchema = z.strictObject({
  ownedGearIds: z.array(gearIdSchema),
})

/** 現在の装備。Domain の Loadout と同じ形。 */
const loadoutSchema = z.strictObject({
  rodId: gearIdSchema,
  reelId: gearIdSchema,
  lineId: gearIdSchema,
  /** リーダーは無しでもよい。 */
  leaderId: gearIdSchema.nullable(),
  hookId: gearIdSchema,
  offeringId: gearIdSchema,
  methodId: z.string().min(1),
})

export const saveGameV5Schema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V5),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  progression: anglerProgressionSchema,
  codex: codexSchema.default(() => ({ species: {} })),
  world: legacyWorldSchema,
  knowledge: knowledgeSchema,
  finance: financeSchema,
  purchases: z.array(z.string().min(1).transform(asShopItemId)),
  inventory: inventorySchema,
  loadout: loadoutSchema,
})

/** Phase 7A の Trip。往路に使った Transport ID を復路でも利用する。 */
const tripSchema = legacyTripSchema.extend({
  transportId: z.string().min(1).transform(asTransportId).nullable(),
})

/** v6 の World。Transport ownership は独立した transport block に置く。 */
const worldSchemaV6 = z.strictObject({
  time: worldTimeSchema,
  phase: z.enum(WORLD_PHASES),
  homeLocationId: z.string().min(1),
  currentSpotId: z.string().min(1).transform(asFishingSpotId).nullable(),
  arrivalTime: worldTimeSchema.nullable(),
  trip: tripSchema.nullable(),
  discoveredSpotIds: z.array(z.string().min(1).transform(asFishingSpotId)),
})

const transportStateSchema = z.strictObject({
  availableTransportIds: z.array(z.string().min(1).transform(asTransportId)),
  ownedTransportIds: z.array(z.string().min(1).transform(asTransportId)),
})

export const saveGameV6Schema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V6),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  progression: anglerProgressionSchema,
  codex: codexSchema.default(() => ({ species: {} })),
  world: worldSchemaV6,
  transport: transportStateSchema,
  knowledge: knowledgeSchema,
  finance: financeSchema,
  purchases: z.array(z.string().min(1).transform(asShopItemId)),
  inventory: inventorySchema,
  loadout: loadoutSchema,
})

/** Phase 8 の World。今いる地域（currentRegionId）を持つ。 */
const worldSchemaV7 = worldSchemaV6.extend({
  currentRegionId: z.string().min(1).transform(asRegionId),
})

/** 進行中の遠征。 */
const activeExpeditionSchema = z.strictObject({
  definitionId: z.string().min(1).transform(asExpeditionId),
  regionId: z.string().min(1).transform(asRegionId),
  countryId: z.string().min(1).transform(asCountryId),
  regionName: z.string().min(1),
  baseId: z.string().min(1),
  baseName: z.string().min(1),
  startedAt: worldTimeSchema,
  arriveAt: worldTimeSchema,
  plannedReturnAt: worldTimeSchema,
  returnMinutes: z.number().int().nonnegative(),
  nights: z.number().int().nonnegative(),
  lodgingName: z.string().min(1),
  totalCostYen: z.number().int().nonnegative(),
})

/** 遠征 state。現在の遠征・訪問済み地域・所持している許可。 */
const expeditionStateSchema = z.strictObject({
  current: activeExpeditionSchema.nullable(),
  visitedRegionIds: z.array(z.string().min(1).transform(asRegionId)),
  permits: z.array(z.string().min(1).transform(asPermitId)),
})

/** Phase 8 の Save（v7）。 */
export const saveGameV7Schema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V7),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  progression: anglerProgressionSchema,
  codex: codexSchema.default(() => ({ species: {} })),
  world: worldSchemaV7,
  transport: transportStateSchema,
  expedition: expeditionStateSchema,
  knowledge: knowledgeSchema,
  finance: financeSchema,
  purchases: z.array(z.string().min(1).transform(asShopItemId)),
  inventory: inventorySchema,
  loadout: loadoutSchema,
})

/** Phase 12 の Save。構造は v7 と同じで、species ID の canonical 化を migration で保証する。 */
export const saveGameV8Schema = saveGameV7Schema.extend({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V8),
})

/** Fish Box に入っている 1 匹。 */
const keptCatchSchema = z.strictObject({
  catchId: z.string().min(1).transform(asFishIndividualId),
  speciesId: z.string().min(1).transform(asFishSpeciesId),
  lengthCm: z.number().positive(),
  weightKg: z.number().positive(),
  condition: z.number().min(0).max(1),
  percentile: z.number().min(0).max(100),
  traits: z.array(z.enum(FISH_TRAITS)),
  caughtAt: worldTimeSchema,
  sourceSpotId: z.string().min(1).transform(asFishingSpotId),
  sourceRegionId: z.string().min(1).transform(asRegionId),
})

/** Phase 13: Fish Box / Trade / Contact の player state。 */
const tradeStateSchema = z.strictObject({
  fishBox: z.array(keptCatchSchema),
  contactTrust: z.record(z.string(), z.number().min(0).max(100)),
  claimedRewardIds: z.array(z.string().min(1).transform(asContactRewardId)),
  knownRumorIds: z.array(z.string().min(1).transform(asContactRewardId)),
})

/** Phase 13 の現行 Save。Fish Box / Trade / Contact を独立ブロックとして追加する。 */
export const saveGameV9Schema = saveGameV8Schema.extend({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V9),
  trade: tradeStateSchema,
})

/** 現行 version の Save スキーマ。Migration 後の検証に使う。 */
export const currentSaveSchema = saveGameV9Schema
