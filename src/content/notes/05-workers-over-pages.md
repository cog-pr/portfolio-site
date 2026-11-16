---
title: "なぜ Cloudflare Pages ではなく Workers か"
date: 2026-08-10
decision: "ホスティングを Cloudflare Workers（Static Assets）にする。当初の仕様で指定していた Pages は使わない。"
alternatives:
  - option: "Cloudflare Pages"
    why_not: "静的配信には過不足ない。ただし Cron・Queue・Logs・非ルートへの配信が使えず、必要になった時点で移行が要る。"
  - option: "Vercel / Netlify"
    why_not: "ドメインと DNS を Cloudflare で持っているので、事業者を分けると管理点が増える。"
  - option: "GitHub Pages"
    why_not: "ヘッダー・リダイレクト・将来の動的処理で劣る。"
verdict: "静的配信の結果は変わらない。差が出るのは後で動的処理が要るときだけで、今払う代償は wrangler.jsonc 一枚。"
---
