import * as THREE from 'three';
import { buildAtlas, EDGE_START, RAIN_START, RAIN_COUNT, RAMP } from './atlas';

/**
 * Two-pass ASCII post-process.
 *  Pass A (one fragment per character cell): analyses the scene pixels under the cell
 *    -> picks a glyph (luminance ramp / directional edge / rain / glitch) and a tint.
 *  Pass B (full screen): draws the chosen glyph from a font atlas, tinted.
 * Unit pixels are tagged by the scene with alpha 0.5 (env = 1, void = 0), so units
 * keep their saturated colour and get denser glyphs for readability.
 */
const HASH = /* glsl */ `
float h11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec4 h42(vec2 p){ vec4 p4 = fract(vec4(p.xyxy)*vec4(.1031,.1030,.0973,.1099)); p4 += dot(p4, p4.wzxy+33.33); return fract((p4.xxyz+p4.yzzw)*p4.zywx); }
`;

const analyseFrag = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 res;       // scene RT size in px
uniform vec2 cellPx;    // cell size in px
uniform vec2 grid;      // cols, rows
uniform float time;
uniform float rainAmt;
uniform float glitchAmt;
uniform float edgeOn;
uniform float depthThr;
uniform float gain;
uniform float haloDim;
uniform float patchOn;
uniform vec2 patchCenter;
uniform float patchRadius;
${HASH}
const float EDGE0 = ${EDGE_START}.0;
const float RAIN0 = ${RAIN_START}.0;
const float RAINN = ${RAIN_COUNT}.0;
const float RAMPN = ${RAMP.length}.0;
const vec3 MATRIX = vec3(0.18, 1.0, 0.42);

float rainGlyph(vec2 cell, float rate){
  float k = floor(time*rate + h21(cell)*7.0);
  return RAIN0 + floor(h21(cell + k*1.37) * RAINN);
}

