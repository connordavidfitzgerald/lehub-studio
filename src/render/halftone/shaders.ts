export const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

export const FRAG = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2  uResolution;  // output size in px
uniform float uDotScale;    // halftone cell size in px
uniform float uContrast;
uniform float uBrightness;
uniform float uSaturation;
uniform float uShadows;      // -1..1, lift/deepen dark tones
uniform float uHighlights;   // -1..1, brighten/recover bright tones
uniform vec4  uAngles;       // C, M, Y, K in radians
uniform float uSharpness;    // 0 = crisp dots, 1 = soft

vec3 adjust(vec3 c) {
  c *= uBrightness;
  c = (c - 0.5) * uContrast + 0.5;

  // Shadows / highlights: luminance-weighted masks so each targets one end.
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float sMask = 1.0 - smoothstep(0.0, 0.5, l); // strong in darks
  float hMask = smoothstep(0.5, 1.0, l);       // strong in brights
  c += uShadows * sMask + uHighlights * hMask;

  float l2 = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l2), c, uSaturation);
  return clamp(c, 0.0, 1.0);
}

vec2 rot(vec2 p, float a) {
  float s = sin(a), co = cos(a);
  return vec2(p.x * co - p.y * s, p.x * s + p.y * co);
}

// Coverage 0..1 for one ink channel at this fragment.
float screen(float value, float angle, vec2 fragPx) {
  vec2 p = rot(fragPx, angle);
  vec2 cell = mod(p, uDotScale) - uDotScale * 0.5;
  float dist = length(cell);
  float radius = sqrt(clamp(value, 0.0, 1.0)) * uDotScale * 0.5 * 1.15;
  float aa = max(mix(0.75, uDotScale * 0.5, uSharpness), 0.5);
  return 1.0 - smoothstep(radius - aa, radius + aa, dist);
}

void main() {
  vec3 rgb = adjust(texture2D(uImage, vUv).rgb);

  // RGB -> CMYK
  float k = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
  float invK = 1.0 - k;
  vec3 cmy = invK > 0.0001 ? (vec3(1.0) - rgb - k) / invK : vec3(0.0);

  vec2 fragPx = vUv * uResolution;
  float dc = screen(cmy.x, uAngles.x, fragPx);
  float dm = screen(cmy.y, uAngles.y, fragPx);
  float dy = screen(cmy.z, uAngles.z, fragPx);
  float dk = screen(k,     uAngles.w, fragPx);

  // Subtractive recombination on white paper: each ink subtracts one channel.
  vec3 outc = vec3(1.0);
  outc *= 1.0 - vec3(1.0, 0.0, 0.0) * dc; // cyan absorbs red
  outc *= 1.0 - vec3(0.0, 1.0, 0.0) * dm; // magenta absorbs green
  outc *= 1.0 - vec3(0.0, 0.0, 1.0) * dy; // yellow absorbs blue
  outc *= 1.0 - dk;                        // black
  gl_FragColor = vec4(outc, 1.0);
}
`
