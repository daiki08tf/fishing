# Current Task

## Phase

**Phase 17 — Boat & Offshore Expansion（17A〜17E）**

状態: **完了**（branch `phase-17-boat-offshore`、PR #19・未マージ、main へは
まだ入っていない）

Phase 16（World Expansion I、main へ統合済み、HEAD
`12bb84f364bdebf886aae4ce8332971b892bc6fe`）の 14 Region / 229 Species / 140 Spot
の上に、「沖」と「水深」を新しい Region を増やさずに足した。5 つの内部
sub-phase（Offshore Core → Method/Fish Finder → Boat Economy/Charter/Captain →
World Content → Balance/Regression/Docs）に分け、それぞれ `npm run check` の
green を確認してからコミットした。詳細な決定事項は `docs/DECISIONS.md` の
"Phase 17" を、実装の要点は末尾の "Phase 17（Boat & Offshore Expansion）" 節を
参照。Save は v9 のまま（新しい永続 state は最後まで 1 つも増えていない）。

過去の Phase（14 以前）の状態はこのファイルの下の各節を参照。

## 狙い

「親しみやすいドット絵の経営シム / 育成ゲーム」を思わせる見た目へ全画面を
再スキンしつつ、Phase 13 のゲームプレイをそのまま保つ。目標比率は
**モダンなモバイル操作性 70% / レトロゲーム感 30%**。

## Phase 14 で実装したもの

### Visual System

- `src/ui/styles/tokens.css`（新規）: 色（palette + semantic）/ spacing / radius /
  border / shadow / typography / z-index / motion duration の design token。
  既存 4 CSS ファイルはすべて同じ `--color-*` 変数を参照していたため、
  `global.css` の旧 `:root` 色定義をここへ一本化するだけで、Phase 14 でまだ
  触れていない画面（Shop / Tackle / Expedition / Progression）にも新しい配色が
  自動的に伝播した
- Motion token 3 段階（fast 120ms / normal 200ms / special 350ms）。
  BITE の HIT 演出は `--motion-normal`（spec の 100〜300ms 目安に収める）、
  NEW RECORD / Trophy / LANDED 背景遷移は `--motion-special`
- `prefers-reduced-motion: reduce` で全アニメーションを実質即時にする

### 新規共通コンポーネント

`src/ui/components/`: `PixelIcon`（13 種の手書き inline SVG アイコン）、
`FishSilhouette`（魚種 ID から決定論的に色分けする汎用シルエット。画像アセット
不要）、`BiomeScene`（`Spot.environment` からの小さな pixel landscape ヘッダー。
Region ID 分岐は使わない）、`StatMeter`（Trust 等のゲージ）、`EmptyState`、
`ResultBanner`（LANDED 結果カード）。`src/ui/nav/BottomNav`（下部固定 5 項目
ナビゲーション）。

### 画面別の変更

- **HOME**: 今日の天候・釣況・Rumor teaser を優先表示する構成に整理。
  二次的なボタン（タックル/店/成長/Fish Box/人脈/休む）は「もっと見る」に集約。
  Hidden Spot の未発見件数は引き続き漏らさない
- **MAP**（最優先改善）: 長い 1 行リストから、Region タブ + ノード風 Spot Card
  へ変更。Public / 発見済み Hidden で PixelIcon を変える（drop / star）。
  移動手段は `<details>` へ折りたたみ、「〜で行く」ボタンは常に見える位置に残す
- **SPOT**: BiomeScene ヘッダー、「釣りを始める」「水面を探る」を昇格した最上部
  action panel に統合。水域/タックル/食いつき/分かっていること情報は
  `<details>` へ折りたたみ
- **FISHING**: `WaterScene`（phase / behaviour から合成する CSS/SVG 水面）を
  追加。LANDED 時は `ResultBanner` を独立表示し、重複する数値表ブロックは隠す。
  Text Battle のロジック・コマンド可否は一切変更していない
- **FISH BOX**: 1 行メタデータ表から Fish Card へ。一覧は
  name/length/weight/percentile/freshness/推定売却額のみ、産地・Trait・釣った
  日時は `<details>` へ折りたたみ
- **TRADE**: Buyer タブ列から Buyer Card（name/type/Trust meter/description）へ。
  魚を選ぶと今いる地域の Buyer 全員分の査定比較（既存 `quoteSale` を再利用）を表示
