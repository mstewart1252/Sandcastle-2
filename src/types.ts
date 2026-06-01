export type Profession = 'Builder' | 'Digger' | 'Scout' | 'Warrior' | 'Forager' | 'Elder';

export type TraitName =
  | 'Devout' | 'Ambitious' | 'Romantic' | 'Cowardly'
  | 'Heroic' | 'Treacherous' | 'Wise' | 'Glutton' | 'Paranoid';

export type RelationshipType = 'Friend' | 'Rival' | 'Romantic' | 'Mentor' | 'Enemy';

export type TaskType =
  | 'Dig' | 'RaiseWall' | 'Gather' | 'Patrol' | 'Rest'
  | 'Ritual' | 'Recruit' | 'Sabotage' | 'Idle';

export type StoryCategory =
  | 'Romance' | 'Betrayal' | 'Heroism' | 'Political'
  | 'Tragedy' | 'Comedy' | 'Prophecy' | 'Redemption';

export type WaveType = 'Lapping' | 'Surge' | 'KingTide' | 'RogueWave';

export type SectorPosition = 'North' | 'South' | 'East' | 'West' | 'Core';

export type Intensity = 'low' | 'medium' | 'high' | 'legendary';

export interface RelationshipEdge {
  targetCrabId: string;
  type: RelationshipType;
  strength: number; // 0-100
  formativeEvents: string[];
}

export interface CrabStats {
  strength: number;
  speed: number;
  stamina: number;
  faith: number;
  loyalty: number;
}

export interface Crab {
  id: string;
  name: string;
  profession: Profession;
  traits: TraitName[];
  stats: CrabStats;
  relationships: RelationshipEdge[];
  currentTask: TaskType;
  targetSectorId: string | null;
  isAlive: boolean;
  isTraitor: boolean;
  griefTimer: number; // seconds of grief remaining
  storyMoments: string[];
}

export interface CastleSector {
  id: string;
  position: SectorPosition;
  hp: number;
  maxHp: number;
  height: number; // wall height, used for visual and damage reduction
  hasMoat: boolean;
  moatDepth: number; // 0-100
  assignedCrabs: string[];
}

export interface StoryEvent {
  id: string;
  category: StoryCategory;
  text: string;
  involvedCrabIds: string[];
  triggeredAt: number; // game time in seconds
  intensity: Intensity;
}

export interface WaveEvent {
  type: WaveType;
  targetSectorId: string;
  damage: number;
  eta: number; // seconds until impact
  announced: boolean;
}

export interface Resources {
  shells: number;
  kelp: number;
  pebbles: number;
}

export interface SchismData {
  leaderId: string;
  factionMemberIds: string[];
  startedAt: number;
}

export interface RunScore {
  survivalTime: number;
  crabsSaved: number;
  storyCount: number;
  peakFaith: number;
}

export interface GameState {
  phase: 'menu' | 'running' | 'paused' | 'gameover';
  crabs: Map<string, Crab>;
  sectors: Map<string, CastleSector>;
  resources: Resources;
  faith: number;
  tideLevel: number; // 0-100 where 100 = full tide
  gameTime: number; // elapsed seconds
  tideCountdownSeconds: number; // seconds until full tide (counts down)
  narrativeEvents: StoryEvent[];
  incomingWave: WaveEvent | null;
  schism: SchismData | null;
  decreeOnCooldown: boolean;
  decreeCooldownRemaining: number;
  score: RunScore;
}

export interface EventTemplate {
  id: string;
  category: StoryCategory;
  intensity: Intensity;
  template: string;
  cooldownSeconds: number;
  prerequisites: (state: GameState) => { valid: boolean; crabs: Crab[] };
}
