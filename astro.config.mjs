// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // 公開URL。sitemap の生成、canonical、OGPの絶対URLがこれを基準にする。
  // 実際に配信されているURLと一致していないと canonical がずれ、
  // SNSにリンクを貼ってもカードが正しく表示されない。
  //
  // 配信先はこの1つだけ。*.workers.dev のURLは wrangler.jsonc の
  // workers_dev: false で塞いでいる（理由はそちらに記載）。
  // 配信先を変えるときは public/robots.txt の Sitemap 行も一緒に直すこと。
  site: 'https://mawo.dev',

  integrations: [sitemap()],

  build: {
    // CSSは全ページ合計でも数KB（gzip後 1〜2KB）しかない。
    // 外部ファイルにするとレンダーブロッキングの往復が1回増え、
    // モバイル回線ではそれが FCP→LCP に直接効く。インライン化して往復を消す。
    inlineStylesheets: 'always',
  },
});
