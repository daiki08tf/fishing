# Architecture

## 1. 目的

Fishingは長期的に大量の魚種・Spot・装備・条件を追加するゲームになる。

そのため、初期実装から以下を守る。

- UIとゲームロジックを分離
- コンテンツデータとコードを分離
- RNGを一元化
- セーブ形式にVersionを持つ
- 魚・Spot追加で既存ロジックを書き換えない
- 現実データの出典を保持できる
- モバイル操作を第一級として扱う

## 2. 推奨技術構成

初期案:

- React
- TypeScript
- Vite
- Zustand
- Vitest
- IndexedDB

MVPではバックエンド必須にしない。

```
Browser
  |
  +-- UI
  |
  +-- Game Domain
  |
  +-- Content Data
  |
  +-- Local Save
```

将来的にクラウドセーブ・ランキング・大会等が必要になった時点でサーバーを追加する。

## 3. レイヤー

### UI

表示と入力のみ。

- Home
- Calendar
- Map
- Spot
- Fishing
- Inventory
- Tackle Setup
- Codex
- Shop
- Garage
- Reputation

### Domain

ゲームルール。

- encounterEngine
- fishGenerator
- fishingEngine
- progressionEngine
- knowledgeEngine
- reputationEngine
- economyEngine
- accessEngine
- calendarEngine
- environmentEngine

### Content

ゲームデータ。

- fish species
- regions
- spots
- gear
- methods
- transports
- regulations
- NPCs

### Infrastructure

- save/load
- IndexedDB
- migrations
- seeded RNG
- telemetry（必要になった場合）

## 4. 推奨ディレクトリ

```
src/
  app/

  core/
    access/
    calendar/
    economy/
    encounter/
    environment/
    fishing/
    knowledge/
    progression/
    reputation/
    rng/

  data/
    fish/
    gear/
    methods/
    regions/
    regulations/
    spots/
    transport/

  features/
    calendar/
    codex/
    fishing/
    garage/
    home/
    inventory/
    map/
    shop/
    tackle/

  store/

  components/

  types/

tests/
  core/
  fixtures/

docs/
```

## 5. Data Driven

魚追加時の理想:

```
fish data追加
↓
validation PASS
↓
ゲーム内に登場
```

Encounter EngineやFishing Engineを魚ごとに書き換えない。

Spotも同様。

### Transport / Access（Phase 7A）

依存とデータの流れは次の順に固定する。

```text
Transport Content + Spot Route Content
  + PlayerTransportState（利用可能 / 所有）
  + Knowledge / Permit 等
  ↓
AccessEngine
  ↓
accessible / blockedReasons / ResolvedTravelOption[]
  ↓
Economy（往復費・1釣行レンタル料） / WorldSession（移動時間）
```

- `AccessEngine` は具体的な車種・船名・Content ID を知らない
- `FishingEngine` は Transport / Spot / Shop / Economy を知らない
- Spot は Angler Level ではなく capability を要求する
- 1 つの travel option が必要 capability をすべて満たす。別々の車両の能力を
  合成して架空の経路を作らない
- 所持金不足は Access ではなく Economy が判定する
- Store は Content catalog を読み込まず、UI / simulation から検証済み定義を受け取る
- 行けない理由は Transport 候補のどの段階で落ちたか（capability 不足 / route 不在 /
  所有 / レンタル / 設備）で説明する。持っている capability を「不足」と表示しない
- Map（Trip UI）は `ResolvedTravelOption` を並べ、既定を Economy の最安候補にする。
  UI は access / cost の規則を再実装しない

## 6. Fishing Engine

ファイトは明確な状態を持つ。

初期案:

```
IDLE
CASTING
WAITING
BITE
HOOK_WINDOW
HOOKED
FIGHTING
LANDING
LANDED

FAILED:
HOOK_MISSED
HOOK_ESCAPE
LINE_BREAK
```

魚のBehaviorはデータまたはStrategyとして注入する。

UIから直接勝敗を決定しない。

## 7. Encounter Engine

入力例:

- Spot
- Date
- Time
- Weather
- Water state
- Tide
- Player method
- Lure / Bait
- Knowledge

出力:

- Biteなし
- Species candidate
- Generated individual

魚種選択と個体生成を分離する。

## 8. Environment

ゲーム内時間・環境は独立したDomainとして扱う。

将来候補:

- Season
- Time
- Weather
- Air temperature
- Water temperature
- Rain
- Wind
- Tide
- Current
- Water level
- Turbidity

最初から全て実装せず、Phaseごとに追加する。

