# Data Model

## 1. 目的

このゲームは最終的に以下の規模を想定する。

- 1000+ Fish Species
- 1000+ Fishing Spots
- 多数の地域
- 多数の釣法
- 多数のタックル
- 時間・季節・天候・潮・水温等の条件
- 地域別ルール

そのため、魚やSpotをコードにハードコードしない。

データ駆動を原則とする。

## 2. FishSpecies

概念モデル:

```ts
type FishSpecies = {
  id: string
  japaneseName: string
  scientificName?: string

  taxonomy?: {
    family?: string
    genus?: string
  }

  waterTypes: ("fresh" | "brackish" | "salt")[]

  distribution: RegionRef[]
  habitats: HabitatType[]
  depthRange?: Range
  temperatureRange?: Range

  seasonality?: SeasonalProfile
  timeActivity?: TimeProfile
  tidePreference?: TideProfile
  currentPreference?: CurrentProfile

  diet?: string[]
  baits?: string[]
  lureCategories?: string[]
  fishingMethods?: string[]

  lengthModel: LengthDistribution
  weightModel?: WeightModel

  fightProfile: FightProfile

  rarity: number

  sourceRefs?: SourceRef[]
}
```

## 3. FishIndividual

```ts
type FishIndividual = {
  id: string
  speciesId: string

  lengthCm: number
  weightKg: number

  condition: number

  traits: FishTrait[]

  fightSeed: string

  caughtAt?: string
  spotId?: string
  capturedAt?: string

  percentile?: number
}
```

個体の保存は原則「実際にプレイヤーが接触した魚」に限定し、世界中の全魚を事前生成しない。

## 4. FishTrait

初期候補:

```ts
type FishTrait =
  | "trophy"
  | "old"
  | "strong_runner"
  | "heavy"
  | "scarred"
  | "aggressive"
```

将来魚種固有Traitを追加できる。

Traitはファンタジー能力ではなく、現実的な個体差として説明できるものを優先する。

## 5. Region

```ts
type Region = {
  id: string
  name: string
  parentId?: string

  type:
    | "country"
    | "prefecture"
    | "area"
    | "water_system"
    | "water_body"
}
```

例:

Japan
→ Kanagawa
→ Sagami Bay
→ Miura
→ specific area

## 6. FishingSpot

```ts
type FishingSpot = {
  id: string
  name: string

  regionId: string

  environment: EnvironmentType

  access: AccessRequirement[]

  habitatTags: string[]

  depth?: DepthProfile
  current?: CurrentProfile

  fishTable: FishOccurrence[]

  regulations?: RegulationRef[]

  knowledgeConfig: SpotKnowledgeConfig

  sourceRefs?: SourceRef[]
}
```

## 7. FishOccurrence

魚種とSpotの出現関係。

```ts
type FishOccurrence = {
  speciesId: string

  basePresence: number

  season?: SeasonalProfile
  time?: TimeProfile
  tide?: TideProfile
  weather?: WeatherProfile
  temperature?: Range

  preferredHabitats?: string[]

  sizeModifier?: number
}
```

「Spotに魚種を置く」のではなく、条件に応じてEncounter Weightを算出する。

## 8. Encounter

概念式:

```
EncounterWeight =
  BasePresence
  × SeasonFactor
  × TimeFactor
  × WeatherFactor
  × TideFactor
  × WaterTemperatureFactor
  × HabitatFactor
  × MethodFactor
  × LureOrBaitFactor
```

完全な科学シミュレーターではなく、現実の傾向をゲームとして扱える抽象度にする。

## 9. Transport

```ts
type Transport = {
  id: string
  name: string

  type:
    | "walk"
    | "train"
    | "bus"
    | "bicycle"
    | "motorcycle"
    | "car"
    | "suv"
    | "kayak"
    | "trailer_boat"
    | "boat"

  purchaseCost?: number
  runningCost?: number

  cargoCapacity: number
  range?: number

  accessTags: string[]
}
```

