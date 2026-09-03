// 作品看板の点灯シーケンス（GSAP island）。
//
// フォールバック要件: 静的HTMLの時点で看板は読める状態で描画されている。
// このスクリプトは「上から順に管が灯る」演出を上乗せするだけで、
// 実行されなくても（読み込み前/失敗時）全作品はリンクとして機能し視認できる。
//
// 以前は窓グリッドのセルの背景色を動かしていたが、レイアウトを看板に変えたため
// 対象を看板の発光（--neon-strength）に変更した。
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../motion/motionGuard';
import {
  IGNITE_FLASH_DURATION,
  IGNITE_FLASH_STRENGTH,
  IGNITE_RESTING_STRENGTH,
  IGNITE_SETTLE_DURATION,
  IGNITE_STAGGER,
} from './igniteConfig';

gsap.registerPlugin(ScrollTrigger);

export function initIgnite(): void {
  const list = document.querySelector<HTMLElement>('.works');
  if (!list) return;

  const titles = Array.from(list.querySelectorAll<HTMLElement>('.sign__title'));
  if (titles.length === 0) return;

  if (prefersReducedMotion()) {
    // stagger を 0 にし、即座に最終状態（＝静的HTML通り）にする
    return;
  }

  ScrollTrigger.create({
    trigger: list,
    start: 'top 85%',
    once: true,
    onEnter: () => {
      titles.forEach((el, i) => {
        gsap
          .timeline({ delay: i * IGNITE_STAGGER })
          // 一瞬フル点灯してから静止状態に落ち着く（蛍光灯が安定するまでの挙動）
          .set(el, { '--neon-strength': 0 })
          .to(el, {
            '--neon-strength': IGNITE_FLASH_STRENGTH,
            duration: IGNITE_FLASH_DURATION,
            ease: 'power2.out',
          })
          .to(el, {
            '--neon-strength': IGNITE_RESTING_STRENGTH,
            duration: IGNITE_SETTLE_DURATION,
            ease: 'power2.out',
            // アニメーション後はインラインstyleを外し、CSSの :hover に制御を戻す
            clearProps: '--neon-strength',
          });
      });
    },
  });
}
