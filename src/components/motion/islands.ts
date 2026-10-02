// 成果物一覧セクションのアイランドを1本のエントリにまとめたブートストラップ。
//
// なぜ1本か:
//   コンポーネントごとに <script> を持つと、Astro はそれぞれ別チャンクに分ける。
//   中身は各数百バイトなのに、読み込み直後の High 優先度リクエストが5〜6本になり、
//   フォントと帯域を奪い合って LCP を押し上げていた（実測でここが効いた）。
//   重い本体（GSAP / OGL）は従来どおり動的 import のままで、初期JSは増えない。
//
// ここに書くのは「いつ重い処理を取りに行くか」の判定と、その後始末だけ。
// 実際の演出は ignite.ts / sky.ts / rail.ts 側にある。
//
// ページ遷移（ClientRouter）との関係:
//   バンドルされた <script> は一度しか評価されないため、/works/ を離れて戻ったときに
//   初期化をやり直すには、ページごとに initIslands() を呼び、離れるときに
//   戻り値の後始末を呼ぶ必要がある（呼び出しは WorksList.astro）。
//   後始末をしないと、DOM から外れた canvas に向けて描画ループが回り続け、
//   戻るたびに canvas・rAF・リスナーが増えていく。
import { prefersReducedMotion } from './motionGuard';

export type Cleanup = () => void;

/** 対象が視界に近づいたら一度だけ load() を呼ぶ。後始末で observer を外す */
function whenNear(target: Element, load: () => void, rootMargin = '200px 0px'): Cleanup {
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      load();
    }
  }, { rootMargin });
  observer.observe(target);
  return () => observer.disconnect();
}

/** メインスレッドが空いたら run() を呼ぶ（未対応時は setTimeout(300)）。後始末で取り消す */
function whenIdle(run: () => void): Cleanup {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run);
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 300);
  return () => clearTimeout(id);
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

  後始末では、待ち受けているリスナーとタイマーをすべて外す。
*/
function whenSettled(run: () => void): Cleanup {
  const EVENTS = ['scroll', 'pointerdown', 'keydown', 'touchstart'] as const;
  let timer = 0;

  const disarm = () => {
    EVENTS.forEach((type) => window.removeEventListener(type, fire));
    window.clearTimeout(timer);
  };

  function fire() {
    disarm();
    run();
  }

  const arm = () => {
    EVENTS.forEach((type) =>
      window.addEventListener(type, fire, { once: true, passive: true })
    );
    timer = window.setTimeout(fire, 2500);
  };

  if (document.readyState === 'complete') arm();
  else window.addEventListener('load', arm, { once: true });

  return () => {
    window.removeEventListener('load', arm);
    disarm();
  };
}

/**
 * 成果物一覧セクションの演出を仕掛け、後始末の関数を返す。
 *
 * 後始末はこの呼び出しで作ったもの（待機中のタイマー・操作待ちのリスナー・
 * IntersectionObserver・idle の予約・取得後に始めた演出）をすべて止める。
 * 遅延 import が後始末の後に終わった場合や、セクションがもう DOM に無い場合は初期化しない
 * （古いページの外れた容器に canvas を足し、見えない描画ループだけが残るのを防ぐ）。
 */
export function initIslands(section: HTMLElement): Cleanup {
  const cleanups = new Set<Cleanup>();
  let cancelled = false;

  const alive = () => !cancelled && section.isConnected;

  /** 後始末を預ける。すでに後始末が済んでいたら、その場で止める */
  const own = (cleanup: Cleanup) => {
    if (cancelled) cleanup();
    else cleanups.add(cleanup);
  };

  own(whenSettled(() => initIslandsNow(section, own, alive)));

  return () => {
    if (cancelled) return;
    cancelled = true;
    cleanups.forEach((cleanup) => cleanup());
    cleanups.clear();
  };
}

function initIslandsNow(
  section: HTMLElement,
  own: (cleanup: Cleanup) => void,
  alive: () => boolean
): void {
  if (!alive()) return;

  const reduced = prefersReducedMotion();
  // 縦組みレールが表示される幅（rail の CSS と同じ境目）。光害の空もこの幅以上でだけ描く
  const wide = window.innerWidth >= 768;

  // --- 作品看板の点灯シーケンス ---
  // 静的HTMLの時点で看板は読める状態で描画済み。これは上乗せの演出。
  const list = section.querySelector<HTMLElement>('.works');
  if (list && !reduced) {
    own(
      whenNear(list, () => {
        import('../facade/ignite').then(({ initIgnite }) => {
          if (alive()) own(initIgnite(list));
        });
      })
    );
  }

  // --- 光害の空（WebGL）---
  // 条件を満たさないときは canvas を作らず、CSSの静的グラデーションが残る。
  //
  // 767px 以下では描かない。狭い画面では作品カードが画面の大半を占め、空の光は
  // カードのあいだにしか見えない。そのわりに、/works/ を直接開くと 2.5 秒後に
  // 背景（夜景）の取得と同時に canvas が現れ、画面全体の色が急に青紫へ変わって見えていた。
  // GPU の負荷にも見合わないので、CSS の静的グラデーションだけにする。
  const skyContainer = section.querySelector<HTMLElement>('[data-sky-container]');
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const saveData = connection?.saveData === true;

  if (skyContainer && !reduced && !saveData && wide) {
    own(
      whenNear(section, () => {
        own(
          whenIdle(() => {
            import('../sky/sky').then(({ initSky }) => {
              if (alive() && skyContainer.isConnected) own(initSky(skyContainer));
            });
          })
        );
      })
    );
  }

  // --- 縦組みレールのパララックス ---
  // 768px 未満ではレール自体が display:none なので動かす必要がない。
  const rail = section.querySelector<HTMLElement>('[data-rail-text]');
  if (rail && !reduced && wide) {
    own(
      whenNear(section, () => {
        import('../rail/rail').then(({ initRail }) => {
          if (alive()) own(initRail(rail, section));
        });
      })
    );
  }
}