- **CONTACTS**: RPG 風 Contact Card（pixel portrait/role/Trust meter/既知の噂/
  次の報酬を「？？？」でマスク）
- **CODEX**（新規画面）: 82 種の Grid。未捕獲は「？？？」、捕獲済みは既存
  `CodexState` の catchCount/largestLengthCm。捕獲済/未捕獲・地域・水域で filter
- **MENU**（新規画面）: タックル/ショップ/遠征/人脈/成長への導線と開発用リセット

## 変更していないもの（Absolute Rule 遵守）

FishingEngine / Text Battle / Casting Zone / Catchability / Save v9 /
Fish Box / Trade / Trust / Contacts / Hidden Spot の Discovery・Access 分離 /
Transport / Expedition / Economy / Codex / Knowledge / Regional Content —
これらの Domain コードは 1 行も変更していない。変更したのは `src/ui/` と
`src/app/main.tsx` の import 1 行のみ。

## テスト

既存 77 files / 687 tests はすべて無変更で PASS。Phase 14 で追加した 5 files /
28 tests:

- `tests/ui/bottomNavSmoke.test.ts` — 5 タブの active 状態、fishing 中は非表示
- `tests/ui/codexScreenSmoke.test.ts` — 未捕獲は「？？？」、捕獲済みは既存記録を表示
- `tests/ui/fishBoxCardsSmoke.test.ts` — カード表示・折りたたみ詳細・空状態
- `tests/ui/fishingCommandAvailability.test.ts` — UI のボタングループが
  Domain の `ALLOWED_COMMANDS` と過不足なく一致することを保証
  （FishingSnapshot は `useEffect` 内で作られるため、`renderToStaticMarkup` では
  実際の disabled 状態を直接検証できない制約への対応）
- `tests/ui/allScreensSmoke.test.ts` — 13 画面すべてが新規セーブで例外なく描画される

`discoveryWording.test.ts` / `tradeScreenSmoke.test.ts` など既存 UI smoke は
文字列を一切変えずに PASS（Buyer 名・地域別空状態・推定売却額などの exact-text
制約を維持）。

## 検証

- `npm run check` は本ドキュメント更新後に最終実行する（結果は
  `.ai/handoff.md` の Phase 14 節に記録）
- tests: **82 files / 715 tests**（Phase 13 時点 77 files / 687 tests から +5 files / +28 tests）
- production bundle: JS 916.60 kB（gzip 214.07 kB）/ CSS 22.04 kB（gzip 4.51 kB）
  （Phase 13 時点: JS 899.99 kB / gzip 209.18 kB、CSS 7.13 kB / gzip 1.86 kB。
  差分は新規 CSS ファイル・コンポーネント分。重いライブラリは追加していない）
- Playwright + Chromium（`/opt/pw-browsers/chromium`）で実ブラウザの通し確認:
  HOME → MAP → SPOT → FISHING（CAST → HOOK → AUTO でファイト）→ HIT → LANDED
  （ResultBanner 表示）→ Keep → 帰宅 → FISH BOX → TRADE（Buyer Card・査定比較）→
  CONTACTS → CODEX まで PASS
- 375×812 / 390×844 / 430×932 の 3 viewport で `document.documentElement`
  の scrollWidth/clientWidth を比較し、横スクロールが発生しないことを確認
  （HOME/MAP/SPOT/FISHING/FISH BOX/TRADE/CONTACTS/CODEX/MENU）
- 未着手の画面（Shop/Tackle/Expedition/Progression）も tokens.css のカスケードで
  新しい配色を継承していることを目視確認済み

## 既知のギャップ / 次の推奨タスク（Phase 15 候補）

- Codex の仮想化（windowing）は未実装（82 種では実用上問題ないが、
  1000 種規模では DOM 最適化が要る。意図的に Phase 15 送り）
- PWA の `manifest.webmanifest` / `theme-color` は新しい palette に合わせて
  いない（見た目の一貫性のための follow-up候補）
- 自動スクリーンショット回帰（CI 組み込み）は未整備。今回は手動での
  Playwright 実行のみ
- `PixelIcon.tsx` / `FishSilhouette.tsx` は component と定数を同一ファイルから
  export しているため `react-refresh/only-export-components` の lint warning
  が出る（error ではない。Phase 13 以前からの既知パターンを踏襲）

