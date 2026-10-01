precision mediump float;

uniform float u_time;
uniform vec3 u_colorSignal;

varying vec2 v_uv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// 低周波のfBm（オクターブ3）。都市の光害が雲に滲むゆっくりした揺らぎ。
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * valueNoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = v_uv;
  // 気づかれない速度。「呼吸している」と気づかれないくらい遅く。
  float t = u_time * 0.02;

  float n = fbm(uv * 2.5 + vec2(0.0, t));

  // 画面下端から上に向かって減衰する --c-signal の光
  float gradient = pow(clamp(1.0 - uv.y, 0.0, 1.0), 3.0);
  float intensity = gradient * (0.55 + 0.45 * n);

  // 光害は控えめに。空は装飾で、上に載る看板と文字より目立たせないための上限。
  intensity *= 0.32;

  // 光だけを描き、光の強さをそのまま不透明度にする。光のないところは透明で、
  // 下の夜景の写真がそのまま見える（renderer は alpha: true）。
  gl_FragColor = vec4(u_colorSignal, clamp(intensity, 0.0, 1.0));
}
