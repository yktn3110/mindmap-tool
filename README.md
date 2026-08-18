# Mindflow

ブラウザだけで使える、個人向けマインドマップアプリです。データはJSONファイルとして端末に保存します。

## 使う

公開版: <https://yktn3110.github.io/mindmap-tool/>

対応ブラウザはデスクトップ版の Chrome と Microsoft Edge です。

1. 「名前を付けて保存」でマップをJSONファイルに保存します。
2. 次回は「開く」でそのJSONファイルを選びます。
3. Chrome / Edgeで開いたファイルは「上書き保存」が使えます。

編集内容はブラウザのストレージには保存しません。保存前にページを閉じようとすると、ブラウザが確認を表示します。

## ローカルで起動する（開発用）

Node.jsを用意して、リポジトリ内で実行します。

```powershell
npm install
npm start
```

<http://127.0.0.1:4173> を開きます。

## マップを指定して起動する

ローカルのJSONファイルを開いた状態で起動するには、次を実行します。

```powershell
npm run open -- "C:\maps\企画.json"
```

ブラウザを開かず、URLだけを表示したい場合は `--no-open` を付けます。CLIから開いた場合も、保存は画面の「名前を付けて保存」を使います。

## テスト

```powershell
npm run test:e2e
```

Playwrightによるブラウザ操作テストを実行します。

## ライセンス

[MIT License](LICENSE)
