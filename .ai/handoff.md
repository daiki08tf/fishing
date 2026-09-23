# Handoff

最終更新: Phase 17（Boat & Offshore Expansion, 17A〜17E）完了
（branch `phase-17-boat-offshore`、PR #19・未マージ。main へはまだ入っていない）

> 現在状態は Phase 17 → 16 → 15 → 14 → 13 → 12 → 11 → 10.2 → 10.1 → 10 の順で優先する。
> 詳細は `.ai/current-task.md` と `docs/DECISIONS.md` も参照。

## Phase 17（Boat & Offshore Expansion, 17A〜17E）

Phase 16 の main HEAD（`12bb84f364bdebf886aae4ce8332971b892bc6fe`）から分岐。
新規 Region は追加せず、「沖」「水深」を既存 14 Region の上に足した。
1 ブランチ・1 PR のまま、5 つの内部 sub-phase ごとに commit + `npm run check` green。

- **17A（`23bd09c`）**: `src/domain/depth/`（FishingPlatform /
  DepthCapability / resolveDeployment / SeaState / MarineReadiness /
  fightDistance）。既存 `src/domain/casting/` は無変更、zone の形
  （`castDistanceM` の有無）だけで分岐
- **17B（`62ca8a4`）**: Method `presentation`（任意・後方互換）+ 5 新規 Method
  （offshore_casting / vertical_jigging / tai_rubber / live_bait_drift /
  trolling）。Fish Finder を `detectionDepthM`/`accuracy` ベースへ書き換え。
  Reposition（transient、15〜30 分消費、Save 変更なし）
- **17C（`4fc2fed`）**: 汎用 `ContactDefinition`（Buyer と同じ `ContactId`
  空間）を Phase 15 pack pipeline に full 統合。`Transport.operatorContactId` +
  `applyCharterTripOutcome`（ボウズでも Base Trust）。休眠していた
  `AccessRequirement.kind: 'relationship'` を実装（既存 Content は未使用だった
  ため安全）。small-owned-boat / charter-boat（Tokyo, captain-taro）を追加
- **17D（`b571b5f`）**: Fish Finder 3 段階（basic/mid/advanced）。新規
  non-hidden offshore Spot 2 件（Izu / Norway — 従来 hidden offshore しか
  無かった地域の穴埋め）。新規 Hidden Offshore Spot 5 件（discover の Trust <
  access の relationship Trust、という 2 段階）。新規 Captain 4 件
  （Izu=紹介制, Norway=紹介制, Hokkaido=initiallyKnown, Alaska=initiallyKnown
  — Buyer が無い地域は紹介チェーンを使えないため）+ region-specific
  charter-boat Transport 4 件。新規 Species 0
- **17E**: `scripts/simulate-offshore.ts`（`npm run simulate:offshore`、
  `npm run check` 組み込み済み）。Depth simulation（light/medium/heavy jig ×
  drift）、Sonar simulation（basic/mid/advanced finder）、Marine Readiness、
  5 Method の再生可能性（offering 適合・Platform 互換・実 FishingEngine 走行）、
  岸釣り回帰、Offshore Core Loop、Captain Loop（紹介→charter→Trust→discover→
  access の分離を実証）、Skunk Loop、Boat Economy。Playwright（Chromium、
  この環境で起動可）で HOME→MAP→Sagami 沖 charter→SPOT（乗船/水深/海況/流れ・
  Search Water・Reposition）→FISHING（狙う水深パネル）→CONTACTS（未紹介
  Captain の非表示）を 390px で目視、console error 0 件
- **Save は v9 のまま**。新しい永続 state は最後まで 1 つも増えていない
  （Charter Trust = 既存 `contactTrust`、Contact 既知判定 = 既存の派生パターン）
- tests 890（17E で +いくつか、`simulate:offshore` は別枠）/ boot gzip 181.5 kB
  （予算 200 kB、Phase 16 baseline 181.06 kB からほぼ横ばい）
- 次にやるとしたら（Phase 17 の範囲外）: giant-queenfish/queenfish の
  canonical ID 統合、Phase 18（Big Game 本格改修 — GT/大型カジキ級の長時間
  ファイト）、Trolling 専用ブランド商品（現状は既存 minnow ルアーを流用して
  おり機能上は問題ない）、より多くの Region への Captain/Guide 追加
  （Queensland / Okinawa / BC など、Buyer が既にいる地域から）
- **PR #19 は意図的に未マージ**。ミッション仕様の指示により、レビューのため
  main へは統合しない

## Phase 16 Part 2b（Final World Hardening）

- 南半球の季節を修正。`ClimateProfile.hemisphere`（north / south）を追加し、
  `seasonOf` / `seasonalFactor` が半球で位相反転（NZ / Queensland = south、既定 north）。
  Region ID 分岐なし。Save schema 不変
- 熱帯 sanity test（Queensland / Okinawa / Thailand / Amazon は年較差が小さく、
  通年 18℃以上、年平均 24℃以上）。`tests/content/climateHemisphere.test.ts`
- occurrence depth: Amazon 22→29 / Baja 18→21 / NZ 20→24 / Norway 23→25 /
  Okinawa 28→30 / Thailand 26→27。legacy Spot の外道も追加し、
  残 warning は既知の scientificName 重複のみ
- ExpeditionScreen を 国内 / 海外 でグループ化（`Country.domestic`）。mount 時の
  destination pack load は 0 のまま
- lazy-load / 地域外 travel 不可 / 未発見 Hidden Spot 非表示を behavioral test で固定
- tests 95 files / 834、validate:content 1312 records
- Initial 572.15 kB / Tokyo boot 686.33 kB（gzip 161.21 / 195.76、予算 200 kB）
- 未検証: 実ブラウザ / 実機での 375 / 390 / 430 目視（環境がブラウザ起動不可）。静的チェックのみ
- 残: giant-queenfish / queenfish の統合は future dedicated canonical-ID migration

## Phase 16 Part 2（depth / progression / world UX）

- species 144 → 212 / spot 99 → 140 / buyer 12 → 24 / reward 30 → 66
- Region ごとに 3 段階の Trust チェーン（intel → intel → discover_spot、閾値は地域別）
- `simulate:world-expansion`: trust balance（1 回で全解禁しない / 5〜15 回で discovery）、
  expedition cost curve（国内 < 国際、Izu 最安、Amazon 最高、自由資金 6 か月以内）、
  region occurrence diversity（目標下限比）を追加
- MAP の Region 選択を「国 → 地域」の折りたたみセレクタへ
- 既存 Region の薄い Spot に外道を一部追加（残りは warning）
- tests 93 files / 813、validate:content 1278 records、Initial 565.98 kB / boot 674.25 kB（gzip 191.74）
- 残課題（Part 2b）: 5〜6 国際 Region の occurrence diversity 下限、
  legacy Spot の外道、giant-queenfish/queenfish の ID 統合（専用 migration Phase）

## Phase 16（World Expansion I — Part 1）

- 14 playable region / 144 species / 99 spot / 13 expedition / 12 buyer / 30 reward
- 新規 Species 62（canonical global ID。既存 Species は distribution を拡張して再利用）
- 新規 Spot 46（地域ごとに 3+ environment、public 4 + hidden 1 程度、外道込み 4+ species）
- 各地域に Buyer + rumor(Trust15) + discover_spot(Trust35) の Hidden Spot を用意
- `simulate:world-expansion` を追加（spot 構成 / hidden discovery / region 配線 /
  species identity / scientificName 重複レポート）し `npm run check` へ組み込み
- boot: initial 541.83 kB / boot 644.70 kB（gzip 187.21）。analyzer は 200 kB 予算 + 内訳
- tests 92 files / 802、validate:content 1053 records
- Part 2 候補: Species +60〜90 / Spot +30〜50（目標 200〜230 / 130〜150）、
  giant-queenfish と queenfish の ID 統合、既存 Spot の外道拡充

## Phase 15.2（Startup Network Final Hardening）

- AppShell の tackle background preload を削除（起動で読むのは `bootContentFor` =
  world + 今いる地域 + その地域の Species shard だけ）
- tackle は Tackle / Shop / Spot / Fishing の gate で必要時に 1 度だけ読む。
  HOME は neutral fallback（Domain rule 不変）
- 起動 network は behavioral test（instrumented importer の呼び出し回数）で保証
- boot raw 604.93 kB / boot gzip 170.62 kB（Phase 14 比 -21.2%）/
  initial 511.99 kB / tackle 201.31 kB（gzip 32.05、boot 非含有）
- tests 91 files / 791

## Phase 15.1（True Lazy Loading）

- 起動 critical path は catalog + world + 今いる地域 + その地域の Species shard だけ
  （`bootPackKeys`）。Tackle は background preload、他地域・全 Species は起動で読まない
- Species detail は Region shard（tokyo-area 38 / hokkaido 13 / alaska 10 / bc 20 / qld 16）
- Fish Box / Trade は保存 Species ID から必要 shard を追加 load（Save に pack 情報なし）
- Expedition は mount で何も読まず、目的地 focus / 出発時にその地域だけ preload
- Codex の名前検索は捕獲済み限定（未捕獲の存在を漏らさない）
- 二次画面 9 つを dynamic import 化（HOME/MAP/SPOT/FISHING は eager）
- boot raw 925.44 → 604.95 kB / boot gzip 216.48 → 170.67 kB（-21.2%）
- tests: 91 files / 787

## Phase 15（Content Scale Foundation）

1000+ Species / 多数 Region に耐える Content Architecture。ゲームルールの追加は無い
（Domain / FishingEngine / Trade / Trust / Hidden Spot / Save v9 は不変）。

- **軽量カタログ**: `src/content/generated/content-index.json`（species / region summary
  + pack manifest）。Codex の一覧・検索・フィルタは summary だけで完結する
- **Content Pack**: 5 region pack（tokyo-area / hokkaido / alaska / british-columbia /
  queensland）+ 3 global pack（species-detail / tackle / world）。
  実体は生成物 `src/content/generated/packs/*.ts`（JSON を静的 import。
  pack 1 つ = dynamic import 1 つ = chunk 1 つ）
- **runtime**（`src/content/runtime/contentRuntime.ts`）: idle / loading / ready / error、
  同時要求の Promise 共有、session cache、失敗 pack だけ retry。Save には保存しない。
  Domain は Promise / dynamic import を知らない
- **UI**: AppShell が初期 pack（catalog + 今いる地域 + species-detail + tackle + world）を
  gate し、「地域情報を読み込み中…」+ retry を出す。Map は表示地域、Expedition は
  遠征先 pack を必要時に読み込む（遠征画面を開くと候補を事前読み込み）
- **Codex**: SpeciesSummary + 名前検索（日本語 / 英語 / scientificName / id）+
  捕獲 / 地域 / 水域フィルタ + 60 件ずつの段階表示
- **validation**: `validate:content` に Content Scale 検査を追加
  （pack manifest ↔ pack module、所有権の重複 / orphan なし、
  全 Species の summary、全 playable Region の pack、地域 prefix 付き Species ID の禁止、
  生成物の freshness）
- **scripts**: `npm run content:index` / `simulate:content-scale` / `analyze:content-scale`
  （後ろ 2 つは `npm run check` に追加）
- **bundle**: initial JS 925.44 kB → **536.35 kB**（gzip 216.48 → 157.43）。
  total JS は 906.10 kB（重複なし）。Content 本体は初期 chunk に入らない
- **PWA**: update strategy は不変。offline 時に JS chunk 要求へ index.html を返さない
  ようフォールバックを navigation に限定