詳細は `docs/ROADMAP.md`、判断は `docs/DECISIONS.md` を参照する。


## Phase 14.1（iPhone UI polish）

Phase 14 の iPhone 実機相当レビューで見つかった UI の問題を同じ branch / PR で修正した。
新しいゲーム機能・Domain ルール・Save schema の変更は無い（UI の条件分岐と CSS のみ）。

### 直したもの

- **Catch Result を最優先に。** `ResultView`（魚・長さ・重さ・NEW / NEW RECORD /
  TROPHY・Keep / Release）を LANDED の DOM 最上位に置く。CSS の position では
  持ち上げず、構造として先に出す。ResultBanner の内部も「魚 → サイズ → バッジ」へ
- **終了後のファイト UI を削除。** LANDED / HOOK_MISSED / HOOK_ESCAPE / LINE_BREAK では
  Fish stamina / Tension / Hook hold / Distance / Drag / 行動ログ / ファイトコマンド /
  AUTO / 狙う場所を描画しない（`isFightUiVisible`）
- **画面遷移の scroll reset。** `src/ui/nav/scrollReset.ts` を AppShell で 1 回だけ
  install し、top-level screen が変わったときだけ `scrollTo(0, 0)`。釣り中の phase 遷移
  では発火しない
- **MAP を地図ボード化。** `environment` から「上流・湖 / 川・運河・河口 / 海・磯 / 沖」の
  帯へ決定的に配置（Spot ID 分岐なし・Content 順に依存しない）。ノードを押すと
  ボード直下に summary が出て、そのまま移動できる。詳細カード一覧は下に残す。
  未発見 Hidden Spot はノードも詳細も出さない（規則は不変）
- **文章量の削減。** TRADE / CONTACTS の買取先紹介を、pricingProfile / preferences から
  組み立てた 1〜2 行の役割文 + 好みタグに変更（Content の長文 description と
  PROVISIONAL の注記は画面に出さない）。HOME は家計の内訳を `<details>` へたたみ、
  天気を CTA の直後へ移動
- **WaterScene の軽い装飾。** 水面の泡と LANDED の小さな水しぶき（CSS animation のみ）

### 検証

- `npm run check` PASS（typecheck / lint / format / validate:content /
  simulate:regional-content / simulate:trade-network / tests / build）
- tests: **86 files / 748 tests**（Phase 14 時点 82 files / 715 tests。
  resultFlow 9 / scrollReset 5 / mapBoard 8 / gameFacingCopy 11 を追加）
- bundle: JS 925.44 kB（gzip 216.48 kB）/ CSS 26.44 kB（gzip 5.20 kB）
  （Phase 14 baseline: JS 916.60 kB / CSS 22.04 kB。新規ライブラリ無し）
- jsdom + React DOM の実イベントで手動ループを通し確認（一時テスト / 非 commit）:
  HOME → MAP（ボード → ノード選択 → summary）→ Spot → Fishing → LANDED
  （結果が最上位・戦闘 UI なし）→ Keep → Fish Box → TRADE（preview = 実額）→
  CONTACTS（PROVISIONAL 無し）→ CODEX。移動のたびに scrollTo(0,0) が呼ばれることも確認
- 実ブラウザ（Chrome headless）は sandbox 制約で起動できないため、
  375x812 / 390x844 / 430x932 の実測レイアウトとスクリーンショットは未取得。
  CSS の固定幅（300px 以上）0 件・`min-width` は 0 のみ・`overflow-x` 指定なしを
  静的に確認した


## Phase 15（Content Scale Foundation / 1000+ Species Architecture）

目的はゲームルールの追加ではなく、1000+ Species / 多数 Region / 多数 Spot に耐える
Content Architecture の整備。既存 Content（82 Species / 53 Spot / 5 playable Region）は
そのまま。Save v9 / Domain / FishingEngine / Trade / Trust / Hidden Spot は変更なし。

### 作ったもの

- `scripts/build-content-index.ts`（新規）: `src/content/data` から
  - `src/content/generated/content-index.json`（軽量カタログ: species / region summary + pack manifest）
  - `src/content/generated/content-ownership.json`（kind/file → pack。node / 検証専用）
  - `src/content/generated/packs/*.ts`（pack module。JSON を静的 import）
  を生成する。`npm run content:index` で再生成。
