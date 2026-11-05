# ASCII Simulation

A tactical isometric battle drawn as ASCII. The scene is rendered in 3D with Three.js, then a custom 2-pass shader turns it into glyphs.

Two pages share that picture:

- `/` is the look test: humans and robots on a diorama, no fight.
- `/battle.html` is a hotseat battle. You play the party. The machines take their turns after yours.

## Run

```sh
pnpm install
pnpm dev                            # http://localhost:5173
pnpm test
pnpm build && pnpm capture          # headless screenshots + an 8s MP4 in shots/
```

`pnpm capture` uses `/usr/bin/google-chrome` and SwiftShader. The fight is at `http://localhost:5173/battle.html`.

Both pages take `?cell=8` (cell width in px), `?zoom=1.6`, `?still` (no auto-orbit), and `?hidehud`.

## Controls

`+`/`-` cell size. Drag or the arrow keys orbit and tilt. The wheel zooms. `O` toggles auto-orbit. `G` toggles glitch. `R` toggles code rain. `E` toggles directional edge glyphs. `B` toggles the cell background. It starts on. `H` hides the HUD.

On the battle page, a short click selects a highlighted tile or an enemy. A second click on the same target confirms the move or the strike. A drag orbits and does not give an order. **End turn** ends the active party unit's turn.

## Battle

The board is one fixed encounter. Party units `a` and `b` are the human model. Machine units `c` and `d` are the robots. A move walks an orthogonal path, and each step costs 1 action point. A strike hits an orthogonal neighbour and costs 2. Walks and strikes play back on the figures. A strike plays the punch clip and puts a small glitch on the target. After the party unit ends its turn, the machines act on their own.

## How the ASCII works (`src/ascii.ts`)

1. The scene is rendered to a full-resolution target with color and depth. Unit materials write alpha 0.5, the environment writes 1, and the void writes 0 (`tagUnit` in `src/scene.ts`).
2. **Pass A** runs once per character cell. It takes 5×5 samples per cell for coverage, average color, luminance, and depth range, then picks a glyph:
   - a luminance ramp ` .:-=+*#%@`
   - directional edge glyphs `| / _ \` where depth jumps
   - Matrix code rain in empty cells
   - scrambled or displaced glitch blocks

   Environment colors are graded to Matrix green. Units keep their own hue, always get dense glyphs, and the cells around them are darkened so they separate from the floor. A scene cell stores its glyph index plus a high bit. Void and rain do not.
3. **Pass B** draws each glyph from a canvas font atlas. With the background on, a scene cell is filled with half its color and the glyph is drawn lighter on top. Void stays black, and rain stays falling glyphs. With the background off, the cell is only the tinted glyph plus a faint wash. A light scanline and vignette come last.

## Assets

- `public/models/RobotExpressive.glb`: "RobotExpressive" by Tomás Laulhé (Quaternius), CC0 1.0, from the three.js examples repo (modified by Don McCurdy). Used for the red and orange machine units.
- `public/models/Human.glb`: Quaternius Universal Animation Library, CC0 1.0. One skinned humanoid from that library, with three clips renamed Idle, Walking, and Punch (source names Idle_Loop, Walk_Loop, Punch_Jab). The rest of the library is not included. Used for both party figures.

## License

The project is PolyForm Strict License 1.0.0. See `LICENSE`. The two model files above stay CC0 1.0 and are not covered by that license.
