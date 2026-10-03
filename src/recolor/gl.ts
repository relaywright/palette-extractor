import { GAMUT_SLACK, GAMUT_STEPS } from "./oklab";
import { MAX_COLORS, type RecolorModel } from "./math";
import type { LayerRenderer } from "./renderer";

// The same math as math.ts and oklab.ts, one pixel per invocation: sRGB to
// OKLab, the weighted shift, then back with chroma pulled toward gray until
// the color fits the sRGB gamut.
const VERTEX = `#version 300 es
uniform vec2 uCover;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  // Row 0 of the upload is the top of the photo; uCover crops it like
  // object-fit: cover.
  vUv = 0.5 + (vec2(p.x, 1.0 - p.y) - 0.5) * uCover;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform int uCount;
uniform vec3 uOrigin[${MAX_COLORS}];
uniform vec3 uShift[${MAX_COLORS}];
uniform float uSharpness;
in vec2 vUv;
out vec4 outColor;

vec3 toLinear(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92,
             lessThanEqual(c, vec3(0.04045)));
}
vec3 toOklab(vec3 c) {
  vec3 q = toLinear(c);
  float l = pow(0.4122214708 * q.r + 0.5363325363 * q.g + 0.0514459929 * q.b, 1.0 / 3.0);
  float m = pow(0.2119034982 * q.r + 0.6806995451 * q.g + 0.1073969566 * q.b, 1.0 / 3.0);
  float s = pow(0.0883024619 * q.r + 0.2817188376 * q.g + 0.6299787005 * q.b, 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
}
vec3 oklabToLinear(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.291485548 * lab.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
}
bool inGamut(vec3 c) {
  return all(greaterThanEqual(c, vec3(-${GAMUT_SLACK}))) &&
         all(lessThanEqual(c, vec3(${1 + GAMUT_SLACK})));
}
vec3 toSrgb(vec3 lab) {
  lab.x = clamp(lab.x, 0.0, 1.0);
  vec3 lin = oklabToLinear(lab);
  if (!inGamut(lin)) {
    float low = 0.0;
    float high = 1.0;
    for (int i = 0; i < ${GAMUT_STEPS}; i++) {
      float mid = (low + high) * 0.5;
      if (inGamut(oklabToLinear(vec3(lab.x, lab.yz * mid)))) low = mid;
      else high = mid;
    }
    lin = oklabToLinear(vec3(lab.x, lab.yz * low));
  }
  lin = clamp(lin, 0.0, 1.0);
  return mix(1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, 12.92 * lin,
             lessThanEqual(lin, vec3(0.0031308)));
}

void main() {
  vec4 texel = texture(uImage, vUv);
  vec3 lab = toOklab(texel.rgb);
  float nearest = 1e9;
  float distances[${MAX_COLORS}];
  for (int i = 0; i < ${MAX_COLORS}; i++) {
    if (i >= uCount) break;
    vec3 d = lab - uOrigin[i];
    distances[i] = dot(d, d);
    nearest = min(nearest, distances[i]);
  }
  float total = 0.0;
  vec3 shift = vec3(0.0);
  for (int i = 0; i < ${MAX_COLORS}; i++) {
    if (i >= uCount) break;
    float w = exp(-(distances[i] - nearest) * uSharpness);
    total += w;
    shift += w * uShift[i];
  }
  if (uCount == 0 || shift == vec3(0.0)) {
    outColor = texel;
    return;
  }
  outColor = vec4(toSrgb(lab + shift / total), texel.a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Recolor shader failed: ${log}`);
  }
  return shader;
}

// A phone's pixel ratio times a wide frame stays well under this; it only
// bounds a huge window.
const MAX_SIDE = 2400;

/**
 * Recolors the photo on the GPU at the size it is shown. Null when the
 * browser has no WebGL2 or the photo cannot be uploaded (an image from
 * another origin without CORS), which sends the caller to the 2D fallback.
 */
export function createGlRenderer(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  onLost: () => void,
): LayerRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    antialias: false,
  });
  if (!gl) return null;
  const program = gl.createProgram()!;
  const shaders = [
    compile(gl, gl.VERTEX_SHADER, VERTEX),
    compile(gl, gl.FRAGMENT_SHADER, FRAGMENT),
  ];
  for (const shader of shaders) gl.attachShader(program, shader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error("Recolor program failed to link.");
  gl.useProgram(program);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  } catch {
    return null;
  }
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const at = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    cover: at("uCover"),
    count: at("uCount"),
    origin: at("uOrigin"),
    shift: at("uShift"),
    sharpness: at("uSharpness"),
  };
  const origin = new Float32Array(MAX_COLORS * 3);
  const shift = new Float32Array(MAX_COLORS * 3);

  let model: RecolorModel | null = null;
  let frame = 0;
  let dead = false;

  const resize = () => {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.min(
      MAX_SIDE,
      Math.max(1, Math.round(canvas.clientWidth * ratio)),
    );
    const height = Math.min(
      MAX_SIDE,
      Math.max(1, Math.round(canvas.clientHeight * ratio)),
    );
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    // The share of the photo that shows along each axis under object-fit:
    // cover, so the canvas can be sized to the frame instead of the photo.
    const photo = image.naturalWidth / image.naturalHeight;
    const box = canvas.width / canvas.height;
    gl.uniform2f(
      uniforms.cover,
      box > photo ? 1 : box / photo,
      box > photo ? photo / box : 1,
    );
  };

  const paint = () => {
    frame = 0;
    if (dead) return;
    resize();
    const count = model?.origins.length ?? 0;
    gl.uniform1i(uniforms.count, count);
    if (model) {
      model.origins.forEach((o, i) => origin.set([o.L, o.a, o.b], i * 3));
      model.shifts.forEach((s, i) => shift.set([s.L, s.a, s.b], i * 3));
      gl.uniform3fv(uniforms.origin, origin);
      gl.uniform3fv(uniforms.shift, shift);
      gl.uniform1f(uniforms.sharpness, model.sharpness);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.dataset.recolorDraws = String(
      Number(canvas.dataset.recolorDraws ?? 0) + 1,
    );
  };

  const lost = (event: Event) => {
    event.preventDefault();
    dead = true;
    onLost();
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.dataset.recolorMode = "webgl";

  return {
    draw(next) {
      model = next;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    resize() {
      if (!frame) frame = requestAnimationFrame(paint);
    },
    destroy() {
      dead = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", lost);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      for (const shader of shaders) gl.deleteShader(shader);
    },
  };
}
