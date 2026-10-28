// Пиксельный пост-эффект: сцена рендерится в маленький буфер, потом
// растягивается без сглаживания, квантуется по цвету, обводится по глубине,
// а там, где геометрии нет, рисуется небо с луной и звёздами.
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform sampler2D tDiffuse; uniform sampler2D tDepth;
uniform vec2 res; uniform float time; uniform float edge; uniform float levels; uniform float aspect;
varying vec2 vUv;
float bayer2(vec2 a){ a = floor(a); return fract(a.x/2.0 + a.y*a.y*0.75); }
float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
void main(){
  vec2 px = floor(vUv*res);
  vec2 uv = (px+0.5)/res;
  vec4 c = texture2D(tDiffuse, uv);
  float d = texture2D(tDepth, uv).r;
  vec3 col;
  if (d > 0.99999) {
    // небо
    vec2 s = vec2(uv.x*aspect, uv.y);
    vec3 top = vec3(0.04,0.02,0.09), bot = vec3(0.26,0.10,0.32);
    col = mix(bot, top, smoothstep(0.0, 1.0, uv.y));
    vec2 m = vec2(0.80*aspect, 0.80);
    float r = length(s - m);
    if (r < 0.075) { float crat = hash(floor((s-m)*60.0)); col = vec3(0.96,0.90,0.72) - (crat > 0.86 ? 0.12 : 0.0); }
    else if (r < 0.11) col += vec3(0.25,0.18,0.12) * (1.0 - (r-0.075)/0.035) * 0.6;
    float st = hash(floor(s*140.0));
    if (st > 0.992 && uv.y > 0.35) col += vec3(0.9) * (0.4 + 0.6*abs(sin(time*2.0 + st*90.0)));
  } else {
    col = pow(max(c.rgb, 0.0), vec3(1.0/2.2)); // буфер линейный, экран sRGB
    vec2 o = 1.0/res;
    float dl = texture2D(tDepth, uv - vec2(o.x,0.0)).r, dr = texture2D(tDepth, uv + vec2(o.x,0.0)).r;
    float du = texture2D(tDepth, uv + vec2(0.0,o.y)).r, dd = texture2D(tDepth, uv - vec2(0.0,o.y)).r;
    float far = max(max(dl,dr),max(du,dd)) - d;
    if (far > edge) col *= 0.45;
    float dith = (bayer4(px) - 0.5) * 0.6 / levels;
    col = floor((col + dith) * levels + 0.5) / levels;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class PixelPass {
  constructor(renderer, pixelSize = 3) {
    this.renderer = renderer; this.pixelSize = pixelSize;
    this.rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: new THREE.DepthTexture(2, 2) });
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, res: { value: new THREE.Vector2(2, 2) }, time: { value: 0 }, edge: { value: 0.0007 }, levels: { value: 12 }, aspect: { value: 1 } } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    const rw = Math.max(64, Math.floor(w / this.pixelSize)), rh = Math.max(64, Math.floor(h / this.pixelSize));
    this.rt.setSize(rw, rh);
    this.mat.uniforms.res.value.set(rw, rh);
    this.mat.uniforms.aspect.value = rw / rh;
  }
  setPixelSize(p) { this.pixelSize = p; this.setSize(this.w, this.h); }
  render(scene, camera, t) {
    const r = this.renderer;
    this.mat.uniforms.time.value = t;
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, camera);
    r.setRenderTarget(null); r.render(this.qScene, this.qCam);
  }
}
