// 光害の空: フルスクリーン三角形1枚 + フラグメントシェーダーのみ。
// マウス追従はしない（空は人間に反応しない）。色はCSSトークンから読み取り、
// シェーダー内に16進数を直書きしない。
import { Renderer, Program, Mesh, Triangle } from 'ogl';
import fragment from './sky.frag?raw';

const vertex = `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 v_uv;
  void main() {
    v_uv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  // CSSミニファイア（Lightning CSS等）が #000000 を #000 に短縮するため、
  // 3桁省略形にも対応する。
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function readColorToken(name: string): [number, number, number] {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return hexToRgb(value);
}

/**
 * GPUを持たない環境（CIのヘッドレスLinux、GPUが無効な端末）では
 * WebGL が SwiftShader / llvmpipe によるソフトウェア描画にフォールバックする。
 * 全画面のfBmシェーダーを毎フレームCPUで解くことになり、実測でメインスレッドを
 * 10秒近く占有した（GitHub Actions で TBT 2180ms / Performance 0.71）。
 *
 * 空は「気づかれない」ことが正解の装飾なので、こういう環境では初期化せず
 * CSSの静的グラデーションに任せる。§6.2 のロード条件と同じ性質の判定。
 */
function isSoftwareRenderer(gl: WebGLRenderingContext): boolean {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (!dbg) return false;
  const name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '');
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

export type Cleanup = () => void;

const noop: Cleanup = () => {};

/*
  初期化済みの容器。同じ .sky に canvas と描画ループを2つ作らないため。
  後始末（cleanup）を呼ぶと外れる。
*/
const activeContainers = new WeakSet<HTMLElement>();

/**
 * 光害の空を容器に描き始め、後始末の関数を返す。
 *
 * ページ遷移（ClientRouter）で /works/ を離れるとき、呼び出し側（motion/islands.ts）が
 * この関数を呼ぶ。止めずに放っておくと、DOM から外れた canvas に向けて
 * requestAnimationFrame と WebGL コンテキストが回り続ける。
 * 何度呼んでもよい。初期化しなかった場合（ソフトウェア描画・初期化済み）は何もしない関数を返す。
 */
export function initSky(container: HTMLElement): Cleanup {
  // すでにこの容器で描いているなら、二つ目は作らない（後始末は最初の持ち主が持つ）
  if (activeContainers.has(container)) return noop;

  /*
    alpha: true。空は夜景の写真の上（カードの下）に重ねる光だけを描き、
    光のないところは透明にする（地を塗ると夜景を隠してしまう）。
  */
  const renderer = new Renderer({
    dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    alpha: true,
  });
  const gl = renderer.gl;

  // canvas を挿す前に判定し、ソフトウェア描画なら何も足さずに撤退する
  if (isSoftwareRenderer(gl)) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return noop;
  }

  activeContainers.add(container);

  gl.canvas.style.display = 'block';
  gl.canvas.style.width = '100%';
  gl.canvas.style.height = '100%';
  container.appendChild(gl.canvas);

  const geometry = new Triangle(gl);
  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      u_time: { value: 0 },
      u_colorSignal: { value: readColorToken('--c-signal') },
    },
  });
  const mesh = new Mesh(gl, { geometry, program });

  function resize() {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  const start = performance.now();
  let rafId: number | null = null;
  let lastDraw = 0;
  let disposed = false;

  /*
    時間係数が u_time * 0.02 と極端に遅いので、60fps で回す意味がない。
    描画を間引いても見た目は変わらず、GPU/ラスタライズ負荷だけが下がる。
  */
  const FRAME_INTERVAL_MS = 1000 / 20;

  function frame(now: number) {
    if (disposed) return;
    if (now - lastDraw >= FRAME_INTERVAL_MS) {
      lastDraw = now;
      program.uniforms.u_time.value = (now - start) / 1000;
      renderer.render({ scene: mesh });
    }
    rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (!disposed && rafId === null) rafId = requestAnimationFrame(frame);
  }

  function pause() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // タブが非アクティブのときは rAF を止める
  function onVisibilityChange() {
    if (document.hidden) pause();
    else play();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  play();

  return () => {
    if (disposed) return;
    disposed = true;
    pause();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    gl.canvas.remove();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    activeContainers.delete(container);
  };
}
