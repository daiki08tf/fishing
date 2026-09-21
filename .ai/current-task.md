# Current Task

## Phase

**Phase 6 — Tackle Depth**

状態: **完了**（詳細は `.ai/handoff.md`）

Phase 6 は「何を使って、どう狙うか」をゲームの中心へ追加する。
装備を RPG の数値ではなく**現実の釣具特性**として扱い、
対象魚・釣法・場所に適した組み合わせが強い設計にする。

Phase 5（Economy / Calendar / Shop / Transport）は**完了**している。
Phase 6 は前セッションの基盤（commit `19ed43f`）を再利用して完成させた。

## Phase 6 で実装したもの

### 前セッションの基盤（再利用。作り直していない）

- `src/domain/gear/` — Rod / Reel / Line / Leader / Hook / Lure / Bait の型と
  `GearTuning`（ゲーム調整値を現実属性から分離）
- `src/domain/method/FishingMethod.ts` — 釣法（lure / light_lure / bait / bottom）
- `src/domain/tackle/` — `Loadout`（スロット・Starter gear・変更検証）、
  `compatibility.ts`（fatal / warning / suboptimal / good / excellent）、
  `resolveTackle.ts`（`ResolvedFishingSetup` と `composeFishingModifiers`）
- `PlayerFishingModifiers` へ `maxTensionMultiplier` / `slackToleranceMultiplier` を追加。
  FishingEngine は解決済み modifier だけを利用する
- `src/domain/encounter/encounterEngine.ts` — `EncounterProfile` による
  method / offering の重み付け（`speciesAffinity` / `encounterWeight`）
- `FishSpecies` に `methodAffinity` / `offeringAffinity`（プロパティは任意）

### このセッションで完成させたもの

1. **Content Catalog 配線** — `assembleContent` / `builtInContent` / `nodeContent` が
   gear・methods・brands を実行時カタログへ載せる。追加は JSON だけで完結する
2. **Species Affinity データ** — 既存 10 魚種へ `methodAffinity` / `offeringAffinity` を
   PROVISIONAL で付与（生物学的事実を装わない検証用データ）
3. **Save v5** — `inventory`（ownedGearIds）と `loadout` を追加。
   v4 → v5 migration は Starter gear 一式と有効な Starter loadout を付与する
4. **Player Store 配線** — `equipGear` / `setMethod` / `purchaseGear` / hydrate /
   autosave slice。判定は Domain（Loadout / compatibility）に委ねる
5. **Shop 配線** — Gear 商品の購入で cash が減り `ownedGearIds` が増える。
   自動装備はしない。二重購入は `already_owned` で拒否する
6. **Fishing / Encounter 統合** — Loadout → `resolveTackle` → 合成済み modifier と
   `EncounterProfile` → Encounter → FishingEngine
7. **TACKLE UI** — Current Loadout、所有 Gear からの選択、互換性と警告理由、
   Slot / Method / Offering の表示。HOME / SPOT から開ける
8. **Shop UI 拡張** — カテゴリ・ブランド・主要スペック・所持・購入可否
9. **Brands & Product Families** — 架空ブランド 10 件（BrandDefinition）、
   `brandId` / `series` / Rod の `seriesCategory` / Reel の `sizeClass` と variant
10. **Tests** — Gear / Loadout / Compatibility / Tackle Resolver / EncounterProfile /
    Content 参照 / Save v5 / Store 配線 / Simulation / UI スモーク
11. **`npm run simulate:tackle`** — Starter / Finesse / Balanced / Power を同一条件で比較
12. **全回帰** — 既存 simulate / sample / validate をすべて再実行

## Phase 6 の主な設計判断

- **互換性は「使えない」を最小限にする** — `fatal` だけが装備不可。
  多少外れた構成（warning / suboptimal）は使える。現実でも外れた道具は使える。
- **Hook の掛かりを Engine に接続した** — `hookSuccessModifier`（0 が基準の加算値）を
  アワセ猶予 tick へ反映する。Skill の Hooking と Gear のフックが同じ経路で効く。
- **ブランドは性能を持たない** — ブランドは表示・整理の属性であり、
  性能差は各製品の現実由来スペックで表現する（`docs/DECISIONS.md` §1）。
- **Series / sizeClass は Engine の分岐条件にしない** — 商品を増やしても
  FishingEngine は変わらない。テストで「新 Gear 追加に Engine 改造が不要」を検証する。
- **Save は v5。v4 から 1 段だけ足す** — リリース前なので migration chain を増やさない。

## Phase 6 の設計方針（変更しない）

- Tackle は「高価な物ほど全部強い」ではなく
  **「対象魚・釣法・場所に適した組み合わせが強い」**
- 依存方向は `Gear Content → Inventory / Loadout → Tackle Resolver →
  Resolved Modifiers → Encounter / Fishing`
- FishingEngine は具体的な Gear ID / 名前 / 釣法名を知らない
- Encounter Engine は具体的な Lure ID を知らない
- Shop は Gear の性能ルールを知らない
- UI は Compatibility を独自計算しない
- 巨大な TackleManager を作らない

## 設計変更（重要・Fishing-first）

**会社員という設定は世界観として維持するが、仕事はゲームシステムにしない。**

- 仕事は「毎月、生活費を差し引いた自由資金が入る背景設定」としてのみ扱う
- 勤務時間・通勤・有給・Trip の勤務判定・仕事ミニゲームは持たない
- Career / 昇進 / 転職 / Job Offer / Work Skill / Cross-Skill は実装しない
- カレンダー（日付・曜日）は、時間帯・季節・天候・潮・魚の活性を
  今後接続するための**釣りシステムの器**として保持する
- 会社員要素は月次の定期収入だけに限定する

## Phase 6 の完了条件

- 釣法ごとに有効な装備構成が複数ある（Light / Finesse / Balanced / Power）
- 装備が Domain 経由で釣果とファイトに効く（UI で計算しない）
- 装備追加が Content だけで完結する（FishingEngine を書き換えない）
- `npm run check` が PASS する
- 既存 377 tests を壊さない（現在 482 tests / 54 files、すべて PASS）

## Phase 6 の非目標

- durability / 永久的なロッド破損 / ルアーロスト
- magical affix / procedural legendary gear / crafting / enhancement / 中古市場
- ボート装備・魚群探知機
- 天候・潮・季節・Reputation・NPC・マルチプレイ・バックエンド
- 実在ブランド（DECISIONS §1 のとおり初期は架空）

## Next Phase（まだ開始していない）

**Phase 7 — Full Transport / Access Progression**（`docs/ROADMAP.md`）

## 現在の制約（全 Phase 共通）

- 変更してよい範囲は、その Phase の指示で明示されたものに限る。
- 設計文書を実装都合で書き換えない。設計変更は `docs/DECISIONS.md` に記録する。
- Level を location hard lock に使わない（`docs/DECISIONS.md` §5 / §6）。
- FishingEngine に XP / Level / Codex / World / Economy / Schedule を持たせない。
- Career / 昇進 / 転職 / 仕事ミニゲームを作らない。
- 実在の場所・魚について、根拠のない断定を Content に書かない（`dataStatus` で明示）。
- `src/domain` は外部パッケージを import しない。乱数は `RandomSource` 経由のみ。