- tests: 90 files / 778（+4 files / +30 tests）

## Phase 14.1（iPhone UI Polish）

Phase 14 の iPhone 実機相当レビューで見つかった UI 問題を同じ branch / PR で修正した。
Domain / Save schema は変更していない（UI の条件分岐と CSS のみ）。

- **Catch Result を最優先** — `src/ui/fishing/ResultView.tsx` を LANDED の
  DOM 最上位に置く（header → 釣れた！ → 魚 / サイズ / NEW バッジ →
  Keep / Release → XP）。CSS の position で持ち上げない。判定は
  `src/ui/fishing/resultFlow.ts`（`isFishingFinished` / `isFightUiVisible` /
  `isResultFirstPhase`）に集約
- **終了後のファイト UI を出さない** — LANDED / HOOK_MISSED / HOOK_ESCAPE /
  LINE_BREAK では Fish stamina / Tension / Hook hold / Distance / Drag /
  行動ログ / ファイトコマンド / AUTO / 狙う場所を描画しない
- **画面遷移の scroll reset** — `src/ui/nav/scrollReset.ts` を AppShell で 1 回だけ
  install。top-level screen が変わったときだけ `scrollTo(0, 0)`（釣り中の phase
  遷移では発火しない）。各画面では呼ばない
- **MAP を地図ボード化** — `src/ui/map/spotPlacement.ts` が `environment` から
  「上流・湖 / 川・運河・河口 / 海・磯 / 沖」の帯へ決定的に配置（Spot ID 分岐なし・
  Content 順に依存しない）。ノード選択 → 直下に summary → 詳細カード一覧。
  未発見 Hidden Spot はノードも詳細も出さない（Phase 13 の規則は不変）
- **文章量の削減** — `src/ui/trade/buyerPresentation.ts` が pricingProfile /
  preferences から 1〜2 行の役割文と好みタグを作る。Content の長文 `description`
  （PROVISIONAL の注記を含む）は画面に出さない。HOME は家計の内訳を `<details>` へ、
  天気を CTA 直後へ
- **WaterScene** — 水面の泡と LANDED の水しぶき（CSS animation のみ）
- tests: 86 files / 748 tests（resultFlow 9 / scrollReset 5 / mapBoard 8 /
  gameFacingCopy 11 を追加）。bundle: JS 925.44 kB（gzip 216.48 kB）/
  CSS 26.44 kB（gzip 5.20 kB）
- 実ブラウザ検証は sandbox 制約で不可（Chrome headless が起動しない）。
  jsdom + React DOM の実イベントで HOME → MAP → SPOT → FISHING → LANDED →
  Keep → Fish Box → TRADE → CONTACTS → CODEX を通しで確認済み。
  375/390/430px の実測レイアウトとスクリーンショットは未取得

## Phase 14（Retro Management-Sim UI / Visual Identity Redesign）

- branch: `phase-14-retro-ui-redesign`（base: main、Phase 13 / 13.1 は main に
  merge 済みの前提）
- PR: "Phase 14: retro fishing UI redesign"（作成予定・未マージ）
- **UI 層だけの再スキン。Domain / State のゲームルールは 1 行も変更していない**
  （FishingEngine / Text Battle / Casting Zone / Catchability / Save v9 /
  Fish Box / Trade / Trust / Contacts / Hidden Spot / Discovery・Access 分離 /
  Transport / Expedition / Economy / Codex / Knowledge / Regional Content は
  すべて Phase 13.1 のまま）。変更したのは `src/ui/` と `src/app/main.tsx` の
  import 1 行のみ
- 目標比率: モダンなモバイル操作性 70% / レトロゲーム感 30%
- **Design tokens** — `src/ui/styles/tokens.css`（新規）に色・spacing・radius・
  border・shadow・typography・z-index・motion duration を集約。既存 CSS が
  すべて同じ `--color-*` 変数名を参照していたため、`global.css` の旧色定義を
  ここへ一本化するだけで Phase 14 で未着手の画面（Shop/Tackle/Expedition/
  Progression）にも新配色が自動的に伝播した
- **新規共通コンポーネント** — `PixelIcon`（13 種の手書き inline SVG）、
  `FishSilhouette`（魚種 ID からの決定論的シルエット。画像アセット不要）、
  `BiomeScene`（`Spot.environment` ベース。Region ID 巨大 switch は作らない）、
  `StatMeter`、`EmptyState`、`ResultBanner`（LANDED 結果カード）、
  `BottomNav`（下部固定 5 タブ: ホーム/マップ/魚かご/図鑑/メニュー）
- **`<details>`/`<summary>` で折りたたみと exact-text テストを両立** —
  `renderToStaticMarkup` は `open` の有無に関わらず中身を静的 HTML に含めるため、
  視覚的な折りたたみと既存 UI smoke test（`mapScreenSmoke.test.ts` 等）の
  文字列アサーションを両立できた
- **MAP を最優先で再構成** — Region タブ + ノード風 Spot Card（Public/発見済み
  Hidden をアイコンで区別）。移動手段詳細は折りたたみ、「〜で行く」ボタンは
  常時表示
- **FISHING** — `WaterScene`（phase/behaviour から合成する CSS/SVG 水面。
  Domain のイベント名では分岐しない）を追加。LANDED では `ResultBanner` を
  独立表示し、重複する数値表ブロックは隠す（Polish で追加修正）。
  HIT 演出は `--motion-normal`（200ms、spec の 100〜300ms 目安内）
- **FISH BOX / TRADE / CONTACTS** — Fish Card / Buyer Card / Contact Card へ
  再構成。Buyer の短い好み文は既存 `description` フィールドをそのまま使う
  （魚種タグ→ラベルの新しい変換表は作らない）。Trade は選択中の魚に対して
  今いる地域の Buyer 全員分の査定比較を既存 `quoteSale` で表示
- **CODEX**（新規画面） — 82 種 Grid。未捕獲は「？？？」。仮想化は Phase 15 送り
- **既存 UI smoke test はすべて無変更で PASS**（`Local Izakaya` / `Fish
  Wholesaler` / `Market Broker` / `この地域に買取先が無い` / `今いる地域に
  買取先が無い` / `推定売却額: 最大` / Hidden Spot 非表示 / Rumor と Exact
  Discovery の区別、など）
- 新規テスト 5 files / 28 tests（BottomNav routing、Codex 捕獲済/未捕獲、
  Fish Box カードの折りたたみ、Fishing のコマンド可否と Domain
  `ALLOWED_COMMANDS` の突合、全 13 画面の render smoke）
- 最終 CI: typecheck / lint / format / validate:content /
  simulate:regional-content / simulate:trade-network / test / build 全 PASS
- `validate:content`: 843 records（Phase 13.1 から変更なし。Content には触れていない）
- tests: **82 files / 715 tests**（Phase 13 時点 77 files / 687 tests から
  +5 files / +28 tests）
- bundle: JS 916.60 kB（gzip 214.07 kB）/ CSS 22.04 kB（gzip 4.51 kB）
  （Phase 13 時点: JS 899.99 kB / gzip 209.18 kB、CSS 7.13 kB / gzip 1.86 kB。
  新しいライブラリは追加していない。増分は新規コンポーネント・CSS 分）
- Playwright + Chromium（`/opt/pw-browsers/chromium`、テスト実行後は
  devDependency として残していない）で実ブラウザの通し確認:
  HOME → MAP → SPOT → FISHING（CAST → HOOK → AUTO でファイト）→ HIT →
  LANDED（ResultBanner）→ Keep → 帰宅 → FISH BOX → TRADE（Buyer Card・
  査定比較）→ CONTACTS → CODEX まで PASS。375×812 / 390×844 / 430×932 の
  3 viewport で横スクロール無しを確認。Shop/Tackle/Expedition/Progression
  （未着手画面）も tokens.css のカスケードで新配色を継承していることを目視確認
- 既知のギャップ: Codex の仮想化未実装（82 種では実害なし、Phase 15 送り） /
  PWA manifest の theme-color は新 palette に未追従 / 自動スクリーンショット
  回帰は CI 未組み込み（今回は手動実行のみ）
- 次候補: Phase 15（Codex 仮想化・Region Pack・PWA テーマ追従）

## Phase 13（Fish Trade, Contacts & Hidden Spots）

- branch: `phase-13-fish-trade-contacts-hidden-spots`（base: main、Phase 12 は main に merge 済み）
- PR #15: "Phase 13: fish trade, contacts and hidden spots"（作成済み、MERGEはしていない）
- **Phase 13.1**: 独立レビューの指摘を同じ branch / 同じ PR 上で修正した。
  詳細は `docs/DECISIONS.md` の "Phase 13.1" と `.ai/current-task.md` を参照
- Core Loop: Catch → Keep/Release → Fish Box → 売却先を選ぶ → Cash + Trust →
  Rumor/Intel/Contact → Hidden Spot Discovery → 既存 Access 判定 → 新しい釣り
- `src/domain/trade/`（新規）: FishBox / Freshness / Buyer / SpeciesTradeProfile /
  ContactReward / TradeState / rewardClaim / tradeValue / sellCatches
- Content 追加: `buyers`（3）/ `species-trade-profiles`（82、全 Species 分）/
  `contact-rewards`（12）。`fishing-spots` に Hidden Spot 8 件（`visibility: hidden`）を追加
- FishingSpot に optional `visibility`（`public` | `hidden`）を追加。省略時 `public`
  なので既存 45 Spot の挙動は変わらない
- Hidden Spot の discovered 判定は新state を増やさず、既存 `world.discoveredSpotIds`
  を再利用（`discoverSpotFromContact` を worldSession.ts に追加）
- Buyer は Contact の一種として `ContactId` を共有。Trust 0〜100、取引単位で
  上限つき。ContactReward（intel / discover_spot / introduce_contact）は
  `minTrust` 到達で 1 度だけ claim（`claimedRewardIds` で判定）
- 価格計算は deterministic（RNG不使用）。Buyer の差は、(1) 個々の魚の
  condition/percentile/freshness への感度、(2) volume bonus、
  (3) **SpeciesTradeProfile.tradeTags × Buyer の preferredTags / neutralTags**、
  (4) 産地一致（`buyer.regionId === catch.sourceRegionId`）で表現する。
  魚種 ID を直接分岐する対応表は作らない（Phase 13.1）
- Save schema **v9**（`trade: TradeState`）。v1〜v8 いずれの旧 Save からも
  migration chain が v9 まで届くよう更新した
- Finance の `TRANSACTION_KINDS` に `trade` を追加。売却は既存 `earnCash` を使う
  （Finance state を二重化しない）
- UI: FISHING に Keep/Release ボタン、新規 FISH BOX / TRADE / CONTACTS 画面、
  MAP は Hidden Spot 未発見時は表示しない
- `simulate:trade-network`（新規）を `npm run check` に追加。
  Domain / Content の checks と、釣行ベースの trip simulation を実行する
- 全 Species の trade profile 完全性チェックは `validateContentReferences` ではなく、
  `validate:content` CLI（runtime ディレクトリだけを見る）と `simulate:trade-network`
  に置いた（fixture 検証用魚種と実 Content の species-trade-profiles が必ず
  食い違うため。Phase 10.1 の fixture 分離方針を踏襲）
- Phase 13 の新規 Buyer 単価・Trust チューニング・Hidden Spot の地形/アクセス値は
  すべて **PROVISIONAL**。Hidden Spot は fictional / generalized（実在の秘密の
  釣り場の座標を収集していない）
