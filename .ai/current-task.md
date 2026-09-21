# Current Task

## Phase

**Phase 5 — Economy / Calendar / Shop / Transport**

状態: **完了**（詳細は `.ai/handoff.md`）

毎月、生活費を差し引いた自由資金が入り、その資金で釣行・買い物をし、
中古車を買うと行けなかった釣り場が開く。時間は移動・釣り・帰宅・翌朝まで休むで進む。
**仕事の予定による釣行制限は無い**（平日でも自由に釣りに行ける）。

## 設計変更（重要・Fishing-first）

**会社員という設定は世界観として維持するが、仕事はゲームシステムにしない。**

- 仕事は「毎月、生活費を差し引いた自由資金が入る背景設定」としてのみ扱う
- 勤務時間・通勤・有給・Trip の勤務判定・仕事ミニゲームは持たない
- Career / 昇進 / 転職 / Job Offer / Work Skill / Cross-Skill は実装しない
- カレンダー（日付・曜日）は、時間帯・季節・天候・潮・魚の活性を
  今後接続するための**釣りシステムの器**として保持する
- 会社員要素は月次の定期収入だけに限定する

## Next Phase（まだ開始していない）

**Phase 6 — Tackle Depth**

### Objective

タックルを「数値の強さ」ではなく「釣り方の選択」として成立させる。
ROADMAP Phase 6 の Done 条件を満たす。

- Rod / Reel / Line / Leader / Hook / Lure / Bait
- 互換性、キャスト距離、ライン強度、ドラッグ、ルアー重量域、釣法適合
- 同じ釣法でも最適装備が 1 セットに固定されないこと

### Allowed scope

- `src/domain/gear/` の実装（型は DATA_MODEL §13 に既にある）
- Tackle が Encounter（ルアー/ベイト/釣法）とファイト（ライン強度・ドラッグ）へ効く接続
- Shop に装備を追加（Content のみで並ぶ構造は Phase 5 で用意済み）
- Save への装備と所持の追加（必要なら v5）

### Explicit non-goals

- 実在ブランドの投入（DECISIONS §1 のとおり初期は架空）
- ボート・全国 Map（Phase 7 以降）
- 天候・潮
- 大会・Reputation

### Completion criteria

- 釣法ごとに有効な装備構成が複数ある
- 装備が Domain 経由で釣果とファイトに効く（UI で計算しない）
- 装備追加が Content だけで完結する
- `npm run check` が PASS する

## 現在の制約（全 Phase 共通）

- 変更してよい範囲は、その Phase の指示で明示されたものに限る。
- 設計文書を実装都合で書き換えない。設計変更は `docs/DECISIONS.md` に記録する。
- Level を location hard lock に使わない（`docs/DECISIONS.md` §5 / §6）。
- FishingEngine に XP / Level / Codex / World / Economy / Schedule を持たせない。
- Career / 昇進 / 転職 / 仕事ミニゲームを作らない。
- 実在の場所・魚について、根拠のない断定を Content に書かない（`dataStatus` で明示）。
- `src/domain` は外部パッケージを import しない。乱数は `RandomSource` 経由のみ。
