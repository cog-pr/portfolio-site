// 汎用スクロールリビール。
//
// 重要（§10-1「JSなしで壊れないか」）: 初期状態を CSS で opacity:0 にしない。
// 隠す処理はこのスクリプトが動いたときに初めて適用する。そうしないと
// JSが落ちた瞬間に本文が永久に見えなくなる。
//
// GSAP は使わない。単純なフェードアップに44KBを払う必要がないため、
// IntersectionObserver + CSSトランジションで完結させる。
//
// ページ遷移（ClientRouter）との関係:
//   呼び出し側の <script> は一度しか評価されないため、ページに来るたびに initReveal() を呼び、
//   離れるときに戻り値の後始末を呼ぶ（呼び出しは about-this-site.astro）。
//   後始末では observer を外し、付けたクラスも外す。外れた古い DOM を observer が
//   掴み続けたり、隠したままの要素が残ったりしないようにするため。
import { prefersReducedMotion } from './motionGuard';

const HIDDEN_CLASS = 'is-reveal-pending';
const SHOWN_CLASS = 'is-revealed';

// いまリビールを仕掛けている要素。同じ要素に二重に仕掛けない
const armed = new WeakSet<Element>();

/**
 * root の中の selector に一致する要素を、視界に入ったときにフェードアップさせる。
 * 戻り値の後始末で observer を外し、付けたクラスを元に戻す。
 */
export function initReveal(selector: string, root: ParentNode = document): () => void {
  // IntersectionObserver が無い環境では、隠したまま戻せなくなるので何もしない
  if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') return () => {};

  const targets = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !armed.has(el)
  );
  if (targets.length === 0) return () => {};

  let disposed = false;

  const observer = new IntersectionObserver(
    (entries) => {
      // 後始末の前に積まれていた通知が後から届いても、外したクラスを付け直さない
      if (disposed) return;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        el.classList.add(SHOWN_CLASS);
        observer.unobserve(el);
      });
    },
    { rootMargin: '0px 0px -10% 0px' }
  );

  // JSが動いていることが確定してから隠す
  targets.forEach((el) => {
    armed.add(el);
    el.classList.add(HIDDEN_CLASS);
    observer.observe(el);
  });

  return () => {
    disposed = true;
    observer.disconnect();
    targets.forEach((el) => {
      armed.delete(el);
      el.classList.remove(HIDDEN_CLASS, SHOWN_CLASS);
    });
  };
}
