# Current Task

## Phase

**Phase 13 — Fish Trade, Contacts & Hidden Spots**

状態: **完了**（PR作成済み、未マージ）

Phase 12 のAlpha Content（82 Species / 53 Spot / 5 playable Region）の上に、
「魚を釣る」を Money / Relationship / Information / World Discovery へ接続する
Core Loop を追加した。新しい釣りシステム（Encounter / Catchability / Text Battle）は
作り直していない。

Core Loop:

```
Catch → Keep / Release → Fish Box → 売却先を選ぶ → Cash + Trust
  → Rumor / Intel / Contact → Hidden Spot Discovery → 既存 Access 判定 → 新しい釣り
```

## Phase 13 で実装したもの

### Catch Disposition / Fish Box

- LANDED した時点で Codex / XP は既存どおり確定する（`resolveCatch` は不変）。
  Keep / Release はその後の独立した選択
- `src/domain/trade/FishBox.ts`: `KeptCatch`（catchId / speciesId / lengthCm /
  weightKg / condition / percentile / traits / caughtAt / sourceSpotId /
  sourceRegionId）。同じ catchId は二重に追加されない
- `src/domain/trade/Freshness.ts`: `caughtAt + 現在の WorldTime + storage modifier`
  から鮮度を deterministic に解決する（floor 0.5、Phase 13 の storage modifier は 1.0 固定）

### Trade System

- 3 Buyer type（`izakaya` / `wholesaler` / `market`）。BuyerDefinition は
  data-driven（pricingProfile / trustProfile）。魚種 ID・買取先名で Domain を分岐しない
- `SpeciesTradeProfile`: 生物データ（rarity）と経済データを分離した別 Content。
  全 82 Species が `tradable` を明示（**Phase 13 gameplay PROVISIONAL**。
  実在の販売可否・市場価格の主張ではない）
- `calcSaleValueYen`: base species trade value × weight × condition factor ×
  size quality factor × freshness × buyer affinity。deterministic（RNG 不使用）
- Buyer の差は個々の魚の condition / percentile / freshness への感度
  （qualitySensitivity / sizeSensitivity / freshnessSensitivity）と
  volume bonus（wholesaler）だけで表現する。魚種ごとの Buyer 好みテーブルは作らない
- 同じ catch は Fish Box から消えるため物理的に 1 回しか売れない
- 売却は既存 Finance（`earnCash` / `TRANSACTION_KINDS` に `trade` を追加）へ統合する。
  Finance state を二重化しない

### Trust / Contacts / Rewards

- Buyer は Contact の一種として同じ ID 空間（`ContactId`）を使う
- Trust 0〜100。`BuyerTrustProfile`（perTransactionBase / qualityWeight /
  maxPerTransaction）で **取引単位**の上限を持つ（大物 1 匹で 100 に届かない）
- `ContactReward`（intel / discover_spot / introduce_contact）。`minTrust` 到達で
  1 度だけ claim する（`claimedRewardIds` で判定。Save/load をまたいでも重複しない）
- Rumor → Exact Spot の 2 段階を 3 系統（izakaya: canal→estuary は 1 系統、
  wholesaler: hokkaido-coast、market: hokkaido-tributary）実装した

### Hidden Spot

- `FishingSpot.visibility`（`public` | `hidden`、省略時 `public`）を追加
- Discovery（存在を知っているか）と Access（実際に行けるか）を分離する。
  Discovery の authority は既存の `world.discoveredSpotIds` をそのまま再利用する
  （新しい state を増やさない）
- `discoverSpotFromContact`: Contact から場所を教わったときだけ `discoveredSpotIds`
  に追加する。実訪問の初回 Knowledge ボーナス（`arriveAtSpot`）は与えない
- Hidden Spot 8 件（Tokyo 4 / Hokkaido 2 / Alaska 1 / British Columbia 1）。
  すべて **fictional / generalized**（実在の秘密の釣り場の座標を収集していない）。
  全件に discover_spot 報酬と explicit Fishing Zone がある
- MAP は `visibility === 'hidden'` かつ未 discover の Spot を表示しない

### Save v9