- `src/content/catalog/summary.ts` / `speciesSearch.ts` / `mergeContent.ts` / `scaleCheck.ts`:
  軽量サマリ型、検索・絞り込み・ページング（純粋関数）、Content の束と合成、
  Content Scale 検証。
- `src/content/runtime/contentRuntime.ts` + `packModules.ts`（新規）:
  pack の遅延ロード（cache / 同時要求の共有 / retry / idle-loading-ready-error）、
  `ensureRegion` / `ensureSpeciesDetail` / `ensureTackle` / `ensureWorld`。
  `hydrateFully` は node / SSR / テスト用。
- `src/ui/content/ContentLoadingPanel.tsx` + `contentRuntimeHooks.ts`:
  「地域情報を読み込み中…」+ retry。AppShell が初期 pack を gate し、
  Home / Map / Spot / Trade / Fish Box / Contacts / Expedition が
  今いる（または表示中の）地域 pack を必要時に読む。
- Codex: SpeciesSummary ベースに書き換え（full FishSpecies を読まない）、
  日本語 / 英語 / scientificName / id 検索、捕獲・地域・水域フィルタ、
  60 件ずつの段階表示（`さらに表示`）。
- `scripts/simulate-content-scale.ts`（新規, `npm run check` に追加）:
  production のカタログ / pack / 所有権の検査 + 1000 / 1500 件の synthetic summary で
  検索・フィルタ・ページング・id 一意性を検証（時間は参考値、判定に使わない）。
- `scripts/analyze-content-scale.ts`（新規, `npm run check` に追加）:
  dist から初期 chunk と pack chunk のサイズを集計（初期 chunk ≤ 700 kB を検査）。

### 結果（Phase 14 → Phase 15）

| | Phase 14 | Phase 15 |
| --- | --- | --- |
| initial JS | 925.44 kB（gzip 216.48） | **536.35 kB（gzip 157.43）** |
| total JS | 925.44 kB | 906.10 kB |
| chunks | 1（全 Content 入り） | initial + 8 packs |
| tests | 86 files / 748 | **90 files / 778** |

pack 別: tackle 196.59 / species-detail 86.96 / region-tokyo-area 39.01 /
world 12.47 / hokkaido 11.15 / alaska 8.80 / british-columbia 8.52 / queensland 6.23 kB。


## Phase 15.1（True Lazy Loading / Content Scale Hardening）

Phase 15 のレビュー指摘「chunk は分かれたが runtime では起動時に全部読む」を修正。
Domain / Save v9 / gameplay rule は不変。

- 起動 critical path = lightweight catalog + world + 今いる地域 + その地域の Species shard
  （`bootPackKeys`）。Tackle は background preload、他地域と全 Species は起動で読まない
- Species detail を **Region shard** に分割（tokyo-area 38 / hokkaido 13 / alaska 10 /
  british-columbia 20 / queensland 16。重複定義なし・共有分は shared chunk）
- Fish Box / Trade は保存された Species ID から必要 shard を追加 load（Save に pack 情報なし）
- Expedition は mount 時には何も読まず、目的地の focus / 出発時にその地域だけ preload
- Codex の名前検索は捕獲済み限定（未捕獲の存在を検索で漏らさない）。region / water filter は不変
- 二次画面（Codex / Shop / Tackle / Expedition / Fish Box / Trade / Contacts / Menu /
  Progression）を dynamic import 化して初期 chunk から外した
- boot raw 925.44 → 604.95 kB / boot gzip 216.48 → 170.67 kB（-21.2%）/
  initial chunk 512.00 kB、tests 91 files / 787


## Phase 15.2（Startup Network Final Hardening）

Phase 15.1 の「tackle が AppShell mount 直後に background fetch される」問題を修正。

- AppShell から `ensureTackle()` の preload を削除（`src/ui/content/bootContent.ts` が
  起動で読む唯一の入口 = `bootPackKeys` のみ）。tackle は Tackle / Shop / Spot / Fishing の
  gate で必要な時に読む。HOME は neutral fallback で成立（Domain rule 不変）
- requestIdleCallback preload は行わない（起動直後の追加 fetch を 0 にする）
- 起動 network の保証を behavioral test に変更（instrumented importer で
  boot / MAP / Spot / Tackle / Shop / 目的地選択ごとの呼び出し回数を検証）。
  source 文字列検索は主要な保証にしない