- 最終 CI: typecheck / lint / format / validate / regional audit /
  trade network / test / build 全 PASS
- `validate:content`: 843 records
- tests: 77 files / 687 tests（Phase 12比 +6 files / +63 tests）
- bundle: JS 899.99 kB（gzip 209.18 kB）/ CSS 7.13 kB（gzip 1.86 kB）
- 画面の通し確認（jsdom + React DOM の実イベント。Chrome headless は sandbox の
  制約で起動できない）: HOME → MAP（未発見 Hidden Spot 非表示）→ 釣り場 → FISHING
  （CAST / HOOK / 巻く を実際にクリック）→ LANDED → Keep → HOME（Fish Box 1）→
  Fish Box → TRADE（買取先表示・プレビュー = 実額・売却）→ 追加釣行で Trust 15 以上 →
  CONTACTS → MAP（発見済み Hidden Spot が「発見済み」として出る）まで PASS
- 既知のギャップ: Fish Box 容量上限なし（意図的） /
  現在地域に Buyer がいないと売れない（= 遠征先では TRADE が空状態になる） /
  非 Buyer Contact（introduce_contact）は unlock 挙動が未実装で、Content は
  `validate:content` が禁止する / 実プレイテストによるバランス調整は未実施
- 次候補: Phase 14 Visual Redesign、または遠征先 Buyer の Content 追加

### Phase 13.1（レビュー修正）

- persistence coordinator の保存 payload に `trade` を追加し、変更検知にも
  `state.trade` を追加。維持されないと「Fish Box が消える / 売った魚が復活する」
  事故になる。実際の coordinator / repository を通る統合テストを追加
- `sellCatches` は `trade.fishBox` も同時に更新する（戻り値と trade が食い違うと
  Store 経由で二重売却できてしまう。レビューで実際に検出した）
- Buyer 地域の強制: `buyer.regionId !== world.currentRegionId` は
  `buyer_region_mismatch`。Domain / Store の両方で拒否。TRADE は現在地域の
  Buyer だけを表示し、いない場合は空状態
- `leaveForSpot` に Discovery guard を追加（`undiscovered`）。AccessEngine は
  physical access の専門のまま。Store は交通費を引く前に止める
- `quoteSale` を Domain に追加し、Trade プレビューと実売却を一本化。
  `sum(lines.valueYen) === totalValueYen`、volume bonus は tradable 確定後に計算、
  並び順に依存しない
- `actualTrustGain = nextTrust - currentTrust` を返す（Trust 100 で +0）
- MAP の表示を「訪問済み」→「発見済み」に修正。HOME の Spot 件数は Map と同じ
  visibility / discovery 規則で集計し、未発見 Hidden Spot を漏らさない
- `introduce_contact` は `validate:content` が Content 追加を拒否する
  （claim だけされて何も起きない silent no-op を防ぐ）
- trip simulation（120 trips × 6 attempts, seed 固定）: attempts/trip 6.00 /
  landed 2.60 / kept 2.60 / gross ¥6,613 / travel cost ¥3,924 / net mean ¥2,688 /
  median ¥533 / p90 ¥21,398 / max ¥81,403 / 月換算（中央値×8）¥4,264

## Phase 12（Regional World Expansion / Alpha Content）

- branch: `phase-12-regional-world-expansion`
- PR #13: Phase 12
- PR #12: stacked merge の結果 main に届かなかった Phase 10.2 + 11 を main へ統合する PR
- merge 順は **#12 → #13**
- runtime Content:
  - FishSpecies 82
  - FishingSpot 45
  - playable Region 5
  - explicit Fishing Zone 45 / 45
- British Columbia / Queensland を playable 化し、Expedition を追加
- Species ID は世界共通 canonical ID。地域 prefix を Species identity に使わない
- Save schema v8。v7 の Codex / fish Knowledge / repetition を canonical species ID へ migration
- Phase 12 の新規生態・分布・Spot・アクセス値はすべて PROVISIONAL
- `simulate:regional-content` を CI と `npm run check` に追加
- Phase 13 候補: Catch Economy（売却 / 持ち帰り / リリース）
- Visual Redesign は Content / Economy が安定した後の別 Phase
- 最終 CI: typecheck / lint / format / validate / regional audit / test / build 全 PASS
- `validate:content`: 738 records
- regional audit: species 82 / spots 45 / playableRegions 5 / explicitZones 45 — PASS
- tests: 71 files / 624 tests
- bundle: JS 845.44 kB（gzip 198.91 kB）/ CSS 7.13 kB（gzip 1.86 kB）
- Vite 500 kB warning は既知。Phase 12 blocker ではない

## Phase 11（Casting Distance & Fishing Zones）

- branch: `phase-11-casting-zones`
- base: `phase-10.2-bite-pacing`（PR #9 / #10 が未 merge のため stacked）
- PR #11 は Phase 11 の draft PR。merge 順は #9 → #10 → #11
- `src/domain/casting` を追加。Gear の実スペックを
  `comfortableDistanceM / maxDistanceM / precision` へ解決する
- Spot に optional `fishingZones`、FishOccurrence に optional `zoneAffinity`
- Zone 未設定 Spot は fallback Zone を使うため、既存 Content は壊さない
- UI は Zone 名を選ぶ方式。キャスト power の目押し / タップゲームは作らない
- marginal cast は狙いより手前へ落ちることがある。実着水 Zone が Encounter に効く
- 遠投そのものには Bite bonus を与えない
- FishingEngine へは `initialFightDistanceM` だけを渡し、Zone / Gear ID を持ち込まない
- 実着水距離は battle 開始距離へ圧縮して反映する
- Save schema は v7 のまま
- 初期 Zone Content 6 Spot はすべて PROVISIONAL
- Phase 12 はこの基盤上で日本 / 世界 / 魚種を拡張する
- 最終 CI: typecheck / lint / format / validate / test / build 全 PASS
- Content: 657 records、tests: 71 files / 623 tests
- production bundle: JS 761.71 kB（gzip 189.59 kB）、CSS 7.13 kB（gzip 1.86 kB）
  （Vite の 500 kB warning は既知。Phase 11 の blocker ではない）

## Phase 10.2（Bite Pacing）

- Bite 確率を線形から `1 - exp(-pressure)` の飽和カーブへ変更
- 普通の魚で「投げればほぼ必ず食う」を減らしつつ、好条件は引き続き有利
- Fight tuning / Catchability の soft/hard gate 原則は変更しない

## Phase 10.1（Playtest Cleanup）

実機プレイで見つかった「開発・検証用の残り」を消した。新機能は追加していない。

### 何が漏れていたか

- **runtime Content に検証用の合成魚が入っていた**
  （`src/content/data/fish-species/phase1-sample-fish` / `phase2-sample-fish-*` の 10 件）。
  東京近郊の釣り場の `fishTable` がこれを参照していたため、
  最初に釣れる魚も Codex も結果表示も「サンプル魚E（検証用）」になっていた
- Fishing 画面に `tick XX / この状態 XX` / `seed: ...` / `RAWSTATE`（IDLE / FIGHTING など）が出ていた
- 釣り上げた直後に画面が「待機」に戻り、直近の釣果と「この魚種の記録はまだない」が
  並んで見えていた（釣果記録の副作用で Engine が作り直されていた）

### 直したこと

- runtime Content を実在の魚名に置き換えた（東京近郊 13 / 北海道 3 / アラスカ 10 = 26 件）。
  数値プロファイルは移設した検証用魚から引き継ぎ、**ゲームバランスは変えていない**
  （`simulate:big-game` / `text-battle` / `catchability` / `environment` は同じ結果）
- 検証用の合成魚（サンプル魚 A〜J）は `tests/fixtures/content/fish-species/` へ移動し、
  test / simulation だけが `tests/fixtures/content.ts` の `loadFixtureContent()` で読む。
  runtime の Spot からは参照できない（Spot は常に `src/content/data` を見る）
- 通常プレイの画面から seed / tick / 内部 state 名 / phase code を削除した
- 釣行中の Engine は、釣果記録の副作用（世界時間 → Environment、成長 → 倍率）で
  作り直さない。セッション開始時の入力で固定する（`sessionInputsRef`）
- 結果表示を「直近の釣果」と「〈魚種名〉の記録」に分け、矛盾しないようにした
- 古い Save に今の Content に無い魚種 id が残っていても落ちない
  （記録数は今の Content にある魚種だけを数える。Save は書き換えない）
- 開発ビルドの HOME に「セーブデータを初期化」を追加（`import.meta.env.DEV` のときだけ表示）

### 検証状況（phase-10.1-playtest-cleanup 時点）

- `npm run check`: PASS（70 test files / 617 tests）
- `npm run validate:content`: PASS（657 records = 653 − 10 + 14）
- simulations: text-battle 10/10、catchability 14/14、environment 8/8、big-game 9/9、
  expedition 12/12、transport 18/18、tackle 11/11、catalog 9/9、day 9/9、trip 6/6、
  progression 9/9、sample:individuals invalid=0
- `simulate:fishing --seed demo`: LANDED（44 ticks / 48 steps、釣れる魚は「マアジ」）
- bundle: JS 751.26 kB（gzip 186.43 kB）、CSS 7.13 kB（gzip 1.86 kB）
- 新規 Save で HOME → MAP → 釣り場 → CAST → アワセ → Text Battle → 取り込み → 記録 を
  jsdom + React DOM の実イベントで確認（内部情報が画面に出ないこと、
  最初の 1 匹が `kanto-*` の魚であることを確認）
- 古い Save 相当（codex に `phase2-sample-fish-e` が残る状態）で HOME が落ちず、
  「記録した魚種 0 種」と表示することを確認
- 実ブラウザ（Chrome headless）は sandbox 制約で起動できないため未実施

### Save / reset

- Save schema は v7 のまま（battle も Content の入れ替えも Save 形式を変えない）
- 古い Save の魚種 id は消さない（読み飛ばすだけ）。プレイテストで最初から遊ぶときは
  開発ビルドの HOME →「セーブデータを初期化」を使う。
  手動の場合はブラウザのサイトデータ（IndexedDB）を削除する

## Phase 10（Text Fishing Battle）

Hooked 以降を「文章で魚の行動を読み、コマンドを選ぶ」ターン制バトルへ進めた。
Encounter → Bite → Hook（Phase 9.1）は変更していない。

- **Fishing combat is decision-driven, not button-spam driven.**
- 1 コマンド = 1 意味のある battle step。FIGHTING / LANDING は tick では進まない
  （連打しても有利にならない）
- 魚の行動は 8 種の generic behaviour。魚種名・国では分岐せず、
  fightProfile / Trait / 個体サイズから解決した数値だけで決まる
- 行動は文章の予兆（telegraph）を挟んでから発動する。Knowledge が高いと予兆が具体的になる
- コマンドは固定ダメージボタンではない。RUN 中の POWER_REEL は危険、REST は巻き取り好機、
  COME_TOWARD は巻くほど良い、HEAD_SHAKE は保持を削る
- 高テンション（LINE_BREAK）と slack（HOOK_ESCAPE）の両方を危険にした。
  Always Reel / Always Power / Always Give のどれも最適解にならない
- タックルは「失敗の余地」を変える（Light でも大型魚は獲れるが break が増える）
- 小魚 1〜3 コマンド / 中型 数コマンド / 大型・記録級 15〜30+
- Domain は BattleEvent / behaviour / numeric result を返し、文章は presentation
- UI: FISHING に text battle panel（行動・距離・ドラッグ・フック保持・ログ・AUTO）
- `npm run simulate:text-battle` を追加（4 scenario × 4 strategy、10 checks）

