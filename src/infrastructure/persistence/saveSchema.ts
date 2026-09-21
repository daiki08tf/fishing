import { z } from 'zod'
import { asJobId } from '../../domain/ids'
import { CURRENT_SAVE_SCHEMA_VERSION } from '../../domain/save/SaveGame'

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
const financeSchema = z.strictObject({
  cash: z.number().finite(),
  salaryIncome: z.number().nonnegative(),
  simplifiedLivingCost: z.number().nonnegative(),
})

export const saveGameV1Schema = z.strictObject({
  schemaVersion: z.literal(CURRENT_SAVE_SCHEMA_VERSION),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  progression: progressionSchema,
  knowledge: knowledgeSchema,
  career: careerSchema,
  finance: financeSchema,
})

/** 現行 version の Save スキーマ。Migration 後の検証に使う。 */
export const currentSaveSchema = saveGameV1Schema
