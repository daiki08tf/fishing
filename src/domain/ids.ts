/**
 * Branded identifier types.
 *
 * 設計方針:
 * - IDは実行時にはただの string だが、型レベルでは種別ごとに区別する。
 *   種別の取り違え（speciesId と spotId の混在など）をコンパイル時に検出するため。
 * - 値の生成は外部データ境界（Content validation / Save migration）で行う。
 *   ここでは変換関数のみを提供し、検証は行わない。
 */

export type Brand<TValue, TName extends string> = TValue & { readonly __brand: TName }

export type FishSpeciesId = Brand<string, 'FishSpeciesId'>
export type FishIndividualId = Brand<string, 'FishIndividualId'>
export type RegionId = Brand<string, 'RegionId'>
export type FishingSpotId = Brand<string, 'FishingSpotId'>
export type TransportId = Brand<string, 'TransportId'>
export type RegulationId = Brand<string, 'RegulationId'>
export type SourceRefId = Brand<string, 'SourceRefId'>
export type JobId = Brand<string, 'JobId'>
export type PermitId = Brand<string, 'PermitId'>
export type RelationshipTargetId = Brand<string, 'RelationshipTargetId'>
export type GearId = Brand<string, 'GearId'>

export const asFishSpeciesId = (value: string): FishSpeciesId => value as FishSpeciesId
export const asFishIndividualId = (value: string): FishIndividualId => value as FishIndividualId
export const asRegionId = (value: string): RegionId => value as RegionId
export const asFishingSpotId = (value: string): FishingSpotId => value as FishingSpotId
export const asTransportId = (value: string): TransportId => value as TransportId
export const asRegulationId = (value: string): RegulationId => value as RegulationId
export const asSourceRefId = (value: string): SourceRefId => value as SourceRefId
export const asJobId = (value: string): JobId => value as JobId
export const asPermitId = (value: string): PermitId => value as PermitId
export const asRelationshipTargetId = (value: string): RelationshipTargetId =>
  value as RelationshipTargetId
export const asGearId = (value: string): GearId => value as GearId