## 10. AccessRequirement

SpotアクセスはLevelではなく条件で定義する。

例:

```ts
type AccessRequirement =
  | { kind: "transport"; tag: string }
  | { kind: "knowledge"; minimum: number }
  | { kind: "reputation"; minimum: number }
  | { kind: "permit"; permitId: string }
  | { kind: "relationship"; targetId: string; minimum: number }
  | { kind: "season"; months: number[] }
```

## 11. PlayerProgression

```ts
type PlayerProgression = {
  anglerLevel: number
  anglerXp: number

  skillPoints: number

  skills: {
    casting: number
    lineControl: number
    hooking: number
    fighting: number
    landing: number
    detection: number
    rigging: number
  }

  reputation: number

  methodProficiency: Record<string, number>
}
```

## 12. Knowledge

```ts
type KnowledgeState = {
  fish: Record<string, number>
  spots: Record<string, number>
  regions: Record<string, number>
  methods: Record<string, number>
}
```

0〜100等のスコアを内部値として使う場合でも、UIでは必ずしも数値をそのまま見せる必要はない。

## 13. Gear

実在製品を使うか架空ブランドを使うかは後で決定する。

コアデータとして必要なもの:

### Rod

- length
- power
- action
- lureWeightRange
- lineRating
- weight
- sensitivity

### Reel

- size
- gearRatio
- drag
- weight
- lineCapacity
- retrieveRate

### Line

- material
- diameter
- strength
- stretch

### Lure

- category
- length
- weight
- depth
- action
- buoyancy
- targetProfile

装備効果は現実の性能として説明できる範囲を基本とする。

## 14. Regulation

```ts
type Regulation = {
  id: string
  regionId?: string
  spotId?: string
  speciesId?: string

  type:
    | "permit"
    | "closed_season"
    | "closed_area"
    | "size_limit"
    | "bag_limit"
    | "method_restriction"

  validFrom?: string
  validTo?: string

  sourceRefs: SourceRef[]
}
```

## 15. SourceRef

現実データと照合するため、ソース情報を持てる構造を用意する。

```ts
type SourceRef = {
  id: string
  url?: string
  title: string
  publisher?: string
  accessedAt?: string
  verifiedAt?: string
}
```

特に法令・遊漁ルールは日付を伴って管理する。

## 16. RNG

乱数生成はシード可能にする。

用途:

- 個体生成
- サイズ
- Trait
- 魚の行動
- Encounter

目的:

- 再現可能なテスト
- バグ調査
- バランス検証

UIコンポーネントから直接ランダム生成しない。


## 17. Career

仕事は軽量なサブシステムとしてデータ化する。

```ts
type CareerState = {
  jobId: string
  careerLevel: number

  salaryBand: number

  workStyle: {
    remoteDays: number
    flexTime: boolean
    overtimeLoad: number
    commuteMinutes: number
  }

  paidLeave: number
  careerXp: number
}
```

職種側:

```ts
type JobDefinition = {
  id: string
  name: string

  salaryRange: Range

  timeCost: number
  overtimeProfile: number
  commuteProfile?: number

  remoteWork?: boolean
  flexTime?: boolean

  paidLeaveProfile: number

  eventTable: string[]
}
```

仕事の結果計算ではAngler Skillsの一部をCrossSkill Modifierとして参照できる。

ただしCareerとAngler Levelは独立した状態として保存する。

## 18. Economy Philosophy

経済は詳細な家計シミュレーターにしない。

内部的には以下程度で十分。

```ts
type FinanceState = {
  cash: number
  salaryIncome: number
  simplifiedLivingCost: number
}
```

生活費はまとめて自動控除する。

プレイヤーが判断する主な支出は釣り関連資産・移動・遠征。

経済バランスは「何を先に買うか」の迷いを作るために使い、通常の釣行そのものを長期間禁止するためには使わない。