- `analyze:content-scale` は boot pack 一覧と「tackle / 他地域を含まない」ことを検査
- boot raw 604.93 kB / boot gzip 170.62 kB（Phase 14 比 -21.2%）/
  initial chunk 511.99 kB / tackle chunk 201.31 kB（boot 非含有）
- tests 91 files / 791


## Phase 16（World Expansion I — Part 1）

Phase 15 の Pack / lazy loading 基盤の上に世界を拡張した。今回は **Part 1**
（世界の骨格 + 9 地域の representative content）。目標 200〜230 Species /
130〜150 Spot へは Part 2 で積み増す。

- 14 playable region（既存 planned 4 を要求 id へ統合 + 日本 4 地域 + 国際 5 地域）
- species 82 → 144（新規 62。canonical global ID、既存 Species の distribution を拡張して再利用）
- spot 53 → 99（新規 46。地域ごとに 3 種類以上の environment、public 4 + hidden 1 程度）
- expedition 4 → 13、buyer 3 → 12、contact reward 12 → 30（rumor 15 / discover 35）
- wild spot は外道込み 4 species 以上・1 種支配 75% 未満を検査
  （`simulate:world-expansion` を新設し `npm run check` へ追加）
- scientificName 重複は report（既知の 1 組のみ。ID 統合は future dedicated canonical-ID migration）
- boot: initial 541.83 kB / boot 644.70 kB（gzip 187.21 kB、Phase 14 比 raw -30% / gzip -13.5%）。
  catalog が Species 数に比例するため analyzer は比率ではなく 200 kB 予算 + 内訳レポートに変更
- tests 92 files / 802、validate:content 1053 records


## Phase 16 Part 2（World Expansion I — depth / progression / world UX）

- species 144 → **212**（+68。Part 2 は bycatch / 地域性の追加に限定し、既存 Species の再利用も実施）
- spot 99 → **140**（+41。各 Phase 16 Region が 9〜10 Spot、hidden 2〜4）
- buyer 12 → **24**、contact reward 30 → **66**
  （Region ごとに 3 段階チェーン × 2 本。閾値は Region ごとに変更）
- 既存 Region の薄い Spot に外道を追加（Queensland 2 か所）／残りは warning レポート
- `simulate:world-expansion` に trust balance / expedition economy / region diversity を追加
- MAP の Region 選択を「国 → 地域」の折りたたみセレクタへ（14 Region で横帯にしない）
- 新規の scientificName 重複は禁止（既知の giant-queenfish/queenfish は warning のまま）
- tests 93 files / 813、validate:content 1278 records、boot gzip 191.74 kB
- 残: Region occurrence target のうち 5 国際 Region（Amazon/Baja/NZ/Norway/Okinawa/Thailand）が
  まだ下限未満（Part 2b 候補）。legacy Spot の外道も一部未対応（warning で可視化）


## Phase 16 Part 2b（Final World Hardening）

Phase 16 Part 2 の仕上げ。新規 Region / 新規システムは追加しない。
Save v9 / Phase 15 の lazy loading / Domain rule（FishingEngine / Trade / Access）は不変。

- **南半球の季節を修正。** Environment は暦月だけで季節を決めていたため、
  New Zealand / Queensland の季節が北半球と同じになっていた。
  `ClimateProfile.hemisphere`（`north` / `south`）を追加し、
  `seasonOf(month, hemisphere)` / `seasonalFactor(month, hemisphere)` が
  半球で位相を反転する（南半球のピークは 2 月、底は 8 月。1 月 = summer）。
  Region ID 分岐は書かず `climate.hemisphere` だけを見る。既定は `north` なので
  既存 Region / Save schema はそのまま
- **熱帯気候の sanity test。** Queensland / Okinawa / Thailand / Amazon は
  `annualMeanWaterC` 24℃以上・年間の水温振れが温帯より小さいことを
  `tests/content/climateHemisphere.test.ts` が検査する（値は PROVISIONAL tuning）
- **Occurrence depth を底上げ。** 外道になり得る canonical Species を追加・再利用し、
  Amazon 22→29 / Baja 18→21 / NZ 20→24 / Norway 23→25 / Okinawa 28→30 /
  Thailand 26→27。数字合わせだけの追加はしない
