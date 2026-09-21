# Roadmap

## Goal

最初の目標は「巨大な全国釣りゲームを作ること」ではない。

最初に証明するもの:

> 普通の会社員が休日に釣りへ行き、魚を釣り、経験・知識・資金が増え、次に行ける場所や狙いたい魚が増えるループが面白いか。

データ構造は将来の1000魚種規模に耐えられるよう設計する。

早期に検証すること:

> 装備・Knowledge・Skill・Transportの成長によって、
> アクセスできる世界が広がるか。

この体験をPhase 4〜7で段階的に検証する。
実装する機能の量ではなく、この体験が成立しているかを基準に判断する。

## Phase 0 — Repository / Architecture / Deterministic Foundation

目的:
実装を始めても設計が崩れない土台。

- TypeScript project setup
- React/Vite setup
- test setup
- lint/format
- directory structure
- seeded RNG
- core types
- content validation
- save schema v1

機械判定可能な制約:

Phase 0では、CI / lint / testで機械的に判定できる制約のみを定義する。

- Levelをlocation hard lockに使わない
- Domain layerはReact / UIに依存しない
- RNGは注入可能かつseed可能にする
- Contentはtyped schemaでvalidateする
- SaveはschemaVersionを必須とする
- Domain testsはdeterministicにする
- Fish generationは物理的制約を守る
- 禁止layer dependencyをlint / testで検知する

「設計書に存在しないコードをCIが意味的に検出する」ことは行わない。
意味判定は機械的に安定しないためである。
意味論的なProduct Scope逸脱の検出はhuman / code reviewの責務とする。
詳細は [Decisions](DECISIONS.md) を参照。

Done条件:

- build PASS
- tests PASS
- fish data 1件をvalidationできる
- deterministic RNG test PASS
- 上記の機械判定可能な制約をCI / lint / testで検知できる

## Phase 1 — Fishing Vertical Slice

魚1種を実際に釣れるところまで。

対象例:
マアジまたはスズキ等、挙動を理解しやすい魚。

必要機能:

- Cast
- Wait
- Bite
- Hook
- Fight
- Land
- Fail
- Tension
- Fish stamina
- simple fish behavior

Done条件:

- 成功/失敗が成立
- 同じSeedで同じ個体/挙動を再現
- UIとDomainが分離

## Phase 2 — Fish Individuals & Variety

- 10〜20魚種
- length distribution
- weight calculation
- condition
- traits
- Trophy
- Strong Runner
- Heavy
- Old
- Scarred
- Aggressive
- personal record

魚種追加がコード変更ではなくContent追加で完結する構造を保つ。

Done条件:

- 同種を何度釣っても個体差を感じる
- 非現実的なサイズ/重量が出ない
- Codexに記録できる

## Phase 3 — Angler Progression

- XP
- Lv1〜100 curve
- Skill Point
- Casting
- Line Control
- Hooking
- Fighting
- Landing
- Detection
- Rigging
- XP decay
- first catch bonus
- size percentile bonus
- record bonus

Done条件:

- 単純な雑魚反復より新しい挑戦の方が効率的
- Levelがアクセスキーになっていない
- 上達を操作上感じられる

## Phase 4 — First Playable Tokyo-area Loop

最初の生活圏を作る。

初期候補:
東京近郊。

例:

- 都市河川
- 河口
- 東京湾岸
- 管理しやすい淡水Spot

5〜10 Spot程度。

実装:

- Map
- travel time
- transport requirement
- basic calendar
- morning/evening/night
- simple weather
- Spot Knowledge

minimal access / transport:

このPhaseに、最小限のaccess / transportの概念を含める。

- 徒歩 / 電車等の基本移動で到達できるSpotに限られる
- Spot側はtransport requirementとしてアクセス条件を持つ
- 完全な交通システムはこの時点では作らない

「行ける場所が限られている」状態を、この時点で体験できるようにする。

## Phase 5 — Life / Work / Economy

時間の進行と生活の背景を作る。