- `SAVE_SCHEMA_VERSION_V9`。`trade: TradeState`（fishBox / contactTrust /
  claimedRewardIds / knownRumorIds）を追加
- v8 → v9 migration（`migrateV8ToV9`）は既存ブロックを一切変更せず、
  trade を空の初期状態で追加するだけ
- v1〜v7 からの migration chain もすべて v9 まで到達するよう更新した

### UI

- FISHING: LANDED 後に「持ち帰る」「リリース」ボタンを追加（個体単位で 1 度だけ）
- 新規画面: FISH BOX（一覧）/ TRADE（買取先選択・プレビュー・売却）/
  CONTACTS（Trust・既知の噂・解禁済み報酬）
- MAP: Hidden Spot は discover 前は表示しない
- Phase 14 の Visual Redesign は行っていない（構造と機能のみ）

### Content Validation

- `species-trade-profiles` の speciesId 参照検査
- `contact-rewards` の contactId / targetId（kind ごとに spot or contact）参照検査
- Hidden Spot に discover_spot 報酬（発見経路）があることの検査
- Hidden Spot に explicit Fishing Zone があることの検査
- 全 Species の trade profile 完全性は `simulate:trade-network` が担当する
  （fixture 魚種と混在する `validateContentReferences` 側には置かない）

## 非目標（実装していない）

Phase 14 Visual Redesign、料理・魚を食べる・水槽、詳細なクーラーボックス、
オークション、real-time market price API、実在店舗、実在市場の最新価格取得、
実在する秘密の釣り場の正確な座標、詳細な NPC 会話ツリー、
job / PTO / work scheduling、multiplayer、Angler Level による Spot gate。

## Phase 13 検証

- `npm run check`: typecheck / lint / format / validate:content /
  simulate:regional-content / **simulate:trade-network**（新規） / test / build
  すべて PASS
- `validate:content`: 843 records
- `simulate:trade-network`: 22/22 checks PASS
  - Keep/Release/Fish Box、売却（Finance/Trust/二重売却防止）、Buyer 差、
    Trust threshold、reward 二重防止、v8→v9 migration、Hidden Spot
    discovery/access 分離、価格 deterministic、Species/Hidden Spot 完全性
  - balance（120 trips, seed固定）: 平均 ¥1,696 / 中央値 ¥306 / 最小 ¥80 / 最大 ¥27,069
    （PROVISIONAL な目安。給与 ¥300,000/月・自由資金 約¥120,000/月を破壊しない範囲）
- tests: **72 files / 643 tests**（Phase 12 時点 71 files / 624 tests から
  domain/trade の単体テスト 18 件、migration テスト 1 件を追加）
- production bundle: JS 890.80 kB（gzip 207.31 kB）/ CSS 7.13 kB（gzip 1.86 kB）
  （Phase 12: 845.44 kB。Vite 500 kB warning は既知、継続課題）
- ブラウザ実機（Playwright + Chromium headless）: HOME → MAP（Hidden Spot 非表示を確認）
  → Fish Box → Trade → Contacts の画面遷移を確認。console error なし。
  実際に魚を釣って Keep → 売却 → Trust 上昇 → Reward → Hidden Spot 出現までの
  クリック通しは未確認（釣行そのものが乱数依存で自動化しづらいため、
  domain/simulate 側で同じ経路を検証している）

## 既知のギャップ / 次の推奨タスク

- Fish Box の容量上限・保存の耐久劣化は実装していない（意図的）
- Buyer は地域 flavor（regionId）を持つが、Trade 画面では地域を問わず全 Buyer に
  売却できる（「釣った魚を持ち帰って売る」という設定を優先し、遠征中の販路封鎖のような
  複雑さを避けた）
- 非 Buyer Contact（地元アングラー / 船長 / 漁師 / ガイド）は `introduce_contact`
  という報酬 kind として architecture は用意したが、実 Content では使っていない
- Trade / Fish Box / Contacts の実プレイテストによるバランス調整は未実施
  （`simulate:trade-network` の balance 数値は目安）
- 次候補: Phase 14 Visual Redesign、または Buyer の地域差をもう少し出す調整

詳細は `docs/ROADMAP.md`、判断は `docs/DECISIONS.md` を参照する。
