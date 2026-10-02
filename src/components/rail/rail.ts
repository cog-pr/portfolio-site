// 縦組みレールのパララックス。本文より遅い速度（係数0.6）でスクロールする。
// GSAP ScrollTrigger の scrub を使用。
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const PARALLAX_FACTOR = 0.6;

/**
 * パララックスを仕掛け、後始末の関数を返す。
 * ページ遷移で /works/ を離れるとき、ScrollTrigger とトゥイーンを止める。
 */
export function initRail(rail: HTMLElement, section: HTMLElement): () => void {
  // セクションを通過する間に進む距離を、本文（=セクション高）より遅くする。
  const distance = () => section.offsetHeight * (1 - PARALLAX_FACTOR);

  const tween = gsap.fromTo(
    rail,
    { y: () => -distance() / 2 },
    {
      y: () => distance() / 2,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true,
      },
    }
  );

  return () => {
    tween.scrollTrigger?.kill();
    tween.kill();
  };
}