- legacy Spot（Tokyo / Hokkaido / Alaska / BC）の 2〜3 species を audit し、
  自然なものへ共通外道を追加。wild Spot は 4 species 以上・1 種 75% 未満を
  `simulate:world-expansion` が検査する。残る warning は既知の scientificName 重複のみ
- **ExpeditionScreen を 国内 / 海外 でグループ化**（既存 `Country.domestic` を使用）。
  mount 時に destination pack を読まない性質は不変
- 最終 scale contract を test で固定（14 region / 200〜230 species / 130〜150 spot /
  20〜28 buyer）。giant-queenfish / queenfish の重複は warning のまま
  （統合は future dedicated canonical-ID migration。Phase 17 = Boat/Offshore とは別）
- lazy-load を behavioral test で確認（Tokyo boot = world + tokyo region + tokyo species、
  Izu 選択は Izu のみ、Amazon は idle、地域外の Spot へ直接 travel 不可、
  未発見 Hidden Spot は MAP markup に出ない）
- boot: Initial 572.15 kB（gzip 161.21）/ Tokyo boot 686.33 kB（gzip 195.76、予算 200 kB）
- tests 95 files / 834、validate:content 1312 records
- 未検証: 実ブラウザ / 実機での mobile viewport 目視（この環境ではブラウザ起動不可）。
  375 / 390 / 430 は DOM / CSS の静的チェックのみ


## Phase 17（Boat & Offshore Expansion）

Phase 16 の世界（新規 Region 追加なし）に「沖」「水深」を足した。
実装は `docs/ARCHITECTURE.md` §16、決定事項は `docs/DECISIONS.md` "Phase 17" 参照。

- **17A**: `src/domain/depth/` を新設（FishingPlatform / DepthCapability /
  resolveDeployment / SeaState / MarineReadiness / fightDistance）。既存
  Casting は無変更。zone の形（`castDistanceM` の有無）で cast 系 / depth 系を
  振り分ける
- **17B**: Method に `presentation`（cast/vertical/drift/troll、任意・後方互換）
  を追加し、5 新規 Method（オフショアキャスティング / バーチカルジギング /
  タイラバ / 泳がせ / トローリング）+ 対応タックルを投入。Fish Finder を
  `detectionDepthM`/`accuracy` ベースの sonar 表現に書き換え、Reposition
  （transient、Save 変更なし）を追加
- **17C**: 汎用 `ContactDefinition`（captain/guide/local_fisher/rental_staff、
  Buyer と同じ `ContactId` 空間）を Phase 15 pack pipeline に full 統合。
  `Transport.operatorContactId`（任意）+ `applyCharterTripOutcome`
  （ボウズでも Base Trust）で Charter 完了時の Captain Trust 加算を実装。
  休眠していた `AccessRequirement.kind: 'relationship'` を実装
- **17D**: Fish Finder 3 段階（basic/mid/advanced）、新規 offshore Spot 2 件
  （Izu / Norway — 両地域とも従来 hidden offshore しか無かった）、新規
  Hidden Offshore Spot 5 件（Tokyo/Izu/Norway/Hokkaido/Alaska、discover と
  access の Trust しきい値を分離）、新規 Captain Contact 4 件 + region-specific
  charter-boat Transport 4 件。新規 Species は 0（既存 229 のまま）
- **17E**: `scripts/simulate-offshore.ts`（`npm run simulate:offshore`、check に
  組み込み）を新設。Depth / Sonar / Marine Readiness / 5 Method 再生可能性 /
  岸釣り回帰 / Offshore Core Loop / Captain Loop / Skunk Loop / Boat Economy を
  実 Content で検証。Playwright（Chromium、この環境で起動可能）で
  HOME→MAP→Sagami 沖→SPOT→FISHING→CONTACTS の一本通しを 390px で目視、
  HOME→MAP は 375/390/430px で console error 0 件を確認
- Save は **v9 のまま**。Charter Trust は既存 `TradeState.contactTrust` を再利用、
  Contact の既知判定は Hidden Spot discovery と同じ派生方式
- tests 890 / boot gzip 181.5 kB（予算 200 kB）
- 残（Phase 17 の範囲外、将来）: giant-queenfish/queenfish の canonical ID 統合、
  Phase 18（Big Game 本格改修）、Trolling 専用ブランド商品の追加（現状は既存
  minnow ルアーを流用しており機能はしている）
