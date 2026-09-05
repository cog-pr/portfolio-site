// 成果物一覧セクションのアイランドを1本のエントリにまとめたブートストラップ。
//
// なぜ1本か:
//   コンポーネントごとに <script> を持つと、Astro はそれぞれ別チャンクに分ける。
//   中身は各数百バイトなのに、読み込み直後の High 優先度リクエストが5〜6本になり、
//   フォントと帯域を奪い合って LCP を押し上げていた（実測でここが効いた）。
//   重い本体（GSAP / OGL）は従来どおり動的 import のままで、初期JSは増えない。
//
// ここに書くのは「いつ重い処理を取りに行くか」の判定だけ。
// 実際の演出は ignite.ts / sky.ts / rail.ts 側にある。
import { prefersReducedMotion } from './motionGuard';

/** 対象が視界に近づいたら一度だけ load() を呼ぶ */
function whenNear(target: Element, load: () => void, rootMargin = '200px 0px'): void {
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      load();
    }
  }, { rootMargin });
  observer.observe(target);
}

/*
  演出を取りに行き始めるタイミング。「最初の操作」か「2.5秒経過」の早い方。

  観測を始める時刻そのものを遅らせるのが要点。専用ページ `/works/` では
  一覧がページ先頭に来るため IntersectionObserver が即座に発火し、
  GSAP（26.6+17.2KB）と OGL（14.3KB）が本文のフォントと同時に走っていた。
  実測で LCP が 1887〜2036ms の幅で振れ、予算 2000ms の境界に乗る。

  演出はすべて上乗せで、無くてもページは成立する（仕様書 §9）。
  上乗せが入口の速度を食うなら順序が逆なので、本文を配り終えるまで待たせる。

  スクロールを合図にしているのは、点灯もパララックスも本来スクロールに
  連動する演出だから。触らない人にも見せるため 2.5 秒で保険をかける。

  View Transitions で遷移してきた場合、load イベントはもう来ない。
  readyState を見て即座に待機へ入る。
*/
function whenSettled(run: () => void): void {
  const EVENTS = ['scroll', 'pointerdown', 'keydown', 'touchstart'] as const;
  let timer = 0;

  const fire = () => {
    EVENTS.forEach((type) => window.removeEventListener(type, fire));
    window.clearTimeout(timer);
    run();
  };

  const arm = () => {
    EVENTS.forEach((type) =>
      window.addEventListener(type, fire, { once: true, passive: true })
    );
    timer = window.setTimeout(fire, 2500);
  };

  if (document.readyState === 'complete') arm();
  else window.addEventListener('load', arm, { once: true });
}

export function initIslands(): void {
  whenSettled(initIslandsNow);
}

function initIslandsNow(): void {
  const section = document.querySelector<HTMLElement>('.works-section');
  if (!section) return;

  const reduced = prefersReducedMotion();

  // --- 作品看板の点灯シーケンス ---
  // 静的HTMLの時点で看板は読める状態で描画済み。これは上乗せの演出。
  const list = section.querySelector<HTMLElement>('.works');
  if (list && !reduced) {
    whenNear(list, () => {
      import('../facade/ignite').then(({ initIgnite }) => initIgnite());
    });
  }

  // --- 光害の空（WebGL）---
  // 条件を満たさないときは canvas を作らず、CSSの静的グラデーションが残る。
  const skyContainer = section.querySelector<HTMLElement>('[data-sky-container]');
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const saveData = connection?.saveData === true;

  if (skyContainer && !reduced && !saveData) {
    whenNear(section, () => {
      const requestIdle =
        window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
      requestIdle(() => {
        import('../sky/sky').then(({ initSky }) => initSky(skyContainer));
      });
    });
  }

  // --- 縦組みレールのパララックス ---
  // 768px 未満ではレール自体が display:none なので動かす必要がない。
  const rail = section.querySelector<HTMLElement>('[data-rail-text]');
  if (rail && !reduced && window.innerWidth >= 768) {
    whenNear(section, () => {
      import('../rail/rail').then(({ initRail }) => initRail(rail, section));
    });
  }
}