- weekday / weekend（曜日は保持し、釣りの条件として使う）
- travel time
- fishing time
- return home
- sleep / rest until next morning
- trip planning
- monthly settlement（salaryIncome − simplifiedLivingCost）
- money
- shop
- purchases

early vehicle ownership proof-of-concept:

このPhaseに、車の所有が世界を広げる体験の最小検証を含める。

- 移動手段が増えると到達可能Spotが増える
- 購入費・維持費・自由時間とのトレードオフが発生する
- 完全なTransport ProgressionはPhase 7で扱う

仕事はゲームシステムにしない。

会社員という設定は世界観として残すが、提供するのは
「毎月の安定した収入」と「生活費を差し引いた自由資金」だけである。

そのため、勤務時間による釣行制限・通勤・有給・Career XP・昇進・転職・
仕事イベント・仕事ミニゲームは作らない。

家賃・税金・食費等の細かな家計管理は行わず、「自由時間と資金に限りがある」ことだけをゲーム性にする。

## Phase 6 — Tackle Depth

- Rod
- Reel
- Line
- Leader
- Hook
- Lure/Bait
- tackle compatibility
- cast distance
- line strength
- drag
- lure range
- method suitability

目的:
最適装備が1セットに固定されないこと。

## Phase 7 — Full Transport / Access Progression

### Phase 7A — Transport / Access Domain（完了）

- walk / train / bus
- bicycle / motorcycle / compact car / SUV / rental car
- kayak / rental boat / owned boat
- data-driven TransportDefinition と ownership model
- capability ベースの Spot access
- route ごとの時間・距離・片道固定費・レンタル費
- Save v6 と v5 car migration
- `simulate:transport`

### Phase 7A.1 — 独立レビューの最小修正（完了）

- motorcycle / rental car を実際に使える一般道 route へ接続（role 差は維持）
- 入手できる Transport がどの route でも使えない状態を `validate:content` が検出する
- 行けない理由を Transport 候補の解決段階（capability 不足 / route 不在 / 所有 /
  レンタル / 設備）で説明する
- Map で移動手段を選べるようにし、既定は最も安い候補にする（費用内訳も表示）

交通手段によって:

- reachable Spot
- travel time
- cargo
- running cost

が変化する。

「車を買った瞬間に世界が広がる」体験を作る。

Phase 4 / 5 で入れた最小のアクセス概念を、このPhaseで完成させる。

- Transport種別の拡充
- アクセス条件の統合
  （transport / knowledge / permit / relationship / season等）
- Access RequirementによるSpot解禁

「Levelが上がったので解禁」ではなく、
移動手段・装備・Knowledge・Skillの成長によって行ける場所が増える形にする。

Phase 7A では操船・燃料・故障・車検・保険・駐車・交通・実道路 routing は扱わない。
SUV は rough-road に強いが water access を持たず、Kayak は nearshore に限定し、
Boat だけが offshore capability を提供する。

### Phase 7B — Expedition Planning（次候補）

- ferry / highway / parking の cost component
- lodging を含む複数日遠征の最小 Domain
- rental availability / marina / launch point の選択 UI
- cargo / gear capacity を釣行準備へ接続
- Transport の購入・利用状況を見せる Garage / Trip planning UI

ホテル詳細 UI、交通渋滞、燃料タンク、車両耐久、実道路 routing は引き続き対象外。

## Phase 8+ — 既存計画の継続

### Phase 8 — Japan & International Expedition（完了）

世界を「行ける場所」として広げる最小の形を作った。

- World → Country → Region → Area → Spot の Content 階層（`countries` / `regions`）
- 遠征（Expedition）: 航空券（往復）・宿泊・許可をまとめて予約し、
  WorldTime を進めて現地の拠点へ移る（`expeditions`）
