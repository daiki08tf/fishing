# Current Task

## Phase

**Phase 0B — Technical Foundation + Shared Handoff v1**

状態: **完了**（詳細は `.ai/handoff.md`）

ゲームプレイは実装していない。技術基盤のみを実装した。

## Next Phase（まだ開始していない）

**Phase 1 — Fishing Vertical Slice**

### Objective

魚 1 種を、実際に釣って取り込むところまで成立させる。
対象は設計文書の例（マアジまたはスズキ等、挙動を理解しやすい魚）から選ぶ。

中心は釣りの操作とファイトであり、周辺システムではない。

### Allowed scope

- Fishing Engine の状態機械
  （IDLE / CASTING / WAITING / BITE / HOOK_WINDOW / HOOKED / FIGHTING / LANDING /
  LANDED と失敗系 HOOK_MISSED / HOOK_ESCAPE / LINE_BREAK）
- テンションと魚のスタミナ
- 魚種ごとの行動を注入できる構造（データまたは Strategy）
- 最小の Encounter Engine（1 Spot・少数魚種でよい）
- 釣り画面の少数操作（CAST / REEL / DRAG / GIVE 程度）
- 上記に対する決定論的テスト

### Explicit non-goals（この Phase では作らない）

- 成長・Level・Skill の実装（Phase 3）
- 経済・仕事・カレンダー（Phase 5）
- タックル互換性の作り込み（Phase 6）
- 交通・アクセス解禁（Phase 4 / 7）
- 実在魚の大規模データ投入
- UI の装飾的な作り込み

### Completion criteria

- 成功と失敗が両方成立する
- 同じ Seed から同じ個体・同じ挙動が再現する
- UI から勝敗を決定できない（Domain が純粋で、UI と分離されている）
- Domain のテストが決定論的に通る
- `npm run check` が PASS する

## 現在の制約（全 Phase 共通）

- 変更してよい範囲は、その Phase の指示で明示されたものに限る。
- 設計文書を実装都合で書き換えない。設計変更は `docs/DECISIONS.md` に記録する。
- Level を location hard lock に使わない（`docs/DECISIONS.md` §5 / §6）。