void main(){
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 sCell = cell;

  // ---- glitch blocks: displaced + scrambled rectangles, re-rolled ~9x/sec
  float slot = floor(time*9.0);
  float glitched = 0.0;
  for(int i=0;i<4;i++){
    vec4 h = h42(vec2(slot, float(i)*17.3));
    if(h.x < glitchAmt){
      vec4 g = h42(vec2(slot*1.91 + 3.0, float(i)*5.1));
      vec2 sz = vec2(3.0 + floor(g.z*16.0), 1.0 + floor(g.w*3.0));
      vec2 pos = floor(g.xy * grid);
      if(cell.x>=pos.x && cell.y>=pos.y && cell.x<pos.x+sz.x && cell.y<pos.y+sz.y){
        glitched = 1.0;
        sCell.x += floor((h.w-0.5)*10.0);
      }
    }
  }
  if(patchOn > 0.5 && distance(cell, patchCenter) <= patchRadius){
    glitched = 1.0;
    sCell.x += floor((h21(cell + slot) - 0.5) * 8.0);
  }

  // ---- gather scene samples under the cell
  const int N = 5;
  vec3 acc = vec3(0.0); float cov = 0.0; float unit = 0.0;
  float dmin = 1.0, dmax = 0.0;
  vec2 gD = vec2(0.0);
  float dMean = 0.0;
  for(int y=0;y<N;y++) for(int x=0;x<N;x++){
    vec2 o = (vec2(float(x),float(y))+0.5)/float(N);
    vec2 uv = (sCell + o) * cellPx / res;
    vec4 c = texture2D(tColor, uv);
    float d = texture2D(tDepth, uv).r;
    float obj = step(0.1, c.a);
    float isUnit = obj * (1.0 - step(0.75, c.a));
    d = mix(1.0, d, obj);
    acc += c.rgb * obj; cov += obj; unit += isUnit;
    dmin = min(dmin, d); dmax = max(dmax, d);
    vec2 w = o - 0.5;
    gD += w * d;
  }
  float S = float(N*N);
  cov /= S; unit /= S;

  vec3 outC; float glyph = 0.0;

  if(cov < 0.28){
    // ---- void: faint falling code
    float col = sCell.x;
    float colOn = step(0.45, h11(col*3.17));
    float speed = 6.0 + h11(col*1.7)*14.0;
    float len = 6.0 + h11(col*9.1)*18.0;
    float span = grid.y + len + 20.0;
    float head = mod(time*speed + h11(col)*span, span);
    float fromTop = grid.y - 1.0 - cell.y;
    float dist = head - fromTop;
    glyph = 0.0; outC = vec3(0.0);
    if(colOn > 0.5 && dist >= 0.0 && dist < len){
      float k = 1.0 - dist/len;
      glyph = rainGlyph(cell, 10.0);
      outC = mix(MATRIX*0.55, vec3(0.75,1.0,0.8), step(dist, 0.5)) * k * rainAmt;
    }
  } else {
    vec3 c = pow(acc / max(cov*S, 1.0), vec3(1.0/2.2));   // linear -> display
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float sat = (mx - mn) / max(mx, 1e-4);
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 hue = c / max(mx, 1e-4);
    bool isUnit = unit > 0.22;

    float L = clamp(lum * gain, 0.0, 1.0);
    if(isUnit){
      L = clamp(0.45 + mx*0.7, 0.0, 1.0);                      // units: always dense glyphs
      outC = hue * (0.75 + 0.5*mx);
    } else {
      // matrix grade: desaturated surfaces collapse to green, saturated (emissive) keep hue
      vec3 graded = mix(MATRIX, hue, smoothstep(0.35, 0.9, sat) * 0.6);
      outC = graded * (0.22 + 0.95*pow(L, 0.85));
      // halo: darken environment cells touching a unit so silhouettes separate from the floor
      float near = 0.0;
      for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
        vec2 uv = (sCell + vec2(float(i),float(j)) + 0.5) * cellPx / res;
        float a = texture2D(tColor, uv).a;
        near = max(near, step(0.1, a) * (1.0 - step(0.75, a)));
      }
      if(near > 0.5){ outC *= haloDim; glyph = -1.0; }
    }
    float keep = glyph;
    glyph = clamp(floor(L * (RAMPN - 1.0) + 0.5), 1.0, RAMPN - 1.0);
    if(keep < -0.5) glyph = 1.0;

    // ---- directional edges from depth discontinuities inside the cell
    float range = dmax - dmin;
    if(edgeOn > 0.5 && range > depthThr && cov > 0.35){
      vec2 g = normalize(gD + 1e-6);
      float a = atan(g.y, g.x);                     // gradient direction
      float q = mod(floor(a / 0.785398 + 0.5), 4.0);  // 0:-x/+x 1:diag 2:y 3:anti-diag
      // edge line is perpendicular to the gradient
      float e = q == 0.0 ? 0.0 : (q == 1.0 ? 3.0 : (q == 2.0 ? 2.0 : 1.0));
      glyph = EDGE0 + e;
      outC *= isUnit ? 1.1 : 1.25;
    }
  }

  if(glitched > 0.5){
    float r = h21(cell + slot*0.73);
    if(r < 0.55){ glyph = rainGlyph(cell, 30.0); outC = mix(outC, vec3(0.7,1.0,0.75), 0.6) + vec3(0.05,0.25,0.08); }
    else if(r < 0.65){ outC = outC.gbr * 1.3; }
  }

  gl_FragColor = vec4(clamp(outC, 0.0, 1.0), glyph / 255.0);
}
`;

const drawFrag = /* glsl */ `
precision highp float;
uniform sampler2D tCells;
uniform sampler2D tAtlas;
uniform vec2 grid;
uniform vec2 cellPx;
uniform vec2 atlasGrid;
uniform float fill;
uniform vec2 res;
void main(){
  vec2 cf = gl_FragCoord.xy / cellPx;
  vec2 cell = floor(cf);
  vec2 f = fract(cf);
  vec4 d = texture2D(tCells, (cell + 0.5) / grid);
  float g = floor(d.a * 255.0 + 0.5);
  vec2 ac = vec2(mod(g, atlasGrid.x), floor(g / atlasGrid.x));
  vec2 auv = vec2((ac.x + f.x) / atlasGrid.x, 1.0 - (ac.y + 1.0 - f.y) / atlasGrid.y);
  float m = texture2D(tAtlas, auv).r;
  vec3 col = d.rgb * m * 1.15 + d.rgb * fill * step(0.5, g);
  // subtle CRT: scanline + vignette
  float scan = 0.93 + 0.07 * sin(gl_FragCoord.y * 3.14159);
  vec2 uv = gl_FragCoord.xy / res - 0.5;
  float vig = 1.0 - dot(uv, uv) * 0.55;
  gl_FragColor = vec4(col * scan * vig, 1.0);
}
`;

const vert = /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class AsciiPass {
  sceneRT: THREE.WebGLRenderTarget;
  cellRT: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  analyse: THREE.ShaderMaterial;
  draw: THREE.ShaderMaterial;
  cellSize = 10; // px width; height = 4/3 width
  width = 1; height = 1; pixelRatio = 1;
  grid = new THREE.Vector2(1, 1);

  constructor(private renderer: THREE.WebGLRenderer) {
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.cellRT = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const atlas = buildAtlas();
    this.analyse = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: analyseFrag, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: this.sceneRT.texture }, tDepth: { value: depthTexture },
        res: { value: new THREE.Vector2() }, cellPx: { value: new THREE.Vector2() }, grid: { value: this.grid },
        time: { value: 0 }, rainAmt: { value: 0.6 }, glitchAmt: { value: 0.35 }, edgeOn: { value: 1 },
        depthThr: { value: 0.008 }, gain: { value: 1.15 }, haloDim: { value: 0.45 },
        patchOn: { value: 0 },
        patchCenter: { value: new THREE.Vector2() },
        patchRadius: { value: 3 },
      },
    });
    this.draw = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: drawFrag, depthTest: false, depthWrite: false,
      uniforms: {
        tCells: { value: this.cellRT.texture }, tAtlas: { value: atlas.texture }, grid: { value: this.grid },
        cellPx: { value: new THREE.Vector2() }, atlasGrid: { value: new THREE.Vector2(atlas.cols, atlas.rows) },
        fill: { value: 0.07 }, res: { value: new THREE.Vector2() },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.analyse);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(w: number, h: number, pr: number) {
    this.width = w; this.height = h; this.pixelRatio = pr;
    this.sceneRT.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.updateCells();
  }

  setCellSize(px: number) { this.cellSize = Math.max(4, Math.min(32, px)); this.updateCells(); }

  setPatch(cell: { x: number; y: number } | null) {
    const on = this.analyse.uniforms.patchOn;
    const center = this.analyse.uniforms.patchCenter;
    on.value = cell ? 1 : 0;
    if (cell) center.value.set(cell.x, cell.y);
  }

  private updateCells() {
    const W = Math.floor(this.width * this.pixelRatio), H = Math.floor(this.height * this.pixelRatio);
    const cw = Math.round(this.cellSize * this.pixelRatio);
    const ch = Math.round(this.cellSize * this.pixelRatio * 4 / 3);
    this.grid.set(Math.ceil(W / cw), Math.ceil(H / ch));
    this.cellRT.setSize(this.grid.x, this.grid.y);
    const u = this.analyse.uniforms, d = this.draw.uniforms;
    u.res.value.set(W, H); u.cellPx.value.set(cw, ch);
    d.cellPx.value.set(cw, ch); d.res.value.set(W, H);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, camera);
    this.analyse.uniforms.time.value = time;
    this.quad.material = this.analyse;
    r.setRenderTarget(this.cellRT);
    r.render(this.quadScene, this.quadCam);
    this.quad.material = this.draw;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
