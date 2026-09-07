// 「このサイトについて」ページの点灯シーケンスデモ。
// 成果物一覧と同じ「上から順に / 一瞬フル点灯してから微光に落ち着く」挙動を、
// stagger と合計 duration だけ差し替え可能にしたもの。
import { gsap } from 'gsap';
import {
  IGNITE_FLASH_DURATION,
  IGNITE_FLASH_STRENGTH,
  IGNITE_RESTING_STRENGTH,
  IGNITE_TOTAL_DURATION,
} from './igniteConfig';

export interface DemoTiming {
  stagger: number;
  duration: number;
}

export function createDemoPlayer(
  signs: HTMLElement
): (values: DemoTiming) => void {
  const titles = Array.from(signs.querySelectorAll<HTMLElement>('[data-demo-sign-title]'));

  let timelines: gsap.core.Timeline[] = [];

  return function play({ stagger, duration }) {
    // 連打・スライダー連続操作で再生が重ならないよう、前回分を止めてから開始する
    timelines.forEach((tl) => tl.kill());
    timelines = [];
    gsap.set(titles, { clearProps: '--neon-strength' });

    // 本番の flash 0.14s / settle 0.34s の比率を保ったまま、合計尺だけ変える。
    const flash = duration * (IGNITE_FLASH_DURATION / IGNITE_TOTAL_DURATION);
    const settle = duration - flash;

    titles.forEach((title, i) => {
      const tl = gsap
        .timeline({ delay: i * stagger })
        .set(title, { '--neon-strength': 0 })
        .to(title, {
          '--neon-strength': IGNITE_FLASH_STRENGTH,
          duration: flash,
          ease: 'power2.out',
        })
        .to(title, {
          '--neon-strength': IGNITE_RESTING_STRENGTH,
          duration: settle,
          ease: 'power2.out',
          clearProps: '--neon-strength',
        });
      timelines.push(tl);
    });
  };
}
