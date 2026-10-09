# ASCII Simulation: render prototype

This is a look test for a tactical isometric RPG set inside a machine-run ASCII simulation. The whole scene is rendered in 3D (Three.js) and then turned into ASCII by a custom 2-pass shader. There is no game logic.

## Run
    pnpm install
    pnpm dev                           # http://localhost:5173
    pnpm build && pnpm capture         # headless screenshots + 8s MP4 into shots/ (uses /usr/bin/google-chrome + SwiftShader)

URL params: `?cell=8` (cell width px), `?zoom=1.6`, `?still` (no auto-orbit), `?hidehud`.

## Controls
`+`/`-` cell size · drag or arrow keys: orbit/tilt · mouse wheel: zoom · `O` auto-orbit · `G` glitch · `R` code rain · `E` directional edge glyphs · `H` HUD

## How the ASCII works (src/ascii.ts)
1. The scene is rendered to a full-res target with color and depth. Unit materials write alpha 0.5, the environment writes 1, and the void writes 0 (`tagUnit` in scene.ts).
2. **Pass A** runs once per character cell (a cols x rows target). It takes 5x5 samples per cell to get coverage, average color, luminance and depth range. From those it picks a glyph:
   - a luminance ramp ` .:-=+*#%@`
   - directional edge glyphs `| / _ \` where depth jumps
   - Matrix code rain in empty cells
   - scrambled or displaced glitch blocks
   Environment colors get graded to Matrix green. Units keep their own hue, always get dense glyphs, and the cells around them are darkened (a halo) so they stand out from the floor.
3. **Pass B** draws each glyph from a canvas-generated font atlas, tinted with the cell color, then adds a light scanline and vignette.

## Assets
- `public/models/RobotExpressive.glb`: "RobotExpressive" by Tomás Laulhé (Quaternius), CC0 1.0, from the three.js examples repo (modified by Don McCurdy). Used for the red/orange machine units.
- The party humans are built in code from primitives (src/units.ts) and animated procedurally.
