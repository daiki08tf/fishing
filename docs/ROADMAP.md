# Roadmap

## Goal

最初の目標は「巨大な全国釣りゲームを作ること」ではない。

最初に証明するもの:

> 普通の会社員が休日に釣りへ行き、魚を釣り、経験・知識・資金が増え、次に行ける場所や狙いたい魚が増えるループが面白いか。

データ構造は将来の1000魚種規模に耐えられるよう設計する。

## Phase 0 — Foundation

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

Done条件:

- build PASS
- tests PASS
- fish data 1件をvalidationできる
- deterministic RNG test PASS

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

## Phase 2 — Fish Individuals

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

Done条件:

- 同種を何度釣っても個体差を感じる
- 非現実的なサイズ/重量が出ない
- Codexに記録できる

## Phase 3 — Angler Level

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

## Phase 4 — First Real Area

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

## Phase 5 — Life / Company Worker Loop

- weekday
- weekend
- paid leave abstraction
- travel time
- fishing time
- return home
- trip planning
- money
- shop
- gear purchase

仕事そのものをミニゲーム化しない。

「自由時間と資金に限りがある」ことだけをゲーム性にする。

## Phase 6 — Tackle System

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

## Phase 7 — Transport

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
