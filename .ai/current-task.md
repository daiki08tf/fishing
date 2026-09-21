# Current Task

## Phase

**Phase 4 — First Playable Tokyo-area Loop**

状態: **完了**（詳細は `.ai/handoff.md`）

HOME → Map → Spot → 釣り（複数回）→ 帰宅 → HOME が 1 本のループとして成立した。
ゲーム内時間が移動・釣り・帰宅で進み、釣れなくても Knowledge が増える。
釣り場は 8 件（東京近郊を模した検証用データ）。

## Next Phase（まだ開始していない）

**Phase 5 — Life / Work / Economy（+ early vehicle ownership proof-of-concept）**

### Objective

「平日は働き、休日に釣りに行く」生活を成立させる。ROADMAP Phase 5 の Done 条件を満たす。

- 週単位の仕事解決（評価・給与・自由時間）
- 有給・残業・勤務形態の抽象化
- Career の成長とイベント（昇給・昇進・転職・リモート・フレックス）
- 釣り Skill が仕事へ緩く効く Cross-Skill
- 資金（現金・給与・簡易生活費）と Shop / 装備購入
- 車の所有が世界を広げる最小検証

### Allowed scope

- `src/domain/career/` と `src/domain/economy/` の実装（型は DATA_MODEL §17 / §18 に既にある）
- Calendar（平日・休日）を使った釣行の制限と自由時間
- Save への career / finance の実接続（現在は PROVISIONAL な中立値）
- 移動手段の購入（車）と Access への反映

### Explicit non-goals

- 細かな家計管理（家賃・税・食費）
- 仕事の操作ミニゲーム
- ボート・全国 Map・本格 Gear（Phase 6 以降）
- 実在魚データの大量投入

### Completion criteria

- 「休日しか釣りに行けない」「資金で車を買うと行ける場所が増える」が成立する
- 仕事が釣りの自由度に返ってくる（給料・休み・通勤）
- 資金不足で長時間釣行不能にならない
- `npm run check` が PASS する

## 現在の制約（全 Phase 共通）

- 変更してよい範囲は、その Phase の指示で明示されたものに限る。
- 設計文書を実装都合で書き換えない。設計変更は `docs/DECISIONS.md` に記録する。
- Level を location hard lock に使わない（`docs/DECISIONS.md` §5 / §6）。
- FishingEngine に XP / Level / Skill Point / Codex / World を持たせない。
- 実在の場所・魚について、根拠のない断定を Content に書かない（`dataStatus` で明示）。
- `src/domain` は外部パッケージを import しない。乱数は `RandomSource` 経由のみ。
- 乱数の消費順は固定する。変えると seed 再現性が壊れる。
