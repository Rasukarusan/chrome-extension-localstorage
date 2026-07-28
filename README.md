# LocalStorage Editor

現在のタブのlocalStorageを閲覧・編集できるChrome拡張（Manifest V3）。アコーディオンUI。

## 機能

- 現在のタブのlocalStorage一覧表示（キー・値のプレビュー付き）
- クリックで展開して編集: キー / 値（キー変更はリネームとして扱う）
- 値のJSON整形（値がJSON文字列の場合にワンクリックで整形）
- アイテムの追加・削除・全削除（誤操作防止の2回クリック確認）
- キー・値でのインクリメンタル検索
- JSONエクスポート（クリップボードへコピー）/ JSONインポート（`{ "key": "value" }` 形式・`[{ "key", "value" }]` 形式の両対応）
- env形式（`KEY=value`）でのコピー

## インストール

1. Chromeで `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択

## 構成

```
manifest.json   # Manifest V3 定義
popup.html      # ポップアップUI
popup.css       # スタイル
popup.js        # scripting API 経由の localStorage 操作ロジック
icons/          # アイコン（scripts不要・生成済みPNG）
```

## 仕組み

ポップアップからは対象ページのlocalStorageに直接アクセスできないため、`chrome.scripting.executeScript` でページ側に関数を注入して読み書きする。