検証状況（phase-10-text-fishing-battle 時点）:

- `npm run check`: PASS（70 test files / 617 tests、typecheck / lint / format / validate / build）
- `npm run validate:content`: PASS（653 records）
- simulations: text-battle 10/10、catchability 14/14、environment 8/8、big-game 9/9、
  expedition 12/12、transport 18/18、tackle 11/11、catalog 9/9、day 9/9、trip 6/6、
  progression 9/9、`simulate:fishing --seed demo` LANDED（44 ticks / 48 steps）、
  `sample:individuals` invalid=0
- `simulate:fishing --seed demo` の 182 ticks は、tick 駆動のファイトを
  コマンド駆動の battle に置き換えたため変化した（battle の主指標は step 数）
- bundle: JS 745.81 kB（gzip 185.50 kB）、CSS 7.04 kB（gzip 1.86 kB）
- Save schema: v7 のまま（battle は釣行中の一時状態なので保存しない）

UI の通し確認（この sandbox では Chrome headless が起動できないため jsdom + React DOM）:

- CAST → WAITING → BITE → HOOK → FIGHTING → コマンド（数 step）→ LANDING → LAND → LANDED
  （Codex に記録される）
- GIVE 連打 → HOOK_ESCAPE、POWER_REEL 連打 → LINE_BREAK、AUTO で決着
- 確認手順: `npm i --no-save --cache <cache-dir> jsdom` の上で
  `npx vitest run --environment jsdom <一時テスト>`（テストは commit しない）
- この確認で「コマンドで取り込んだ釣果が Codex に入らない」バグを見つけて修正した

## STABLE CHECKPOINT — Phase 9

Phase 0〜9 を stable checkpoint として main へ統合する（integration branch）。

- World / Japan / Alaska expedition
- Transport / physical access
- Economy / Shop
- Tackle
- Environment / weather / tide / water
- Fishing forecast
- Offshore / Fish Finder
- Big Game
- Save v7

最新の検証状況（integration/phase-9-stable 時点）:

- `npm run check`: PASS（68 test files / 589 tests、typecheck / lint / format / validate / build）
- `npm run validate:content`: PASS（653 records）
- simulations: environment 8/8、big-game 9/9、expedition 12/12、transport 18/18、
  tackle 11/11、catalog 9/9、day 9/9、trip 6/6、progression 9/9、
  `simulate:fishing --seed demo` LANDED（182 ticks）、`sample:individuals` invalid=0
- bundle: JS 724.72 kB（gzip 178.52 kB）、CSS 7.04 kB（gzip 1.86 kB）
- Save schema: v7（Environment は日付・地域から再生成できるため保存しない）

## Phase 9（Living Water & Big Game）

### Phase 9.1（Catchability / Bite Rules）

- **Catchability is soft by default. Physical impossibility is the only normal hard gate.**
- Rod / Reel / Line / Leader で魚種の eligibility を決めない（Bite / Fight の難しさにだけ効く）
- 釣法・offering の相性は soft（0.15〜1.8）。相性だけで 0 にしない
- ルアー / フックが魚に対して物理的に大きすぎる場合だけ Bite = 0
  （小さすぎは可能のまま。保持・掛かりが悪くなる）
- 物理サイズは実データ（lure.lengthMm / hookSizeRank / 魚の体長 + feedingProfile）で判定し、
  サイズデータが無い餌は neutral として扱う（長さを捏造しない）
- Engine へ渡すのは数値だけ（bite eligible / affinity / hook の掛かり・保持）
- `npm run simulate:catchability` を追加（代表ケース + broad audit）

- **Environment Domain** — `src/domain/environment`。WorldTime と地域の ClimateProfile
  から季節 / 時間帯 / 天候 / 潮 / 水温 / 濁り / 流れを決定論的に解決する。
  外部 API も Math.random も使わない。淡水は潮なし（null）
- **Fishing Conditions Resolver** — Environment + Spot + Species + 釣法 + 装備から
  resolved numerical modifiers（Encounter 重み / bite / 視認性 / テンション）を作る。
  FishingEngine は数値だけを受け取る（季節・天候・潮・国・魚種名を知らない）
- **Content** — `regions[].climate`（10 地域）と魚種の `environmentAffinity`（16 種）。
  条件が悪くても Encounter 重みは 0 にしない（下限 0.35）
- **Big Game** — 個体サイズから pull / endurance を解決。ライン / リーダー / ドラッグ /
  ロッドが耐えられるテンションに効き、フックサイズのミスマッチは掛かりと保持を落とす。
  Light / Balanced / Heavy の差が出る（Heavy が大型魚で安定、小型魚では万能ではない）
- **Fish Finder** — Gear カテゴリ `electronics`（1 種）+ Search Water。
  所持していれば反応が詳しい。持っていなくても釣れる。Save は v7 のまま
- **UI** — HOME の「今日の条件」、MAP の釣況、SPOT の条件 + Search Water、
  FISHING の条件 1 行
- 検証: `npm run check` PASS、`validate:content` 653 records、
  `simulate:environment` 8/8、`simulate:big-game` 9/9、既存 simulate 群 PASS
- 注意: `simulate:fishing --seed demo` は 174 → 181 ticks に変化した（意図的）。
  Phase 9 でライン / リーダー / ドラッグを break threshold へ接続し、
  個体サイズが引きに効くようになったため

## このプロジェクトは何か

**Fishing** — 現代日本を舞台にした、リアル志向の釣りハクスラゲーム。

東京近郊で働く普通の会社員としてスタートし、休日や仕事帰りに釣りへ出かける。
魚を釣り、経験・知識・資金・名声を得て、道具・車・船・人脈を増やしながら、
日本中の釣り場と魚へ到達していく。

成長は Level によるステージ解放ではない。
**「装備・Knowledge・Skill・Transport の成長によって、アクセスできる世界が広がる」**
ことを早期に検証するのが Phase 4〜7 の目的である。

設計の SSOT は `docs/` 以下。
Product Decision の SSOT は `docs/DECISIONS.md`。

## ブランチと状態

- Repository: Fishing Game
- Branch: `codex/phase-7a-transport`（base: `deepseek/9cd8b72b2f3f`）
- Workspace: current Git worktree
  （実際の作業ディレクトリは `git rev-parse --show-toplevel` で解決する）
- Phase 0A: `docs: establish product decisions and roadmap`
- Phase 0B: `chore: establish technical foundation for phase 0B`
- Phase 1: `feat: implement fishing vertical slice`
- Phase 2: `feat: formalize fish individuals and variety`
- Phase 3: Angler Progression + Codex 永続化の整合性修正
  （本変更。`git log --oneline` で確認する）
- Phase 3.1: Save / Load の配線（起動時 hydration と autosave）
- Phase 4: World / Time / Access / Spot Knowledge（自宅から釣りへ行って帰るループ）
- Phase 5: Economy / Calendar / Shop / Transport（給料・生活費・有給・中古車）
- Phase 6: Tackle Depth（Gear 7 カテゴリ・Loadout・互換性・Tackle Resolver・
  架空ブランド・Save v5）。前セッションの基盤 `feat: add economy and tackle foundation`
  を引き継いで完成させた
- Phase 6.5: Tackle Catalog Expansion（Content Master からの移植・Brand 12 /
  Series 88 / Gear 463・番手と用途のカバレッジ・差別化テスト・`simulate:catalog`）
- Phase 7A: Transport / Access Domain（capability access・Transport 11 件・Save v6・
  v5 car migration・`simulate:transport`）
- Phase 7A.1: 独立レビューの実害指摘の最小修正（motorcycle / rental car の route
  coverage・Access 失敗理由の正確さ・移動手段の選択 UI・費用内訳表示・
  `findUnusableTransports`。Save version は v6 のまま）
- Phase 8: Japan & International Expedition（World 階層・遠征・Alaska / 北海道・
  簡易 Permit・Save v7・`simulate:expedition`）

## Phase 8（Japan & International Expedition）

- **世界階層** — `countries` / `regions`（base と areas を持つ）Content を追加し、
  World → Country → Region → Area → Spot を表現する。`stage: planned` の地域定義だけを
  Canada / Norway / Australia / New Zealand / Brazil / Mexico / Thailand に置き、
  World model が Alaska 専用でないことを確認した
- **遠征** — `src/domain/expedition` に ExpeditionDefinition / ExpeditionPlan /
  ActiveExpedition / ExpeditionState を追加。`planExpedition` が航空券（往復）・宿泊・
  許可を合計し、WorldTime を進めて現地の拠点（Region.base）へ移る
- **国内 / 海外** — 北海道（domestic_flight）とアラスカ（international_flight）を
  同じ仕組みで扱う。違いは Content の費用・時間・宿泊・許可だけ
- **Alaska** — 拠点 Alaska Fishing Base、Spot 6 件、魚 10 種（Salmon 5 / Trout 2 /
  Char 2 / Halibut）。既存の FishIndividual / Trait / FightEngine をそのまま使う
- **現地の移動** — Phase 7A の Transport / Access を再利用（walk / rental car /
  rental boat）。国・地域による分岐は Engine に書かない
- **Permit** — 遠征予約に含めて `expedition.permits` に保存し、AccessEngine の
  `permit` 条件にだけ効かせる
- **Save v7** — `world.currentRegionId` と `expedition` を追加。v6 からは
  「home region を与え、遠征を空で作る」だけで移行する（他ブロックは保持）
- **UI** — EXPEDITION 画面（行き先・費用内訳・泊数・宿泊・開始）、遠征中の状況と帰国、
  MAP の地域タブ（今いない地域は釣行不可）、HOME の拠点 / 残り日数
- **Knowledge / Level** — 初訪問の地域で Region Knowledge +20（PROVISIONAL）。
  ボウズでも Knowledge が増える既存仕様は不変。Angler Level は地域の解禁条件ではない
- 最終検証: `npm run check` PASS（65 files / 574 tests）、`validate:content` 649 records、
  `simulate:transport` 18/18、`simulate:expedition` 12/12、bundle JS 702.06 kB
  （gzip 172.27 kB）/ CSS 7.04 kB（gzip 1.86 kB）
- 注意: この sandbox では Chrome headless が起動しないため、UI の通しは
  jsdom + React DOM のクリック操作（27/27 PASS）で確認した。実ブラウザでの目視は未実施

## Phase 7A.1（Transport / Access Domain の最小修正）

- **route coverage** — `standard-motorcycle` を upper lake の一般道 route に追加し、
  `rental-car`（`features: ["vehicle_rental"]`）を新しい PROVISIONAL Spot
  `suburban-road-lake` の一般道 route で使えるようにした。upper lake に rental を足すと
  Phase 5 の「車の購入前は行けない」証明が壊れるため、既存 Spot の意味は変えない
- **role 差** — motorcycle は rough road / water / offshore を持たず、rental car も
  SUV 相当の能力を持たない。rental car は営業所での受け渡しぶん所有車より遅い（0.62）
- **Access 失敗理由** — Transport 候補の解決段階を区別し、`missing_capability` /
  `no_compatible_transport` / `ownership_required` / `rental_unavailable` /
  `facility_required` を返す。手持ちの移動手段が提供している capability を
  「不足」と表示しない
- **選択 UI（Map）** — `ResolvedTravelOption` を列挙し、transport 名・所要時間・往復費・
  費用内訳（運賃 / 走行費 / レンタル料）を出す。既定は最も安い候補
  （4 分速いだけの SUV を黙って選ばない）。選択した `transportId` で `travelToSpot` を呼ぶ
