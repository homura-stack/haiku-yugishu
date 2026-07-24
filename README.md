# コピペ俳句

ランダムな五音・七音の断片を組み替えて俳句を作り、3人のAI俳人が採点する一人用Webゲーム。
ZEN Study プログラミングコンテスト 2026夏 / Webページ部門 応募作品。

## 開発
- `npm install` … devDependencies（tailwindcss）を導入
- `npm run build:css` … `dist/styles.css` を生成
- `npm test` … 純粋ロジックの単体テスト（node:test）

## 遊び方
1. 「はじめる」で開始（90秒）。
2. 五音・七音の**札をドラッグ**して、五・七・五の枠に一句を組む。
3. 3枠そろったら**提出**。時間内にできるだけ多く詠む。
4. 時間切れで、宗匠・若手・翁の**3人のAI俳人**が「風流」と「シュール」で採点（**300点満点**）。自作句とお手本句がランキングされる。

## 技術メモ
- **HTML / CSS / JavaScript（ES Modules）のみ**。外部JSライブラリ不使用（CSSは Tailwind をCLIで静的ビルドして同梱）。
- 実行時に**サーバー・APIキー・ネット接続不要**。`index.html` を開くだけで動作（オフライン可）。
- 採点・講評・配札・ランキングは**DOM非依存の純関数**として実装し、`node:test` で単体テスト（外部依存ゼロ）。

## ローカルで動かす
`fetch` を使うため `file://` ではなくローカルサーバ経由で開く：
```
npx serve .     # 例: http://localhost:3000 を開く
```

## デプロイ（GitHub Pages）
1. このリポジトリを GitHub に **Public** で push。
2. Settings → Pages → Branch を `main` / `(root)` に設定。
   - ※ `copipe-haiku/` をサブディレクトリで運用している場合は、`copipe-haiku` の中身をリポジトリのルートに置くか、`copipe-haiku` 自体をリポジトリのルートにする。
3. 公開URLの `index.html` が PC / スマホ Chrome で動作することを確認。
4. 提出フォームに **GitHubリポジトリURL（Public）** と **ホスティングURL** を記入。
