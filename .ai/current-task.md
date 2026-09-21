# Current Task

## Phase

**Phase 1 — Fishing Vertical Slice**

状態: **完了**（詳細は `.ai/handoff.md`）

魚 1 種について CAST → WAITING → BITE → HOOK → FIGHT → LAND / FAIL を成立させた。
コンテンツ量より、Fishing Domain の設計とファイトの操作感の基礎を優先した。

## Next Phase（まだ開始していない）

**Phase 2 — Fish Individuals & Variety**

### Objective

同じ魚種でも 1 匹ごとに違いを感じられるようにする。
ROADMAP の Phase 2 Done 条件を満たす。

- 個体差（size / weight / condition / trait）
- Trophy / Strong Runner / Heavy / Old / Scarred / Aggressive
- personal record

### Allowed scope

- `FishSpecies.lengthModel` / `weightModel` を使った個体生成の正式化
- Trait（`FISH_TRAITS`）の抽選と、ファイト特性への反映
- percentile（同種サイズ分布での上位率）の算出
- Codex に記録できる最小構造（Domain の記録型とテスト）
- 個体差の分布を検証する統計的テスト

### Explicit non-goals

- 実在魚の大規模データ投入（Phase 4 以降）
- XP / Level（Phase 3）
- 装備システム（Phase 6）
- 天候・潮・時間帯（Phase 4）

### Completion criteria

- 同種を何度釣っても個体差を感じる
- 非現実的なサイズ・重量が出ないことをテストで担保する
- 同じ seed から同じ個体が再現する
- `npm run check` が PASS する

## 現在の制約（全 Phase 共通）

- 変更してよい範囲は、その Phase の指示で明示されたものに限る。
- 設計文書を実装都合で書き換えない。設計変更は `docs/DECISIONS.md` に記録する。
- Level を location hard lock に使わない（`docs/DECISIONS.md` §5 / §6）。
- `src/domain` は外部パッケージを import しない。乱数は `RandomSource` 経由のみ。
