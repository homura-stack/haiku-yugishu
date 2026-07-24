# デッキ拡張

`deck.json` に統合した追加カードの原稿を、テーマ単位で保存する場所です。

- `poetic-surreal.json`：幻想・詩的なシュール札40枚（五音24枚・七音16枚）

追加原稿を本体へ統合するときは、プロジェクトルートで次を実行します。

```sh
node scripts/merge-cards.mjs data/expansions/<ファイル名>.json
npm run build
npm test
```

統合ツールは、実モーラ数、ID重複、本文重複、必須属性と数値範囲を検証します。
