# 俳句遊戯集

俳句を「組み替える」「借りて作り直す」「記憶して斬る」の三方向から遊ぶ、ブラウザ向けの一人用Webゲーム作品集です。

## 収録モード

- **コピペ俳句（通常）**: 五音・七音の札を組み替え、90秒でできるだけ多くの句を提出します。
- **盗作率鑑定所（ハード）**: 4つの名句から切り出した12枚の札と自由語を使い、五・七・五を3句作ります。批評家botが盗作率を鑑定し、`100 - 盗作率`を得点にします。
- **名句斬り**: 芭蕉・蕪村・一茶・子規の名句の空欄を完成させ、10問の得点と連続正解を競います。

すべてのモードは最初から選択できます。通常モードと名句斬りの既存記録は維持し、盗作率鑑定所は3句合計300点の自己ベストを端末内に保存します。

## 開発と検証

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
node --check dist\app.js
```

`npm test` はNodeテストとオフライン生成物の鮮度を確認します。`npm run test:browser` はビルド後、Google ChromeでPC幅・390px幅・`file://`起動を検証します。

ローカルサーバーで確認する場合:

```powershell
python -m http.server 4173
```

`http://127.0.0.1:4173/` をPC・スマートフォン幅で確認してください。

## 配布

HTML / Tailwind CSS / Vanilla JavaScriptのみで構成し、外部APIや実行時通信を必要としません。`npm run build` はデータを `dist/app.js` に埋め込むため、`index.html` の直接起動とGitHub Pagesなどの静的公開に対応します。

盗作率鑑定所で照合する代表名句の出典URLは [data/hard-source-haiku.json](data/hard-source-haiku.json) に記録しています。
