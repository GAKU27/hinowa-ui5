Hinowa v5b — Full Pack（scale & nonstandard）

このZIPを解凍して、**すべて同じフォルダ**に置き、`index.html` を開くだけ。
もし `file://` でJSONが読めない場合は、GitHub Pages か `python -m http.server` を使ってください。

入っているもの：
- index.html                      … UI本体（空入力→完全リセット、Fire Path表示）
- main_b2.js                      … ローダ/テンプレ合成/辞書スキャン/履歴保存
- engine_v41_b.js                 … 中核エンジン v4.1-b（Safe-Bias、同文平滑、危機ブースタ、夜間補正）
- dictionary_mega_compiled.json   … 9タグ・シャード化辞書（高速大規模スキャン）
- summary_templates_b2.json       … 自然な話し言葉テンプレ（スロット合成、最大3文）
- mode_config.json                … 閾値（critical 0.85 / high 0.68 / medium 0.50）
- firepath_palette.json           … 過去/今/未来の色パレット

ヒント：
- FASが上がりにくい → `dictionary_mega_compiled.json` の「危機/希死/救援」に語追加 or `weight`↑
- テンプレが物足りない → `summary_templates_b2.json` に文例を追記（slot×levelごと）
- 重い → シャードを細かく分割（1シャード≒800語目安）

© Hinowa Infinity
