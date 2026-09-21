# Current Task

## Phase

**Phase 2 — Fish Individuals & Variety**

状態: **完了**（詳細は `.ai/handoff.md`）

「同じ魚種を何度釣っても違う個体が出る」仕組みを正式化した。
Species → Individual → Size / Weight / Condition / Trait → Fight → Record の流れが
Domain として成立している。魚種は 10 種（検証用サンプル）。

## Next Phase（まだ開始していない）

**Phase 3 — Angler Progression**

### Objective

釣りの上達を数値と操作感の両方で表現する。ROADMAP の Phase 3 Done 条件を満たす。

- XP と Lv1〜100 カーブ
- Skill Point（Casting / Line Control / Hooking / Fighting / Landing / Detection / Rigging）
- Perk
- XP 減衰（反復）と各種ボーナス（初捕獲・サイズ上位率・自己記録・Elite・新規場所・新規釣法）
- Level をアクセスキーにしないこと

### Allowed scope

- `src/domain/progression/` に XP 計算と Level カーブを実装する
- Phase 2 で導入した `percentile` を XP ボーナスへ接続する
- Skill をファイトへ緩やかに効かせる（DECISIONS §3 の許容範囲内）
  例: casting accuracy / timing window / line・tension tolerance / detection clarity /
  rigging efficiency
- 上記に対する決定論的テストと、バランス検証用のシミュレーション

### Explicit non-goals

- Reputation / Career / 経済（Phase 5 以降）
- 装備システム（Phase 6）
- 交通・アクセス（Phase 4 / 7）
- 実在魚の大規模データ投入

### Completion criteria

- 単純な雑魚の反復より、新しい挑戦の方が効率的である
- Level がアクセスキーになっていない（機械的に検査する）
- 上達を操作上感じられる（Skill がファイトに効く）
- `npm run check` が PASS する

## 現在の制約（全 Phase 共通）

- 変更してよい範囲は、その Phase の指示で明示されたものに限る。
- 設計文書を実装都合で書き換えない。設計変更は `docs/DECISIONS.md` に記録する。
- Level を location hard lock に使わない（`docs/DECISIONS.md` §5 / §6）。
- `src/domain` は外部パッケージを import しない。乱数は `RandomSource` 経由のみ。
- 乱数の消費順は固定する。変えると seed 再現性が壊れる。