- **Content 検証** — `findUnusableTransports` が「初期利用可能 / 購入可能なのに
  どの route でも使えない」Transport を検出する。future-only（入手手段が無い）は対象外
- 最終検証: `npm run check` PASS（62 files / 557 tests）、`validate:content` 607 records、
  `simulate:transport` 18 checks PASS、bundle JS 660.66 kB（gzip 165.01 kB）/
  CSS 6.86 kB（gzip 1.81 kB）

## Phase 7A（Transport / Access Domain）

- `TransportDefinition` は Content 駆動。ownership、購入 / rental cost、time modifier、
  range、cargo、terrain / access capability、launch / boat capability を持つ
- `PlayerTransportState` は World から独立し、利用可能 ID と所有 ID を保存する
- Spot は具体的な車種ではなく access capability を要求する
- AccessEngine は具体 ID / 名称で分岐せず、利用可能 Transport + Spot requirements +
  route から accessible / blocked reasons / resolved options を返す
- 既存 Used Compact Car は `used-compact-car` に移行。upper lake の 95 分・片道 ¥900・
  往復 ¥1,800 を維持
- Save v6 は v5 の `world.availableTransports` と購入履歴を ownership へ移し、他の
  Save block を保持する
- Bicycle / Motorcycle / Compact Car / SUV / Rental Car / Kayak / Rental Boat /
  Owned Boat と基礎の Walk / Train / Bus を追加
- Transport 検証用 Spot は 4 件（Phase 7A.1 で 1 件追加し 5 件）、すべて
  `dataStatus: provisional`
- `simulate:transport` は 10 scenario と 18 checks を PASS / FAIL 表示する
  （Phase 7A.1 で motorcycle / rental car を追加）
- Pre-flight は実ブラウザで Shop filter → purchase → owned → Tackle equip →
  compatibility → reload まで PASS
- FishingEngine、勤務 simulation、詳細車両 simulation は変更していない
- 最終検証: `npm run check` PASS（Phase 7A 時点は 58 files / 529 tests）、全指定
  regression PASS、`validate:content` 606 records（Phase 7A 時点）、
  bundle JS 655.69 kB（gzip 163.68 kB）/ CSS 6.09 kB（gzip 1.67 kB）

## Phase 6.5（Tackle Catalog Expansion）で実装したもの

Phase 6 の実装（Gear / Brand / Method / Catalog / Shop / Inventory / Loadout /
Compatibility / Tackle Resolver / FishingEngine integration）は作り直していない。
その上に Content の量と差別化を載せた。

### Content Master からの移植

GitHub の `content/master-draft` ブランチ（`docs/content/master-draft/*.csv`）を
**参照資料としてのみ**使った。作業 branch へは merge していない。
CSV を Runtime で読む構成にもしていない（Runtime は JSON の Content だけを読む）。

採用したもの:

| 元 | 採用のしかた |
|---|---|
| `brands.csv` | 12 ブランド。既存 10 の ID を維持し、説明・specialties・tagline を Master に合わせ、River Craft / Blue Horizon を追加 |
| `brand_series.csv` | `gear-series` Content として 53 件（`terminal` カテゴリは将来分なので除外） |
| `reels.csv` | 番手ごとにブランド・Series を散らして 142 件 |
| `rods.csv` | 用途カテゴリごとに長さを散らして 84 件 |
| `lines.csv` / `leaders.csv` | 強度を段階的に 34 / 22 件 |
| `hooks.csv` | HookType ごとにサイズを散らして 33 件 |
| `lures.csv` | LureType ごとに重量を散らして 117 件 |
| `baits.csv` | 全 12 件 |

採用しなかったもの:

- `fish_master.csv`（実在魚。Phase 7 以降に個別出典確認）
- `terminal_tackle_future.csv` / `landing_gear_future.csv` / `field_gear_future.csv`
  （将来 Phase。参照のみ）
- `Casting` / `ActionScore` / `FinesseAffinity` / `PowerAffinity`
  （ゲーム調整値。現実の製品仕様ではないので Content に入れない。
  相当する差は weight / length / depth / type などの現実属性で表現する）

移植時の変換:

- リールの 0〜100 の spec（Smoothness / Rigidity / WindingTorque / Response /
  DragStartup）は 0〜1 に正規化
- `lineCapacity` は `LineCapacityIndex` と番手から導出
- フックの `Size`（`#6` / `2/0`）は符号付き数値（`6` / `-2`）へ変換
- ルアーの `DepthRange` バケット（shallow-mid 等）は `depthRangeM` の数値域へ変換
- offering の相性タグは重量帯（small / mid / large / big）から導出

### 実装した構造

| 領域 | 内容 |
|---|---|
| Brand | 12 件。**性能倍率を持たない**（表示・整理の属性） |
| Product Family | `gear-series` Content と `gear.seriesId`。brand / category の一致を検証 |
| Reel | `dragStartup` / `rigidity` / `windingTorque` / `response` を spec に追加し、resolver で modifier に反映 |
| Rod | `power` に XH、`seriesCategory` に chinning を追加（用途 17 種） |
| Hook | `assist` / `jighead` を Hook subtype として追加。`gaugeMm` を追加。サイズは符号で 2 系統 |
| Lure | jerkbait / metal_vibration / egi / popper / stickbait を追加（14 種類） |
| Bait | bait type を 15 語彙へ拡張（FUTURE_CONSUMABLE。Phase 6.5 では無限使用） |
| Validation | id 重複・未知 Series・Series の brand/category 不一致・番手/variant の enum・負値・min>max |
| Shop UI | カテゴリ filter（件数付き）とブランド filter。Brand / Series / Model / spec / 所持 / 不足を表示 |
| Tackle UI | ブランド filter。Brand / Series / Model / spec / 互換性の理由を表示。判定は Domain を呼ぶ |
| 検証 | `npm run simulate:catalog`（件数・カバレッジ・3000 番比較・代表 Build・価格ラダー検査） |

### Phase 6.5 の主な設計判断

1. **差はブランド ID の分岐ではなく spec の結果** — ブランドに倍率を持たせない。
   同番手でも spec が違うため、resolved modifier と互換性に差が出る。
2. **ゲーム調整値を Content に入れない** — Master の Casting / ActionScore /
   affinity は `GearTuning` 側の概念なので移植しない（DATA_MODEL §13 の分離）。
3. **番手は Engine の分岐条件にしない** — テストで
   `src/domain/fishing` に番手やブランド名・Series 名が現れないことを機械検査する。
4. **Series は参照整合性だけ** — `series.name` と `gear.series` の一致も検証する。
   既存 Phase 6 の 16 アイテムには `legacy-<gearId>` の Series を与えて整合させた。
5. **フックのサイズ規約** — 正 = `#N`、負 = `N/0`。`hookSizeRank` で大小を比較する。
6. **リールの太糸判定を相対化** — 絶対 0.3mm だと大型番手で誤警告になるため、
   定格（巻ける最も強いライン）から見た相対に変えた。
7. **価格ラダー検査** — 比較グループ（番手・用途・ルアー種別）ごとに
   「最も高い商品が全 modifier で他を完全上位互換にしていないか」を検査する。
   現在は 8 グループすべてで完全上位は一部（0〜1 件）に留まる。

### Phase 6.5 の検証結果

- `npm run check`: PASS（typecheck / lint / format / validate:content / test / build）
- `npm run test:run`: **55 files / 515 tests PASS**（Phase 6 完了時は 54 files / 482 tests）
- `npm run validate:content`: PASS（**586 件** = 魚種 10 + 釣り場 8 + Gear 463 + Series 88 +
  Brand 12 + Method 4 + 商品 1）
- `npm run simulate:catalog`: 9 チェックすべて PASS
  - 件数: Reel 143 / Rod 88 / Line 37 / Leader 25 / Hook 39 / Lure 117 / Bait 14
  - 番手カバレッジ 13/13、用途カバレッジ 17/17
  - 3000 番: 11 モデル / 6 ブランド。滑らかさは Daiva、レスポンスは Shimara、
    剛性は Arvo Garsen が最上位（性格が分かれている）
  - 代表 Build 8 種（Starter / Ultra Finesse / Light Game / Balanced Seabass /
    Long Cast Surf / Power Shore Jigging / Offshore Power / Big Game）がすべて組める
  - 価格ラダー検査: 8 グループすべてで「完全上位」は 0〜1 件
- `npm run simulate:tackle`: 11 チェックすべて PASS
  （大型を 9.3 割まで攻める操作で Power 100% / Starter 15% / Finesse 12%）
- `npm run simulate:day` / `simulate:trip` / `simulate:progression` /
  `simulate:fishing --seed demo`（174 tick、Phase 4 から不変）/
  `sample:individuals --samples 10000`（invalid=0）: すべて変化なしで PASS
- バンドル: JS **638.49 kB（gzip 159.97 kB）**、CSS 6.09 kB（gzip 1.67 kB）。
  Phase 6 の 447 kB（gzip 133 kB）から増加（Content を eager で読むため）。
  Vite が 500 kB 超の警告を出す（コード分割は Phase 7 の候補）

コミットの位置は `git log --oneline` で確認する。
本文書にはマシン固有の絶対パスや作業ディレクトリの UUID を記録しない。

## 実装済みの範囲

| Phase | 内容 | ゲームプレイ |
|---|---|---|
| 0A | 設計文書の統合、`docs/DECISIONS.md` | なし |
| 0B | 技術基盤（ビルド・層の強制・RNG・Content 検証・Save・PWA・CI） | なし |
| 1 | Fishing Vertical Slice（状態機械・ファイト・魚の行動・釣り画面） | 釣り 1 種 |
| 2 | 個体生成（サイズ・体重・コンディション・Trait・百分位）と Codex | 釣り 10 種 + 個体差 |
| 3 | Angler Progression（XP・Lv1〜100・7 Skill・Perk・Save v2） | 成長ループ |
| 3.1 | Save / Load の配線（起動時 hydration・autosave・壊れた Save の扱い） | 再起動で成長と記録が残る |
| 4 | World（ゲーム内時間・移動・Spot・Access・Knowledge）と Map / Spot 画面 | 自宅から釣りへ行って帰る |
| 5 | Economy / Schedule / Shop（給料・生活費・有給・中古車購入） | 働きながら釣りに行く生活ループ |
| 6 | Tackle Depth（Gear 7 カテゴリ・Loadout・互換性・Tackle Resolver・架空ブランド） | 装備を組んで狙う |
| 6.5 | Tackle Catalog Expansion（Brand 12 / Series 88 / Gear 463・番手と用途のカバレッジ） | 装備を選んで悩む |

## Phase 6（Tackle Depth）で実装したもの

前セッション分の基盤は checkpoint commit `19ed43f`
（`feat: add economy and tackle foundation`）にあり、working tree は clean だった。
このセッションは**それを再利用**して残作業（配線・Save・UI・テスト）だけを実装した。
基盤の作り直しや別方式への差し替えはしていない。

