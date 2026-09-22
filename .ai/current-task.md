# Current Task

## Phase

**Phase 13 — Fish Trade, Contacts & Hidden Spots（+ Phase 13.1 レビュー修正）**

状態: **完了**（PR #15 作成済み、未マージ）

Phase 13.1（独立レビューを受けた補強）: trade state の永続化、Buyer 地域の強制、
Hidden Spot の Domain guard、`quoteSale` への一本化、tradeTags による Buyer 差、
釣行ベースの balance simulation、`actualTrustGain`、Discovery 表示、
`introduce_contact` の禁止。詳細は `docs/DECISIONS.md` の Phase 13.1 を参照。

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
  simulate:regional-content / **simulate:trade-network**（Phase 13.1 で釣行モデルへ） /
  test / build すべて PASS
- `validate:content`: 843 records + `trade profiles cover all 82 runtime species`
- `simulate:trade-network`: Domain / Content の checks 全 PASS
  - Keep/Release/Fish Box、売却（Finance/Trust/二重売却防止）、Buyer 地域強制、
    quoteSale の不変条件、Trust 実増分、Hidden Spot の discovery guard、
    Trust threshold、reward 二重防止、v8→v9 migration、Species/Hidden Spot 完全性
  - trip simulation（120 trips × 6 attempts, seed 固定）: attempts/trip 6.00 /
    landed 2.60 / kept 2.60 / gross ¥6,613 / travel cost ¥3,924 /
    net mean ¥2,688 / median ¥533 / p90 ¥21,398 / max ¥81,403 /
    月換算（中央値×8）¥4,264
    （PROVISIONAL。給与 ¥300,000/月・自由資金 約¥120,000/月を破壊しない範囲）
- tests: **77 files / 687 tests**（Phase 13 時点 72 files / 643 tests から
  persistence 統合 3 / contract 33 / UI 9 を追加）
- production bundle: JS 899.99 kB（gzip 209.18 kB）/ CSS 7.13 kB（gzip 1.86 kB）
  （Phase 13 時点: JS 890.80 kB。Vite 500 kB warning は既知、継続課題）
- ブラウザ smoke: 下記「Phase 13.1 検証」参照

## Phase 13.1 検証（レビュー修正）

- persistence 統合テスト（実際の coordinator / repository 経路）:
  Keep → flush → reload で Fish Box 維持 / Sell → flush → reload で売却魚が復活せず
  Cash 維持 / Trust・claimedRewardIds・knownRumorIds 維持 + reward 再 claim なし
- Buyer 地域強制: Tokyo で Tokyo Buyer OK、Hokkaido へ Tokyo Buyer を Store から渡すと
  `buyer_region_mismatch`（Cash も Fish Box も変化しない）
- Hidden Spot: 未発見 + Transport 全部あり → `undiscovered` で拒否 /
  発見済み + Transport 不足 → AccessEngine が拒否 /
  発見済み + Access OK → 移動成功 / Public Spot → 従来どおり
- quoteSale: `sum(lines.valueYen) === totalValueYen`、取引不可の魚の位置で bonus が
  変わらない、並び順で合計が変わらない、preview と実売却が一致
- Trust: 98 → +2（100 で頭打ち）、100 → +0（UI も `Trust 上限（+0）`）
- Species tradeTags: 82 / 82（未知タグなし）。Buyer の preferredTags / neutralTags は
  既知タグのみ、preferred と neutral の重複なし
- 画面の通し smoke（jsdom + React DOM の実イベント。Chrome headless は sandbox の
  制約で起動できない）: HOME → MAP（未発見 Hidden Spot 非表示）→ 釣り場 →
  FISHING（CAST / HOOK / 巻く を実際にクリック）→ LANDED → Keep → HOME（Fish Box 1）→
  FISH BOX → TRADE（買取先表示・プレビュー合計 = 実際の受け取り額・売却）→
  追加釣行で Trust 15 以上 → CONTACTS → MAP（発見済みになった Hidden Spot が
  「発見済み」として出る。「訪問済み」は出ない）まで PASS

## 既知のギャップ / 次の推奨タスク

- Fish Box の容量上限・保存の耐久劣化は実装していない（意図的）
- Buyer は **今いる地域の買取先にしか売れない**（Phase 13.1）。
  現在 Buyer がいるのは `tokyo-area` の 3 件だけなので、遠征先（北海道 / アラスカ /
  BC / クイーンズランド）では TRADE 画面が空状態になる。
  遠征先に買取先を出すには Content（`buyers/*.json`）を足すだけでよい
- 非 Buyer Contact（地元アングラー / 船長 / 漁師 / ガイド）は `introduce_contact`
  という報酬 kind として architecture は用意したが、**実際の unlock 挙動は未実装**で、
  Content は `validate:content` が拒否する（silent no-op を防ぐため）。
  実装したら検査を外す
- Trade / Fish Box / Contacts の実プレイテストによるバランス調整は未実施
  （`simulate:trade-network` の balance 数値は目安）
- 次候補: Phase 14 Visual Redesign、または Buyer の地域差をもう少し出す調整

詳細は `docs/ROADMAP.md`、判断は `docs/DECISIONS.md` を参照する。