## 9. Save

セーブには必ずschemaVersionを持つ。

例:

```ts
type SaveGame = {
  schemaVersion: number
  player: PlayerState
  progression: PlayerProgression
  inventory: InventoryState
  knowledge: KnowledgeState
  codex: CodexState
  world: WorldState
  transport: PlayerTransportState
}
```

破壊的変更時はMigrationを用意する。

Phase 7A の現行 schema は v6。v3〜v5 の `world.availableTransports` は migration 入力として
のみ残し、v6 では `transport.availableTransportIds` / `ownedTransportIds` に分離する。
旧 `car` と Phase 5 の `used-compact-car` 購入履歴は `used-compact-car` ownership へ移し、
Progression / Codex / World / Knowledge / Finance / Purchases / Inventory / Loadout を保持する。

Phase 8 の現行 schema は v7。World に `currentRegionId`（今いる地域）を足し、
遠征（`expedition`: current / visitedRegionIds / permits）を独立ブロックにする。
v6 からの migration は「home region を与え、遠征を空で作る」だけで、他のブロックは保持する。

### Expedition（Phase 8）

依存とデータの流れは次の順に固定する。

```text
Country / Region / Expedition Content + 資金
  ↓
expedition Domain（planExpedition / 残り日数）
  ↓
Economy（費用の支払い） + WorldSession（時間と currentRegionId の移動）
  ↓
現地では Phase 7A の Transport / Access
  ↓
Encounter → FishingEngine
```

- `FishingEngine` は国・地域・航空券・宿泊・許可の名前を知らない（resolved な数値だけを受け取る）
- 遠征の計画と費用は Domain（`src/domain/expedition`）に置き、UI は結果を表示するだけにする
- 「違う地域の Spot へは行けない」は WorldSession が強制する（Store の入口でも先に伝える）

### Environment / Fishing Conditions（Phase 9）

```text
WorldTime + Region Climate（Content）+ Spot の environment
  ↓  resolveEnvironment（決定論的・外部 API なし）
EnvironmentSnapshot（季節 / 時間帯 / 天候 / 潮 / 水温 / 濁り / 流れ）
  ↓  resolveFishingConditions（+ Species の環境嗜好 + 釣法 + 装備）
resolved numerical modifiers（Encounter 重み / bite / 視認性 / テンション）
  ↓
Encounter / FishingEngine
```

- `FishingEngine` は季節・天候・潮・国・魚種名を知らない（数値だけを受け取る）
- 環境は (日付, 地域, Spot の環境) から再生成できるため Save に載せない
- 魚種の環境嗜好は Content（`environmentAffinity`）。未設定は neutral
- 釣況 summary は表示用の要約であり、唯一の真実にはしない（modifier が本体）
- 大型魚は個体サイズから pull / endurance を解決する（魚種分岐を Engine に足さない）
- 装備（ライン / リーダー / ドラッグ / フックサイズ）は Tackle Resolver が
  数値へ写す。Engine は Gear の名前もカテゴリも知らない

## 10. RNG

```ts
interface RandomSource {
  next(): number
}
```

等の抽象化を通す。

`Math.random()` をDomain内部へ散在させない。

テストでは固定Seedを使う。

## 11. Validation

大量データを扱うためContent Validationを重要機能とする。

検証例:

- duplicate id
- unknown speciesId
- unknown regionId
- invalid ranges
- impossible probability
- missing source
- invalid month
- negative size
- weight model mismatch

コンテンツ追加時にCIで検出できる形を目指す。

## 12. 現実データとゲームデータ

現実データとバランス値を混同しない。

例:

```
Observed / sourced:
最大サイズ記録
生息地域
季節傾向

Game tuned:
bite probability
XP
difficulty modifier
knowledge gain
```

可能ならフィールドを分離する。

## 13. テスト優先領域

最優先:

- XP計算
- Level Up
- Fish generation
- size/weight constraints
- Encounter weighting
- access requirements
- save migration
- seeded RNG reproducibility

UI snapshotよりDomainの決定論的テストを重視する。

## 14. Mobile First

基本操作はスマホで成立させる。

Fishing画面の主要操作は少数にする。

候補:

- CAST
- REEL
- GIVE
- DRAG

PCではマウス/キーボードにも対応する。

## 15. 初期段階でやらないこと

- MMO
- PvP
- リアルタイムマルチ
- 複雑なサーバー
- 課金
- ガチャ
- 1000魚種の手入力
- 全国Spotの完全再現
- 高精度な流体シミュレーション
