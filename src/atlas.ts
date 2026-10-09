import * as THREE from 'three';

// Glyph layout inside the atlas. Indices are referenced from the shaders.
export const RAMP = ' .:-=+*#%@';           // 0..9  luminance ramp
export const EDGES = '|/_\\';                // 10..13 edge glyphs by direction
export const RAIN = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾜ0123456789Z:=*+<>¦'; // 14..
export const GLYPHS = RAMP + EDGES + RAIN;
export const RAMP_START = 0;
export const EDGE_START = RAMP.length;
export const RAIN_START = RAMP.length + EDGES.length;
export const RAIN_COUNT = [...RAIN].length;

export const GLYPH_W = 48;
export const GLYPH_H = 64;
export const ATLAS_COLS = 8;

export function buildAtlas(): { texture: THREE.CanvasTexture; cols: number; rows: number } {
  const chars = [...GLYPHS];
  const cols = ATLAS_COLS;
  const rows = Math.ceil(chars.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * GLYPH_W;
  canvas.height = rows * GLYPH_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const cx = (i % cols) * GLYPH_W + GLYPH_W / 2;
    const cy = Math.floor(i / cols) * GLYPH_H + GLYPH_H / 2;
    const isRain = i >= RAIN_START;
    const isEdge = i >= EDGE_START && i < RAIN_START;
    const size = isRain ? 44 : 56;
    ctx.font = `bold ${size}px "DejaVu Sans Mono", "Menlo", "Consolas", "Noto Sans CJK JP", monospace`;
    ctx.save();
    if (isEdge) { ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.strokeText(ch, cx, cy + (ch === '_' ? -6 : 2)); }
    ctx.fillText(ch, cx, cy + (ch === '_' ? -6 : 2));
    ctx.restore();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  return { texture, cols, rows };
}
