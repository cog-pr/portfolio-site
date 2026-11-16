---
title: "なぜ Three.js ではなく OGL か"
date: 2026-01-16
decision: "背景シェーダーに OGL を使う。"
alternatives:
  - option: "Three.js"
    why_not: "フルスクリーン三角形1枚に、シーングラフもカメラもローダーも要らない。"
  - option: "生の WebGL を直書き"
    why_not: "シェーダーのコンパイルと uniform 管理を自前で書くことになり、軽量化に見合わない。"
verdict: "WebGL の使用箇所は背景1つ、ジオメトリは三角形1枚。薄いラッパーで足りる。"
---
