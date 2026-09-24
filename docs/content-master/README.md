# Fishing Content Master Draft

AI / Git向けのCSVマスター原稿です。Runtimeから直接読む前提ではありません。

## 収録
- Fish candidates: 218
- Brands: 12
- Brand series: 54
- Reels: 383
- Rods: 705
- Lines: 89
- Leaders: 56
- Hooks: 91
- Lures: 518
- Baits: 12
- Methods: 20
- Future terminal tackle: 76
- Future landing gear: 13
- Future field gear: 28

## 重要な扱い
1. `fish_master.csv` は `DRAFT_UNVERIFIED`。実在魚の本番投入時は学名・分布・サイズ・季節・規制・釣法を信頼できる出典で個別確認する。
2. 釣具は架空ブランド・架空商品。ブランド名は開発用パロディ案で、公開前に商標・混同リスクを再レビューする。
3. ブランド名そのものに性能バフを付けない。性能差は各製品のスペックで表現する。
4. Phase 6 Runtime Contentへは現在のSchemaに合わせて必要分だけ段階的に移植する。
5. `*_future.csv` は将来構想であり、Phase 6へ無理に入れない。
6. 高価格=万能にしない。対象魚・釣法・場所・ルアー重量・ライン・ドラグ等で最適解を変える。

## 推奨取り込み順
`brands.csv` → `brand_series.csv` → Phase 6対象の `reels/rods/lines/leaders/hooks/lures/baits/methods` → validation → 段階投入。

魚データは別途リサーチ工程を挟むこと。