| 領域 | 内容 |
|---|---|
| Gear（基盤） | `src/domain/gear/Gear.ts` — Rod / Reel / Line / Leader / Hook / Lure / Bait の型。`GearTuning.ts` にゲーム調整値を分離 |
| Brand | `src/domain/gear/Brand.ts` — 架空ブランド。**性能倍率を持たない**（表示・整理の属性） |
| Method | `src/domain/method/FishingMethod.ts` — lure / light_lure / bait / bottom |
| Loadout | `src/domain/tackle/Loadout.ts` — スロット・Starter gear・装備変更の検証（存在 / 所有 / カテゴリ） |
| Inventory | `src/domain/tackle/Inventory.ts` — `ownedGearIds` のみ（耐久・消費を扱わない） |
| Compatibility | `src/domain/tackle/compatibility.ts` — fatal / warning / suboptimal / good / excellent |
| Resolver | `src/domain/tackle/resolveTackle.ts` — `ResolvedFishingSetup` / `EncounterProfile` / `composeFishingModifiers` |
| Modifier | `PlayerFishingModifiers` に `maxTensionMultiplier` / `slackToleranceMultiplier`。Engine は解決済み modifier だけを使う |
| Catalog | `assembleContent` / `builtInContent` / `nodeContent` が gear・methods・brands を実行時カタログへ載せる。参照切れは `references.ts` が検出する |
| Encounter | `encounterEngine.ts` の `EncounterProfile`（method / offering の重み付け）と `speciesAffinity`。魚種ごとの相性は Content |
| Save | schema **v5**（inventory / loadout）。v4 → v5 migration で Starter gear と有効な Starter loadout を付与 |
| Store | `equipGear` / `setMethod` / `purchaseGear` / hydrate / autosave slice。判定は Domain に委ねる |
| Shop | Gear 商品を Content から並べる。購入は cash 減少 + `ownedGearIds` 追加（自動装備はしない） |
| UI | TACKLE 画面（Current Loadout / 互換性 / 所有 Gear からの選択）、SHOP の Gear 一覧、SPOT のタックル要約 |
| 検証 | `npm run simulate:tackle`（Starter / Finesse / Balanced / Power の比較） |

### Phase 6 の主な設計判断

1. **互換性は「使用不可」を最小にする** — `fatal` だけが装備不可。
   warning / suboptimal は使用可能（現実でも外れた道具は使える）。
   例: ロッド上限の 1.3 倍を超えるルアーだけが fatal。
2. **フックの掛かりを Engine に接続した** — `hookSuccessModifier` は 0 が基準の加算値で、
   `effectiveHookWindowTicks` を広げる。これまで Engine から使われていなかった
   （Skill の Hooking だけが値を動かしていた）ため、フック装備が釣りへ効く経路を追加した。
3. **フックのサイズ判定を修正** — フックは「数字が大きいほど小さい針」。
   旧実装は大小が逆だったため、大型魚に小さい針 / 小型魚に大きい針で警告するよう直した。
4. **ブランドは性能を持たない**（DECISIONS §1）— 性能差は各製品の現実由来スペックで表現する。
5. **Series / sizeClass は Engine の分岐条件にしない** — 商品を増やしても Engine は変わらない。
   `tests/contracts/tackleContent.test.ts` が「新 Gear を足しても Engine 改造が要らない」ことを、
   `tests/architecture/tackle-boundaries.test.ts` が「fishing / encounter domain に具体 Gear ID が
   現れない」ことを検査する。
6. **Save は v4 → v5 の 1 段だけ**（まだリリース前なので migration chain を増やさない）。
   v4 以前のプレイヤーには Starter gear 一式と有効な Starter loadout を付与し、
   「何も買えず釣りができない」状態を作らない。
7. **ShopItem.grantsGearId を追加** — 「1 商品 = セット売り」を Content で表現できる。
   参照切れは validate:content が検出する。

### Phase 6 の検証結果（このセッション）

- `npm run check`: PASS（typecheck / lint / format / validate:content / test / build）
- `npm run test:run`: **54 files / 482 tests PASS**（Phase 6 開始時は 45 files / 377 tests）
- `npm run validate:content`: PASS（**56 件**。魚種 10 + 釣り場 8 + Gear 23 + Methods 4 + Brands 10 + 商品 1）
- `npm run simulate:tackle`: 11 チェックすべて PASS。
  大型（phase2-sample-fish-i）を 9 割まで攻める操作では
  Power 100% / Starter 67% / Balanced 49% / Finesse 22% が取り込みに成功し、
  LINE_BREAK は Finesse 94 回・Power 0 回。
  小型と大型が混ざる場所では Finesse が小型 86 / 大型 30、Power が小型 37 / 大型 79 を掛ける
- `npm run simulate:day`: 9 チェックすべて PASS（変化なし）
- `npm run simulate:trip`: 6 チェックすべて PASS（変化なし）
- `npm run simulate:progression -- --catches 2000`: 9 チェックすべて PASS（変化なし）
- `npm run simulate:fishing -- --seed demo`: LANDED（174 tick。Phase 4 から変化なし。
  このスクリプトはタックルを渡さないため、中立条件の挙動は保たれている）
- `npm run sample:individuals -- --samples 10000`: 全魚種 invalid=0（変化なし）
- バンドル: JS 447.06 kB（gzip 133.24 kB）、CSS 5.36 kB（gzip 1.55 kB）
- 開発サーバー実測: `/` 200、TACKLE 画面 / SHOP 画面 / builtInContent /
  tackle domain / playerStore / gear JSON / brand JSON / method JSON がすべて 200
- UI スモーク（`tests/ui/tackleScreenSmoke.test.ts`）: 新規ゲームの初期状態で
  TACKLE 画面が Starter 装備を描画し、SHOP が Gear とブランドを並べることを確認

## Phase 5 で実装したもの

| 領域 | 内容 |
|---|---|
| 時間進行 | 移動・釣り・帰宅・**翌朝まで休む**（`sleepUntilMorning`）。仕事による制限は無い |
| 暦 | `WorldTime` の日付・曜日・時分・日跨ぎ。曜日は将来（混雑・大会・季節・釣り場ルール）のために保持 |
| 資金 | `src/domain/economy/`。円単位の cash、給与、簡易生活費、直近履歴 |
| 月次精算 | `settleFinance`。月を跨いだときに給与 − 生活費を 1 回だけ処理（複数月も可） |
| 交通費 | 当時の Spot `travelOptions.cost`（片道）。Phase 7A では route の `baseOneWayCost` へ移行 |
| Shop | `src/domain/shop/`。商品は Content（`shop-items`）。購入は残高チェックのみ |
| 車 | 中古コンパクトカー ¥450,000。当時は `world.availableTransports` の `car`（Phase 7A で ownership state へ移行） |
| UI | HOME（日時・予定・現金・有給・休む）、SHOP、MAP（交通費と時間の可否）、SPOT（帰る目安） |
| Save | schema v4（finance 詳細・schedule・purchases）と v3 → v4 migration |
| 検証 | `npm run simulate:day`（1 日 → 翌朝 → 月跨ぎ → 車購入 → 新 Spot 解禁） |

## 設計変更（重要・Phase 5 / Fishing-first）

**会社員という設定は世界観として維持するが、仕事はゲームシステムにしない。**

仕事は「毎月、生活費を差し引いた自由資金が入る背景設定」としてのみ扱う。
プレイヤーの釣行を勤務時間で制限しない。ゲームの主役は完全に釣りである。

採用しないもの:

- 勤務時間（平日 09:00〜18:00）と通勤による拘束
- 有給（Paid Leave）
- 仕事の予定による釣行の拒否
- Career XP / Performance / 昇進 / 転職 / Job Offer / Work Skill / Cross-Skill
- 仕事ミニゲーム、上司・同僚

維持するもの:

- WorldTime（日付・曜日・時分・日跨ぎ）と移動・釣り・帰宅の時間消費
- 月次精算（給与 − 生活費 = 自由資金）
- 交通費、Shop、中古車、車による Spot 解禁
- Economy / World の永続化

理由:

- 仕事をゲーム化すると、プレイヤーの最適化が釣りから仕事へ流れる。
  主役は常に釣りである（GAME_DESIGN.md §12 の方針をさらに徹底した）。
- 曜日は今後、混雑・大会・イベント・季節・釣り場ルールのために使う。
  カレンダーは「釣りの条件」を載せるための器として保持する。

実装・文書上の扱い:

- `src/domain/schedule/`（WorkSchedule / ScheduleState / timeAvailability）は撤去した。
- `src/domain/career/` の型（CareerState / JobDefinition）は使わない。
  Save にも含めない（v4 は progression / codex / world / knowledge / finance / purchases のみ）。
- `tests/architecture/economy-boundaries.test.ts` が「仕事の仕組みを作っていない」
  ことを機械的に確認する。
- `docs/` はこの方針に更新済みである。GAME_DESIGN.md §12（仕事とお金）/
  PROGRESSION.md §15（仕事とお金）/ DATA_MODEL.md §17（仕事・採用しない）/
  ROADMAP.md Phase 5 が「仕事はゲームシステムにしない」と明記している。

## Phase 4 で実装したもの

| 領域 | 内容 |
|---|---|
| 時間 | `src/domain/world/WorldTime.ts`。日付・曜日・時分、日/月/年跨ぎ、うるう年。`Date` を使わない純粋計算 |
| 世界 | `worldSession.ts`。HOME → TRAVELLING → AT_SPOT → RETURNING_HOME → HOME の状態機械 |
| Access | `src/domain/access/accessEngine.ts`。行けるか / 行けない理由 / 使える移動手段を返す |
| 移動 | Spot ごとの `travelOptions`（walk / train / bus）。運賃は扱わない |
| Knowledge | `spotKnowledge.ts` / `regionKnowledge.ts`。訪問・釣り・捕獲で増え、100 で頭打ち |
| 釣りの時間 | 1 回の釣りでゲーム内 20 分（PROVISIONAL）。釣れなくても時間は進む |
| Spot | 東京近郊を模した 8 件（すべて `dataStatus: provisional`）。`fishTable` で魚種が変わる |
| UI | HOME / MAP / SPOT 画面を追加。釣り終了後は SPOT に戻る（瞬間移動しない） |
| 検証 | `npm run simulate:trip`（移動 → 釣り ×N → 帰宅 を seed 固定で再現） |
| Save | schema v3（world を追加）と v2 → v3 migration |

## Phase 3.1 で実装したもの

| 領域 | 内容 |
|---|---|
| 配線 | `src/app/persistence/persistenceCoordinator.ts`。`SaveRepository → Coordinator → Store` の依存方向 |
| 起動時 | `main.tsx` が `loadRaw → migrateSave → hydrateFromSave` を実行（Save 無しは初期状態で ready） |
| Store | `hydrationStatus`（idle / hydrating / ready / error）と `hydrationFailure`、明示的な hydrate 経路 |
| Autosave | 保存対象 slice（progression / codex）の変化だけを購読して保存。既定は debounce 0（取りこぼしを避ける） |
| Guard | hydration が ready になるまで保存しない。Store の操作も ready 前は無効 |
| 壊れた Save | 読み込まずに error 状態へ。**上書きしない**。UI から「新規で始める」で復帰できる |
| UI | 起動直後の loading 表示と、読み込み失敗時の最小のエラー表示 |

## Phase 3 で実装したもの

