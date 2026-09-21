# Current Task

## Phase

**Phase 3 — Angler Progression**

状態: **完了**（詳細は `.ai/handoff.md`）

Fish Individual → Catch Result → XP → Level → Skill Point → Skill → 釣りの性能
までが Domain としてつながった。Level はアクセスキーにしていない。

Codex（捕獲記録）を Save schema v2 に追加し、さらに Phase 3.1 で
Save / Load をアプリへ配線した。再読み込み・再起動しても
Angler Lv / XP / Skill Point / Skill / Perk / 反復状態 / Codex / 自己記録が復元される。
hydration が終わるまで保存しない guard により、初期状態で既存 Save を
上書きする事故も防いでいる。

## Next Phase（まだ開始していない）

**Phase 4 — First Playable Tokyo-area Loop（+ minimal access / transport）**

### Objective

「1 日」を通しで遊べる最小の生活圏を作る。ROADMAP Phase 4 の Done 条件を満たす。

- 東京近郊の 5〜10 Spot
- Map / travel time / transport requirement の最小実装
- 簡易カレンダー（平日・休日、朝・昼・夕・夜）
- 簡易天候
- Spot Knowledge（情報の段階的開示）

### Allowed scope

- `src/domain/calendar/` と `src/domain/access/` の最小実装（accessEngine）
- Spot の追加は Content のみで完結させる（Engine 改造禁止）
- Knowledge は「ボウズでも増える」ことを満たす最小の形
- Level をアクセス条件に使わないこと（機械検査を維持）

### Explicit non-goals

- 経済・仕事（Phase 5）
- タックル互換性（Phase 6）
- 交通の完成（Phase 7。Phase 4 は最小のみ）
- 全国 Map、実在魚データの大量投入

### Completion criteria

- 「日を選ぶ → 釣り場へ行く → 釣る → 帰宅」が通しで成立する
- 行ける場所が限られている状態を体験できる
- 同じ seed から同じ 1 日を再現できる
- `npm run check` が PASS する

## 現在の制約（全 Phase 共通）

- 変更してよい範囲は、その Phase の指示で明示されたものに限る。
- 設計文書を実装都合で書き換えない。設計変更は `docs/DECISIONS.md` に記録する。
- Level を location hard lock に使わない（`docs/DECISIONS.md` §5 / §6）。
- FishingEngine に XP / Level / Skill Point / Codex を持たせない。
- `src/domain` は外部パッケージを import しない。乱数は `RandomSource` 経由のみ。
- 乱数の消費順は固定する。変えると seed 再現性が壊れる。
