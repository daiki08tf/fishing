import { z } from 'zod'
import { TRANSACTION_KINDS } from '../../domain/economy/FinanceState'
import { FISH_TRAITS } from '../../domain/fish/FishTrait'
import {
  asFishIndividualId,
  asFishSpeciesId,
  asFishingSpotId,
  asJobId,
  asShopItemId,
} from '../../domain/ids'
import { PERK_IDS } from '../../domain/progression/perks'
import { ANGLER_SKILL_MAX, ANGLER_SKILL_MIN } from '../../domain/progression/AnglerSkill'
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION_V1,
  SAVE_SCHEMA_VERSION_V2,
  SAVE_SCHEMA_VERSION_V3,
} from '../../domain/save/SaveGame'
import { WORLD_PHASES } from '../../domain/world/worldSession'
import { transportTypeSchema } from '../../content/schema/transport'

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

/** 1 回の釣行の記録（TripSummary）。 */
const tripSchema = z.strictObject({
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

/** World の状態。Domain の WorldState と対応する。 */
const worldSchema = z.strictObject({
  time: worldTimeSchema,
  phase: z.enum(WORLD_PHASES),
  homeLocationId: z.string().min(1),
  currentSpotId: z.string().min(1).transform(asFishingSpotId).nullable(),
  arrivalTime: worldTimeSchema.nullable(),
  trip: tripSchema.nullable(),
  discoveredSpotIds: z.array(z.string().min(1).transform(asFishingSpotId)),
  availableTransports: z.array(transportTypeSchema),
})

export const saveGameV3Schema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V3),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  progression: anglerProgressionSchema,
  codex: codexSchema.default(() => ({ species: {} })),
  world: worldSchema,
  knowledge: knowledgeSchema,
  career: careerSchema,
  finance: financeSchemaV3,
})

export const saveGameV4Schema = z.strictObject({
  schemaVersion: z.literal(CURRENT_SAVE_SCHEMA_VERSION),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  progression: anglerProgressionSchema,
  codex: codexSchema.default(() => ({ species: {} })),
  world: worldSchema,
  knowledge: knowledgeSchema,
  finance: financeSchema,
  purchases: z.array(z.string().min(1).transform(asShopItemId)),
})

/** 現行 version の Save スキーマ。Migration 後の検証に使う。 */
export const currentSaveSchema = saveGameV4Schema
