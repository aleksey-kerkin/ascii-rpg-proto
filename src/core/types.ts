export const MOVE_COST = 1;
export const ATTACK_COST = 2;

export type Coord = { readonly x: number; readonly y: number };

export type Cell = {
  readonly height: number;
  readonly wall: boolean;
  readonly cover: number;
};

export type TeamId = string;

export type Unit = {
  readonly id: string;
  readonly team: TeamId;
  readonly pos: Coord;
  readonly hp: number;
  readonly maxHp: number;
  readonly ap: number;
  readonly maxAp: number;
  readonly accuracy: number;
  readonly damage: number;
  readonly alive: boolean;
};

export type SetupUnit = {
  readonly id: string;
  readonly team: TeamId;
  readonly pos: Coord;
  readonly hp: number;
  readonly maxHp: number;
  readonly maxAp: number;
  readonly accuracy: number;
  readonly damage: number;
};

export type GameMap = {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly Cell[];
};

export type RngState = { readonly seed: number; readonly cursor: number };

export type BattleStatus =
  | { readonly kind: 'ongoing' }
  | { readonly kind: 'decided'; readonly winner: TeamId };

export type BattleState = {
  readonly map: GameMap;
  readonly units: readonly Unit[];
  readonly round: number;
  readonly queue: readonly string[];
  readonly activeIndex: number;
  readonly rng: RngState;
  readonly status: BattleStatus;
};

export type Command =
  | { readonly type: 'move'; readonly unitId: string; readonly to: Coord }
  | { readonly type: 'attack'; readonly unitId: string; readonly targetId: string }
  | { readonly type: 'endTurn'; readonly unitId: string };

export type BattleEvent =
  | { readonly type: 'roundStarted'; readonly round: number; readonly queue: readonly string[] }
  | { readonly type: 'turnStarted'; readonly unitId: string; readonly ap: number }
  | { readonly type: 'moved'; readonly unitId: string; readonly from: Coord; readonly to: Coord; readonly ap: number }
  | { readonly type: 'attacked'; readonly unitId: string; readonly targetId: string; readonly hit: boolean; readonly roll: number; readonly chance: number; readonly damage: number; readonly targetHp: number }
  | { readonly type: 'unitDown'; readonly unitId: string }
  | { readonly type: 'turnEnded'; readonly unitId: string }
  | { readonly type: 'battleDecided'; readonly winner: TeamId };

export type ApplyErrorCode =
  | 'battle-over'
  | 'unknown-unit'
  | 'not-active'
  | 'not-enough-ap'
  | 'out-of-bounds'
  | 'not-adjacent'
  | 'wall'
  | 'occupied'
  | 'climb'
  | 'unknown-target'
  | 'dead-target'
  | 'same-team'
  | 'no-sight';

export type SetupErrorCode =
  | 'bad-seed'
  | 'bad-map'
  | 'bad-cell'
  | 'bad-unit'
  | 'bad-placement'
  | 'need-two-teams';

export type ApplyResult =
  | { readonly ok: true; readonly state: BattleState; readonly events: readonly BattleEvent[] }
  | { readonly ok: false; readonly error: ApplyErrorCode; readonly state: BattleState };

export type CreateResult =
  | { readonly ok: true; readonly state: BattleState }
  | { readonly ok: false; readonly error: SetupErrorCode };

export type BattleSetup = {
  readonly seed: number;
  readonly map: GameMap;
  readonly units: readonly SetupUnit[];
};
