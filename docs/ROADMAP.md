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

- weekday
- weekend
- paid leave abstraction
- travel time
- fishing time
- return home
- trip planning
- salary
- money
- shop
- gear purchase
- lightweight work resolution
- career events
- raise / promotion
- job offers
- work style modifiers

early vehicle ownership proof-of-concept:

このPhaseに、車の所有が世界を広げる体験の最小検証を含める。

- 移動手段が増えると到達可能Spotが増える
- 購入費・維持費・自由時間とのトレードオフが発生する
- 完全なTransport ProgressionはPhase 7で扱う

仕事そのものをミニゲーム化しない。

仕事は週単位・イベント単位で軽く処理する。
釣りSkillの一部が仕事イベントへ緩やかに影響する。

転職先は年収だけでなく、

- free time
- commute
- remote work
- paid leave
- overtime

などに差を持たせ、釣りスタイルとの相性で選べるようにする。

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

- train
- bicycle
- motorcycle
- car

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

## Phase 8+ — 既存計画の継続

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

- rental boat
- kayak
- owned boat
- launch point
- offshore Spot
- running cost
- fish finder

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