| 領域 | 内容 |
|---|---|
| レベル | `src/domain/progression/AnglerLevel.ts`。Lv1〜100、複数レベル同時上昇、上限で XP を溜めない |
| XP | `xpCalculation.ts`。`Base × Size × Challenge + Discovery Bonuses`（減衰は倍率部分のみ） |
| サイズ倍率 | 上位 10% で ×1.5、上位 1% で ×3、上位 0.1% で ×8（Phase 2 の percentile を接続） |
| 反復減衰 | `repetitionDecay.ts`。species / spot / method を別々に数え、初捕獲・自己記録・Trophy・高百分位・新 Spot・新釣法では減衰しない |
| Skill | `AnglerSkill.ts`。7 Skill・0〜100・割り振りの検証・MVP の振り直し |
| Skill Point | レベルごとに 1、10 の倍数レベルで +1。同時上昇でも取りこぼさない |
| 修飾 | `playerFishingModifiers.ts`。Skill / Perk → `PlayerFishingModifiers`（9 種の倍率） |
| Perk | `perks.ts`。6 種の定義（Level + Skill 条件）と解禁。効果は倍率表で解決 |
| 捕獲解決 | `src/domain/catch/resolveCatch.ts`。記録 → 判定 → XP → 成長 を 1 箇所に固定 |
| Save | schema v2 と v1→v2 migration（総 XP をカーブから復元、Perk / 反復は空から開始） |
| Codex 永続化 | schema v2 に Codex（捕獲記録）を正式追加。v2 内で欠落を正規化し、破損は拒否する |
| UI | 成長画面（Lv / XP / Skill Point / 7 Skill / Perk / 現在の効果）、釣り画面に XP 結果とレベルアップ表示 |
| 検証 | `npm run simulate:progression`（反復・多様性・上限・決定論の 9 チェック） |

## 主要な設計判断（Phase 3）

1. **Engine は成長を知らない** — `FishingEngine` は `PlayerFishingModifiers` だけを受け取る。
   Skill 名も Perk 名も Level も知らない。`tests/architecture/progression-boundaries.test.ts` が
   Engine のソースに `anglerLevel|anglerXp|skillPoints|unlockedPerks|xpGained|codex` が
   現れないことを検査している（検出できること自体も合成ソースで確認）。
2. **レベルカーブは `80 + 12 × L^1.55`** — 序盤は数匹で上がり、後半は急に重くなる。
   累計で Lv100 まで約 59.6 万 XP。シミュレーション上の目安は約 1.5 万匹
   （PROVISIONAL。プレイテストで調整する）。
3. **上限では XP を溜めない** — Lv100 に達したらレベル内 XP は 0 に固定し、
   それ以上加算しない（`totalXp` は生涯累計として伸び続ける）。
4. **減衰は「倍率のかかる部分」だけ** — Discovery Bonus（初捕獲・自己記録・Trophy 等）は
   減衰させない。これにより「同じ魚を釣る楽しさ」と「新しい挑戦の価値」が両立する。
5. **Skill は操作の成功を置き換えない**（DECISIONS.md §3）— 動かすのは
   テンションの上がり方・REEL / GIVE の効率・アワセ猶予・アタリの見え方だけ。
   自動捕獲やプレイヤー操作の排除はしていない。
6. **Detection だけは UI 補助に接続した** — `detectionClarityMultiplier` が閾値
   （既定 1.2）以上だと、WAITING 中に「アタリまでの残り tick」を開示する。
   これは情報の補助であり、結果は変えない。
7. **Casting / Landing / Rigging は将来用の interface** — 倍率として解決・保存されるが、
   Phase 3 のファイトでは使っていない（Phase 6 以降のタックル・取り込み操作で使う）。
8. **振り直しで Perk を取り直せない** — Skill をリセットすると、条件を満たさなくなった
   Perk は未解禁に戻す。振り直しが無料の Perk 取得にならないようにするため。
9. **捕獲処理は 1 箇所** — `resolveCatch` が記録・判定・XP・成長を順番に実行する。
   UI もストアも First Catch や自己記録を判定しない。
10. **プレイヤー状態はストア、釣行は画面ローカル** — Codex と Progression は
    `src/state/playerStore.ts`（Zustand）が保持し、FishingEngine は釣り画面のフックが持つ。
    Engine は「今の釣行」の状態であり、プレイヤー恒久の状態ではないため。
11. **Save v2 と migration** — v1 は累計 XP を持っていなかったので、
    カーブから「そのレベルに達する累計 + レベル内 XP」を復元する。Perk と反復状態は空から。
12. **level-lock 検査の範囲を絞った** — `requiredLevel` は Perk の解禁条件として正当に使う。
    検査対象を「アクセス条件に関わるファイル」に限定し、
    「Level を場所の解禁キーにしない」という本来の意図を維持した。
13. **Codex を Save v2 に追加した（schemaVersion は 2 のまま）** — Phase 3 の
    First Catch / Personal Record 判定は Codex に依存するため、Codex を保存しないと
    再起動のたびにボーナスを取り直せてしまう（XP の抜け道）。
    版を上げるか v2 内で正規化するかを比較し、**v2 内の正規化**を選んだ:
    - この Save は未リリースで、実際に書き出された v2 Save は存在しない
      （アプリに保存/読み込みの配線がまだ無い）。v3 を切ると、
      存在しない版のための migration を 1 段増やすことになる。
    - 「キーが無い＝古い v2」は空の Codex へ正規化し、
      「キーはあるが中身が不正」は拒否する。欠落と破損を区別するので、
      壊れたデータを黙って捨てることはない。
    将来 Codex 以外の破壊的変更（設計文書の player / inventory / world 追加など）を
    入れるときに、まとめて v3 へ上げる。
14. **永続化は Application 層の Coordinator が行う** — Store も Domain も
    IndexedDB を知らない。Coordinator は `SaveRepository` と Store だけを受け取り、
    migration は既存の `migrateSave` をそのまま使う。
    これにより Domain に永続化処理を足さずに済んでいる。
15. **hydration 前は絶対に書かない** — 購読は最初から張るが、書き込みの入口で
    `hydrationStatus === 'ready'` を必ず確認する。初期状態で既存 Save を
    上書きする事故（＝進行度の消失）を防ぐ。テストで再現して確認している。
16. **hydration 直後に 1 回保存する** — 読み込んだ内容を書き戻すことで、
    v1 から移行した Save や、欠落を正規化した Save が確定する。
    書き込まれるのは必ず「読み込んだ状態」であり、初期状態ではない。
17. **壊れた Save は error 状態で停止し、上書きしない** — 復旧は UI の
    「新規で始める」から行う。このときも、プレイヤーが実際に釣るまで保存しない
    （＝壊れた Save を勝手に消さない）。
18. **Store の操作も ready 前は無効** — UI のガードだけに頼らず、
    `recordCatch` / `spendSkillPoint` / `resetSkills` は hydration 前には何もしない。
19. **新規プレイヤーの初期 Save は PROVISIONAL** — `createInitialSaveV2` が
    career / finance を中立値で埋める（開始時の職種・資金は Phase 5 で決める）。
    knowledge は空から始める。
20. **World は Fishing と別 Domain** — `worldSession` は時間・位置・Knowledge だけを扱い、
    FishingEngine の内部状態を触らない。釣りの結果は「1 回の釣りが終わった」という
    イベントとして World に渡す（`recordFishingAttempt`）。
    UI（fishing 画面）が両者をつなぐ。
21. **Access の入力に Level が存在しない** — `AccessEvaluationInput` には
    transports / knowledge / （将来の）reputation・permit・season しかない。
    Level を渡す場所がないので、Level ロックは構造的に起こらない
    （architecture contract test と accessEngine.test の両方で確認）。
22. **移動は即時解決だが、状態は 2 段** — TRAVELLING / RETURNING_HOME を実際に持つので、
    将来 UI に演出を足せる。ストアは 2 段を連続で呼んで即時に見せている。
23. **Knowledge はボウズでも増える** — 訪問 +15、釣り 1 回 +3、捕獲 +5（PROVISIONAL）。
    水域の Knowledge も別に増え、`scope: 'region'` のアクセス条件で使う。
    これにより「通うほど行ける場所が増える」が成立する。
24. **実在の場所を断定しない** — Spot に `dataStatus`（provisional / verified）を必須にし、
    Phase 4 のコンテンツはすべて `provisional`。UI にも「暫定データ」と表示する。
    魚種・規制・立入可否の根拠が無い情報は書かない。
25. **Spot 追加は Content のみ** — `fishing-spots/*.json` を足せば Map に並び、
    Access Engine が判定する。Engine の変更は不要（テストで確認）。
26. **Save v3 は v2 から World を足すだけ** — progression / codex / knowledge は
    そのまま引き継ぐ。v1 → v2 → v3 の順に適用する。
    テスト用の `SaveGameV2` 型と schema は移行検証のために残している。
27. **仕事はゲームシステムにしない** — 会社員設定は月次の定期収入としてだけ現れる。
    勤務時間・有給・キャリアは持たない。曜日は釣りの条件（混雑・大会・季節）を
    載せるために保持している。
28. **Access は「物理的に行けるか」だけ** — 時間の都合は判定に入れない。
    費用が足りるかは Economy 側で別に見る。
29. **時間は自動では進まないので「翌朝まで休む」がある** — `sleepUntilMorning` が
    翌日 06:00 まで進める。昼間でも休める（仕事の予定による制限は無い）。
30. **お金は選択を作るために使う** — 支出は残高チェックで拒否するが、
    給与と生活費は必ず適用する（軽微な赤字は許容、Game Over は無い）。
    徒歩の釣り場は常に無料で残しているので、資金 0 でも釣りは続けられる。
31. **月次精算は `lastSettledMonth` で 1 回だけ** — 何か月進んでも通過した月を
    すべて処理し、二重支給しない。
32. **車の購入は ownership 状態を増やすだけ** — Economy から AccessEngine の条件を
    書き換えない。Phase 7A では `PlayerTransportState` が増え、同じ Spot の判定結果が変わる。
33. **Save v4 は v3 から finance を拡張し、purchases を足す** —
    progression / codex / world / knowledge はそのまま引き継ぐ。
    v4 は `progression / codex / world / knowledge / finance / purchases` だけを持ち、
    `schedule`（勤務時間・有給）と `career`（仕事の状態）は**保存しない**。
    会社員設定は finance の定期収入だけに現れる。

## アーキテクチャ境界（Phase 0B から継続）

```
src/app   … 起動・配線（composition root）
src/ui    … 表示と入力のみ
src/state … Application / UI 状態（Zustand）
src/domain… ゲームルールと契約（最内層）
   ├ progression … XP / Level / Skill / Perk（Fishing の上位）
   ├ catch        … 記録と成長をまとめる唯一の入口
   ├ codex        … 捕獲記録
   ├ fishing      … 状態機械とファイト（PlayerFishingModifiers のみ受け取る）
   └ fish         … 魚種と個体生成
src/content… データとその検証スキーマ
src/infrastructure… 永続化などの実装
```

- `src/domain` は **外部パッケージを一切 import しない**。
- `src/domain` は React / DOM / Zustand / IndexedDB / ブラウザ API に依存しない。
  `tsconfig.domain.json`（`lib: ES2022`、`types: []`）で型レベルでも強制している。
  Domain のテストも DOM / Node のグローバルを使わない（`structuredClone` は使えない）。
- 乱数は `RandomSource` を注入して使う。`Math.random()` は Domain で禁止。
- `src/ui` は infrastructure と `node:*` を import しない。

### 意味論的なレビューについて

CI は「設計書に書かれていない機能を意味的に検出する」ことはしない。
機械的に安定しないためである（`docs/DECISIONS.md` §7）。
機械判定可能な制約のみを CI / lint / test が担当し、
**意味論的な Product Scope 逸脱の検出は human / code review の責務**とする。

## 検証方法

