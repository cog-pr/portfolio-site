---
title: "なぜ Next.js ではなく Astro か"
date: 2026-01-12
decision: "フレームワークに Astro を採用する。"
alternatives:
  - option: "Next.js（App Router）"
    why_not: "SSR も API Routes も要らない。そのうえ何もしなくてもクライアントランタイムが載る。"
  - option: "SvelteKit / Nuxt"
    why_not: "同じ理由。加えて「JSをデフォルトゼロにする」徹底で Astro に劣る。"
verdict: "初期JS 30KB以下をマージ不可の条件にしている。デフォルトの挙動がその予算に沿う方を選んだ。"
---