- 国内（北海道）と海外（アラスカ）を同じ仕組みで扱う（専用システムを作らない）
- Alaska Base を拠点に、Phase 7A の Transport / Access をそのまま使って現地を移動する
- アラスカの魚（Salmon / Trout / Char / Halibut）を PROVISIONAL として追加。
  既存の FishIndividual / Trait / FightEngine をそのまま使う
- 簡易 Permit（遠征予約に含める）。Permit が必要な Spot にだけ効く
- Save v7（world.currentRegionId と expedition block）
- `npm run simulate:expedition`

意図的に対象外: 空港 / パスポート / ビザ / 手荷物 / 為替 / 実際の予約 /
天候 / 潮 / 水温 / 実道路 routing。

Phase 8以降は既存計画を継続する。本調整では個別Phaseの内容を変更しない。

- Phase 8: Reputation / Relationships
- Phase 9: Boat
- Phase 10: Regional Expansion

## Phase 8 — Reputation / Relationships

- reputation
- tackle shop NPC
- local angler
- captain / guide
- information unlock
- invitations
- events

Levelとは完全に独立。

## Phase 9 — Boat

### Phase 9 — Living Water & Big Game（完了）

「同じ釣り場でも、季節・時間・天候・潮・水の状態で魚の活性や釣れ方が変わる」と
「Boat / Offshore / Heavy Tackle で大型魚を狙う」を実装した。

- Environment Domain（`src/domain/environment`）
  - Season / TimeOfDay / Weather / Tide / WaterCondition を WorldTime と
    地域の気候プロファイル（Content）から決定論的に解決する（外部 API なし）
  - 淡水は潮なし（null）。地域ごとの気候の違いは Content（climate）に置く
- Fishing Conditions Resolver
  - Environment + Spot + Species + Method + Tackle → resolved numerical modifiers
    （Encounter 重み / bite / 視認性 / テンション）
  - 魚種は Content の環境嗜好（季節 / 時間帯 / 天候 / 潮 / 流れ / 水温）を持つ
  - 条件が悪くても重みは 0 にならない（下限 0.35）
- 大型魚のファイト
  - 個体サイズに応じて引き（pull）と粘り（endurance）が上がる
  - ライン強度 / リーダー強度 / リールのドラッグが「耐えられるテンション」に効く
  - フックサイズと魚の大きさのミスマッチは掛かり・保持・アワセ猶予を落とす
  - Heavy は大型魚で安定するが、小型魚では万能ではない（hard gate にはしない）
- 簡易 Fish Finder（Gear カテゴリ electronics）+ Search Water
  - 所持していれば反応が詳しくなる（魚種の手がかり）。持っていなくても釣れる
- 釣況の表示（HOME / MAP / SPOT / FISHING）。細かい modifier は出さない
- `npm run simulate:environment` / `npm run simulate:big-game`

意図的に対象外: 天気予報 API / 天文潮汐 / 気圧 / 月齢 / 塩分 / 溶存酸素 /
操船 / GPS / ソナー描画 / 燃料 / 船体ダメージ / 魚の回遊シミュレーション。

### Phase 9 の残り（Boat）

- boat driving gameplay

Kayak / rental boat / owned boat、launch point、offshore access、最小 running / rental cost は
Phase 7A の Access 基盤へ前倒しし、Fish Finder（簡易）は Phase 9 で実装した。
操船体験そのものは今後の Phase で扱う。

岸と沖で生態系が変わることを体験させる。

## Phase 10 — Regional Expansion

関東から順にデータ追加。

重要:
コード機能追加とコンテンツ追加を混同しない。

魚種・Spot追加だけなら原則Content PRにする。

## Content Milestones

### Prototype
- 10〜20 species
- 5〜10 spots

### Alpha
- 50〜100 species
- 30〜50 spots

### Beta
- 150〜300 species
- 100+ spots

### Long Term
- 500〜1000+ species
- hundreds to 1000+ spots

## 開発原則

各Phaseで:

1. 実装
2. 自動テスト
3. プレイ確認
4. バランス評価
5. 次Phase

大規模なコンテンツ投入は、コアループの面白さが確認できてから行う。