```bash
npm ci                       # 依存の再現
npm run check                # typecheck → lint → format:check → validate:content → test → build
npm run build                # 本番ビルド
npm run dev                  # http://localhost:5173
npm run dev:host             # 同一 LAN の実機（iPhone Safari など）から開く
npm run validate:content     # Content の検証（不正なら非ゼロ終了）
npm run simulate:fishing -- --seed demo
npm run sample:individuals -- --samples 10000
npm run simulate:progression -- --catches 2000
npm run simulate:tackle        # Starter / Finesse / Balanced / Power の比較
npm run simulate:catalog       # カタログの件数 / カバレッジ / 差別化 / 価格ラダー検査
```

### モバイル実機での確認

- `npm run dev:host` で LAN に公開し、iPhone Safari から `http://<MacのIP>:5173` を開く。
- PWA としてインストールするには secure context が必要である。
  `http://<IP>` は secure context ではないため、Service Worker は登録されない。
  実機で PWA を確認する場合は HTTPS で配信する（トンネル等）。
- Service Worker は本番ビルドでのみ登録する。

### 直近の検証結果（Phase 3 完了時点）

- `npm run check`: PASS
- `npm run build`: PASS
- `npm run test:run`: 45 files / 377 tests PASS
- `npm run validate:content`: PASS（11 件）
- `npm run simulate:progression -- --catches 2000`:
  反復（同一魚種）で Lv21 / 多様な釣りで Lv26、初捕獲 200 XP 対 反復 100 匹目 22 XP。
  9 チェックすべて PASS（Lv100 到達・上限・溢れなし・決定論・複数レベル同時上昇・Perk 解禁）
- `npm run sample:individuals`: 全魚種 invalid=0（Phase 2 から回帰なし）
- `npm run simulate:fishing -- --seed demo`: LANDED（142 tick）。
  **Phase 2 と完全に同じ結果**で、修飾が中立なら Engine の挙動が変わっていないことを確認
- Codex 永続化の round trip: 保存 → JSON 経由で再読み込み → 実際に釣る、までを検証。
  再読み込み後に同じ魚を釣っても First Catch / Personal Record ボーナスが再発生しない
- Save / Load の配線: hydration 前の autosave 禁止、壊れた Save を上書きしないこと、
  再読み込み後の減衰維持まで含めて確認
- 開発サーバー実測: root / 成長画面 / playerStore / progression domain がすべて 200
- `npm run simulate:trip`（seed 固定）:
  `06:00 HOME → 徒歩20分 → 06:20 到着（知識15%）→ 釣り3回（各20分）→ 07:40 HOME`。
  3/3 匹、+500 XP、Lv4、知識 39%。6 チェックすべて PASS（移動・釣行・帰宅の時間、決定論）
- 開発サーバー実測（Phase 4）: root / main.tsx / HOME・MAP・SPOT・FISHING 画面 /
  world domain / accessEngine / Spot JSON がすべて 200
- `npm run simulate:day`（決定論的）:
  05/04 06:00 HOME → 徒歩で近場（釣り 2 回）→ 翌朝まで休む →
  05/05 電車で東京湾岸（交通費 ¥840）→ 約 3 か月で現金 ¥119,160 → ¥479,160 →
  中古車 ¥450,000 を購入 → **車が必要だった釣り場が行けるようになる**。
  9 チェックすべて PASS（平日でも釣行可・翌朝 06:00・自由資金・車の解禁）
- `npm run simulate:trip`: 6 チェックすべて PASS
- バンドル: JS 407.20 kB（gzip 122.21 kB）、CSS 5.36 kB（gzip 1.55 kB）
- 開発サーバー実測（Phase 5）: root / HOME / SHOP / MAP / SPOT /
  economy・schedule domain / shop item JSON がすべて 200

### Phase 4 で変わった既存の検証値

- `simulate:progression -- catches 2000` は 9 チェックすべて PASS（変化なし）
- `sample:individuals` は全魚種 invalid=0（変化なし）
- `validate:content` は 18 件（魚種 10 + 釣り場 8）
- `simulate:fishing -- --seed demo` の tick 数は 142 → **174 に変化**。
  これは内容（Spot）が変わって Encounter の乱数消費が変わったためで、
  Engine の挙動変更ではない

## 未完了・既知のギャップ

- Reputation / 全国 Map / 天候・潮は未実装。Boat は Access / cost 基盤のみ実装し、操船は未実装。
- Casting / Landing / Rigging の効果は引き続き「将来用の interface」。
  数値は解決・保存されるが、ファイトでは使っていない。
  Casting はタックルの `castingPrecisionMultiplier` へ合成されるが、UI の演出はまだ無い。
- Perk の効果は倍率表の範囲に留まる（本格的な Perk ツリーは未実装）。
- 釣り場は 12 件ですべて `provisional`（検証データではない）。実データの投入はしていない。
- 天候・潮・時間帯による釣果変化はまだ無い（`timeActivity` は Content にあるが未使用）。
- Calendar は「日付・曜日の判定」まで。曜日は混雑・大会・イベントへまだ接続していない。
- Boat ownership と capability access は Phase 7A で実装。操船・魚探は無い。
- **UI は画面配信までしか確認していない**。ブラウザ自動操作が無いため、
  HOME → MAP → SPOT → FISHING → SPOT → HOME → TACKLE → SHOP の
  クリック操作は未確認（新規ゲーム初期状態の描画だけスモークテストで確認）。
- 釣行の途中終了からの完全復元は Phase 4 の対象外（安全な checkpoint として
  「現在時刻・位置・Knowledge・釣行記録」までを保存する）。
- Phase 6 の残り:
  - 装備の互換性スコアは PROVISIONAL。人間のプレイテストによる調整は未実施。
  - FishSpecies の `methodAffinity` / `offeringAffinity`、Bait / Lure の
    `targetProfile` は検証用の暫定値（生物学的事実ではない）。
  - Gear は 23 件（Rod / Reel / Line / Leader / Hook / Lure / Bait）。
    Rod 200+ / Reel 150+ / Lure 500+ の拡張は Content 追加だけで可能な構造だが、
    実際にその量は投入していない。
  - Reel の `sizeClass` は 1000〜30000 を定義しているが、投入済みは 1000 / 2500 / 4000 のみ。
  - 装備の耐久・破損・ルアーロスト・売却・中古市場は無い（意図的に未実装）。
  - Bait は Phase 6 では無限使用（数量管理はしない）。
  - 装備による `castingPrecisionMultiplier` / `detectionClarityMultiplier` /
    `landingStabilityMultiplier` の一部は、まだファイトの数値へ直接は効かない。
- Phase 6.5 の残り:
  - **Content を eager で読むため bundle が 638 kB（gzip 160 kB）**。
    Vite の 500 kB 警告が出ている。Content の遅延読み込み / カテゴリ分割は未実装。
  - Series ごとの spec 差は Master の値の範囲に留まる（ブランド差の方が大きい）。
  - Lure の `Casting` / `ActionScore` / affinity 相当（Master のゲーム調整値）は
    未移植。ルアーごとの性能差を強めるなら `GearTuning` 側に入れる必要がある。
  - Master の全件（Reel 383 / Rod 705 / Lure 518）は投入していない。
    投入済みは Reel 142 / Rod 84 / Lure 117（いずれも目標レンジ内）。
  - `terminal_tackle_future` / `landing_gear_future` / `field_gear_future` は未実装。
  - Bait は FUTURE_CONSUMABLE（Phase 6.5 では無限使用）。
  - Shop / Tackle の購入・装備・reload は Phase 7A pre-flight で確認済み。
- Phase 5 の残り:
  - 車の維持費（`simpleVehicleMonthlyCost`）は構造だけ用意し、まだ請求していない。
  - 車種スペック・ローン・保険・駐車場・車検・故障・ガソリン残量は扱わない。
  - 遠征費・宿泊・フェリーは未実装。
  - 天候・潮・時間帯による釣果変化はまだ無い。
- IndexedDB adapter の自動テストは Fake による API 形状の確認に留まる
  （実ブラウザでの永続化・バージョン管理・障害時の挙動は未検証）。
- 複数タブの同時編集、Save の export / import、スロット選択、復旧 UI は未実装。
- XP カーブ・減衰・Skill 効果・GearTuning はすべて `PROVISIONAL`。人間のプレイテストは未実施。
- 魚種 10 種・釣り場 12 件・Gear 463 件・ブランド 12 件はいずれも検証用サンプル（現実データではない）。
- UI のテストはスモーク（初期状態の描画）のみ。クリック操作の自動テストは無い
  （意図的に Domain を優先）。
- 実行時 Content 検証のため Zod をブラウザに含む（gzip +約 30 kB、Phase 1 からの継続課題）。
- IndexedDB 実装は依然ブラウザでの自動テストが無い（Phase 0B からの持ち越し）。

## 次の推奨タスク

**Phase 7B — Expedition Planning**（`docs/ROADMAP.md`）

1. ferry / highway / parking / lodging の cost component を追加する。
2. 複数日遠征の最小 Domain と、rental / marina / launch point の選択 UI を作る。
3. cargo / gear capacity を釣行準備へ接続する。
4. Garage / Trip planning UI で購入・利用状況を見せる。

Phase 6 から持ち越した調整（プレイテスト前提）:

- GearTuning / 互換性スコア / affinity の暫定値を実プレイで調整する。
- 未接続の modifier（casting / detection / landing）を演出へ接続する。

## ブロッカー

- なし（Phase 7A の作業自体は完了）。
- 補足: 実行環境によっては Git メタデータ（`.git`）への書き込みが制限され、
  `git add` / `git commit` が失敗することがある。
  その場合はユーザー側でコミットを実行し、本文書を更新する。

## Phase 18C done (e6c29ac)
- fightReadiness.ts: ○/△/× readiness marks (line_capacity/drag/retrieve/weak_link/abrasion) vs BIG_GAME_REFERENCE_DEMAND_KG=36 or a concrete FightDemand; challenge masked until hasBigGameExperience
- bigGameRecords.ts: records derived from Codex PB (>=20kg or >=90 percentile); uncaught species stay hidden
- UI: TACKLE "BIG GAME READINESS" panel, expedition-in-progress outlook line, CODEX "BIG GAME RECORDS" section
- No new save state. check green (965 tests, boot gzip 174.5kB)
- NEXT: Phase 18D content — big-game spots (hidden, captain/guide discover_spot), heavy/endgame gear, contacts

## Phase 18D done
- Spots: norway-hidden-abyss-edge / izu-hidden-tuna-current / okinawa-hidden-gt-point (150 spots total)
- Rewards: 2 captain discover_spot @trust55 + 1 buyer discover_spot @trust40 + 2 big-game intel @trust40 (85 total)
- Gear: 13/0 circle 50kg, 13/0 assist 55kg, TUNAARC 285XHP rod (473 gear total)
- check green (965 tests, boot gzip 174.5kB)
- NOTE: simulate:big-game broken at HEAD (stale ids alaska-chinook-salmon) — fix in 18E
- NEXT: 18E — fix+strengthen simulate:big-game (SPOOLED tracking, spool scenarios), regression docs, PR finalization

## Phase 18E done
- simulate:big-game fixed+strengthened (5 setups x 5 species + spool scenario, in check chain)
- simulate-fishing strategy parity with UI (line remaining / pump)
- docs: DECISIONS.md + ARCHITECTURE.md Phase 18 sections
- Browser smoke (Playwright 390px): HOME/TACKLE(readiness masked)/CODEX, 0 console errors
- check green: 965 tests, all sims, boot gzip 174.5kB
- PHASE 18 COMPLETE locally. Push/PR pending GitHub auth (gh auth login -h github.com needed)
