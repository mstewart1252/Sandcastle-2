import Phaser from 'phaser';
import type {
  GameState, Crab, CastleSector, Profession, TraitName,
  RelationshipType, WaveType, StoryEvent, SchismData,
} from './types';
import { getRandomName, getElderName } from './data/names';
import { TRAIT_DEFINITIONS, pickTraits } from './data/traits';

const TIDE_DURATION = 1200; // 20 min in seconds
const SURGE_INTERVAL = 60;
const LAPPING_INTERVAL = 20;
const NARRATIVE_INTERVAL = 30;
const DECREE_COOLDOWN = 45;
const INITIAL_FAITH = 70;
const INITIAL_CRABS = 7;

const PROFESSIONS: Profession[] = ['Builder', 'Digger', 'Scout', 'Warrior', 'Forager', 'Elder'];

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function roll(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createCrab(name: string, profession: Profession, traits: TraitName[]): Crab {
  const base = { strength: 50, speed: 50, stamina: 80, faith: 50, loyalty: 60 };
  for (const t of traits) {
    const mods = TRAIT_DEFINITIONS[t].statModifiers;
    for (const [k, v] of Object.entries(mods)) {
      base[k as keyof typeof base] = clamp(base[k as keyof typeof base] + (v ?? 0));
    }
  }
  // Add random variance
  for (const k of Object.keys(base) as (keyof typeof base)[]) {
    base[k] = clamp(base[k] + roll(-10, 10));
  }
  return {
    id: uid(),
    name,
    profession,
    traits,
    stats: base,
    relationships: [],
    currentTask: 'Idle',
    targetSectorId: null,
    isAlive: true,
    isTraitor: false,
    griefTimer: 0,
    storyMoments: [],
  };
}

function createSectors(): Map<string, CastleSector> {
  const positions = ['North', 'South', 'East', 'West', 'Core'] as const;
  const map = new Map<string, CastleSector>();
  for (const pos of positions) {
    const id = pos.toLowerCase();
    map.set(id, {
      id,
      position: pos,
      hp: pos === 'Core' ? 200 : 100,
      maxHp: pos === 'Core' ? 200 : 100,
      height: 3,
      hasMoat: false,
      moatDepth: 0,
      assignedCrabs: [],
    });
  }
  return map;
}

function buildInitialRelationships(crabs: Crab[]): void {
  // Generate 3-4 random initial relationships
  const pairs: [number, number][] = [];
  const types: RelationshipType[] = ['Friend', 'Rival', 'Mentor'];
  for (let i = 0; i < 4; i++) {
    const a = Math.floor(Math.random() * crabs.length);
    let b = Math.floor(Math.random() * crabs.length);
    while (b === a) b = Math.floor(Math.random() * crabs.length);
    if (pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) continue;
    pairs.push([a, b]);
    const type = types[Math.floor(Math.random() * types.length)];
    const strength = roll(20, 60);
    crabs[a].relationships.push({ targetCrabId: crabs[b].id, type, strength, formativeEvents: [] });
    const inverse: RelationshipType = type === 'Mentor' ? 'Friend' : type;
    crabs[b].relationships.push({ targetCrabId: crabs[a].id, type: inverse, strength, formativeEvents: [] });
  }
}

export class GameStore extends Phaser.Events.EventEmitter {
  state: GameState;
  private lastSurgeTime = 0;
  private lastLappingTime = 0;
  private lastNarrativeTime = 0;
  private narrativeCooldowns = new Map<string, number>();
  private usedNames = new Set<string>();

  constructor() {
    super();
    this.state = this.createInitialState();
  }

  private createInitialState(): GameState {
    return {
      phase: 'menu',
      crabs: new Map(),
      sectors: new Map(),
      resources: { shells: 50, kelp: 20, pebbles: 10 },
      faith: INITIAL_FAITH,
      tideLevel: 0,
      gameTime: 0,
      tideCountdownSeconds: TIDE_DURATION,
      narrativeEvents: [],
      incomingWave: null,
      schism: null,
      decreeOnCooldown: false,
      decreeCooldownRemaining: 0,
      score: { survivalTime: 0, crabsSaved: 0, storyCount: 0, peakFaith: INITIAL_FAITH },
    };
  }

  startRun(): void {
    this.usedNames.clear();
    this.lastSurgeTime = 0;
    this.lastLappingTime = 0;
    this.lastNarrativeTime = 0;
    this.narrativeCooldowns.clear();

    const sectors = createSectors();
    const crabs = new Map<string, Crab>();

    const professionAssignments: Profession[] = ['Builder', 'Builder', 'Digger', 'Scout', 'Forager', 'Warrior', 'Elder'];
    for (let i = 0; i < INITIAL_CRABS; i++) {
      const profession = professionAssignments[i] ?? 'Builder';
      const traits = pickTraits(2);
      const name = profession === 'Elder' ? getElderName(this.usedNames) : getRandomName(this.usedNames);
      this.usedNames.add(name);
      const crab = createCrab(name, profession, traits);
      // Set default tasks by profession
      crab.currentTask = this.defaultTaskForProfession(profession);
      crab.targetSectorId = this.defaultSectorForProfession(profession);
      crabs.set(crab.id, crab);
    }

    const crabArray = Array.from(crabs.values());
    buildInitialRelationships(crabArray);

    this.state = {
      ...this.createInitialState(),
      phase: 'running',
      crabs,
      sectors,
    };
    this.emit('stateChanged', this.state);
    this.emit('runStarted', this.state);
  }

  private defaultTaskForProfession(p: Profession): import('./types').TaskType {
    switch (p) {
      case 'Builder': return 'RaiseWall';
      case 'Digger': return 'Dig';
      case 'Scout': return 'Patrol';
      case 'Warrior': return 'Patrol';
      case 'Forager': return 'Gather';
      case 'Elder': return 'Rest';
      default: return 'Idle';
    }
  }

  private defaultSectorForProfession(p: Profession): string {
    switch (p) {
      case 'Builder': return 'south';
      case 'Digger': return 'south';
      case 'Scout': return 'north';
      case 'Warrior': return 'east';
      case 'Forager': return 'west';
      case 'Elder': return 'core';
      default: return 'core';
    }
  }

  update(deltaMs: number): void {
    if (this.state.phase !== 'running') return;
    const deltaSec = deltaMs / 1000;
    const s = this.state;

    s.gameTime += deltaSec;
    s.tideCountdownSeconds = Math.max(0, TIDE_DURATION - s.gameTime);
    s.tideLevel = clamp((s.gameTime / TIDE_DURATION) * 100);
    s.score.survivalTime = s.gameTime;
    s.score.peakFaith = Math.max(s.score.peakFaith, s.faith);

    // Decree cooldown
    if (s.decreeOnCooldown) {
      s.decreeCooldownRemaining = Math.max(0, s.decreeCooldownRemaining - deltaSec);
      if (s.decreeCooldownRemaining <= 0) s.decreeOnCooldown = false;
    }

    // Grief timers
    for (const crab of s.crabs.values()) {
      if (crab.griefTimer > 0) {
        crab.griefTimer = Math.max(0, crab.griefTimer - deltaSec);
      }
    }

    // Incoming wave countdown
    if (s.incomingWave) {
      s.incomingWave.eta -= deltaSec;
      if (s.incomingWave.eta <= 0) {
        this.applyWaveDamage(s.incomingWave.targetSectorId, s.incomingWave.damage, s.incomingWave.type);
        s.incomingWave = null;
        this.emit('waveImpact');
      }
    }

    // Spawn waves
    if (!s.incomingWave) {
      if (s.gameTime - this.lastLappingTime >= LAPPING_INTERVAL) {
        this.lastLappingTime = s.gameTime;
        this.spawnWave('Lapping');
      } else if (s.gameTime - this.lastSurgeTime >= SURGE_INTERVAL) {
        this.lastSurgeTime = s.gameTime;
        const type: WaveType = s.tideLevel > 80 ? 'KingTide' : 'Surge';
        this.spawnWave(type);
      } else if (Math.random() < 0.0003 && s.gameTime > 120) {
        this.spawnWave('RogueWave');
      }
    }

    // Crab task progress
    this.processCrabTasks(deltaSec);

    // Faith passive decay
    if (s.gameTime % 30 < deltaSec) {
      this.modifyFaith(-1);
    }

    // Kelp washing in with early waves
    if (s.tideLevel > 10 && s.gameTime % 45 < deltaSec) {
      s.resources.kelp = Math.min(999, s.resources.kelp + 2);
    }

    // Narrative evaluation
    if (s.gameTime - this.lastNarrativeTime >= NARRATIVE_INTERVAL) {
      this.lastNarrativeTime = s.gameTime;
      this.emit('narrativeEval', s);
    }

    // Schism check
    if (!s.schism && s.faith < 25) {
      this.triggerSchism();
    }

    // Survival check (tide timer expired = win)
    if (s.tideCountdownSeconds <= 0) {
      this.endRun('survived');
      return;
    }

    this.emit('stateChanged', s);
  }

  private spawnWave(type: WaveType): void {
    const s = this.state;
    const sectorIds = Array.from(s.sectors.keys()).filter(id => id !== 'core');

    let targetId: string;
    if (type === 'KingTide') {
      // Targets highest HP sector
      targetId = sectorIds.reduce((best, id) => {
        const sec = s.sectors.get(id)!;
        const bestSec = s.sectors.get(best)!;
        return sec.hp > bestSec.hp ? id : best;
      });
    } else if (type === 'Surge') {
      // Targets weakest/no-moat sector preferentially
      const noMoat = sectorIds.filter(id => !s.sectors.get(id)!.hasMoat);
      const pool = noMoat.length > 0 ? noMoat : sectorIds;
      targetId = pool[Math.floor(Math.random() * pool.length)];
    } else {
      // Lapping/Rogue: random
      targetId = sectorIds[Math.floor(Math.random() * sectorIds.length)];
    }

    const baseDamage: Record<WaveType, number> = {
      Lapping: 5,
      Surge: 20,
      KingTide: 50,
      RogueWave: 35,
    };
    const eta: Record<WaveType, number> = {
      Lapping: 3,
      Surge: 8,
      KingTide: 12,
      RogueWave: 2,
    };

    // Moat reduces damage
    const sector = s.sectors.get(targetId)!;
    let damage = baseDamage[type];
    if (sector.hasMoat) damage = Math.round(damage * (1 - sector.moatDepth / 200));

    // Heroic crabs at the sector reduce damage
    const heroicAtSector = Array.from(s.crabs.values()).filter(
      c => c.isAlive && !c.isTraitor && c.traits.includes('Heroic') && c.targetSectorId === targetId
    );
    if (heroicAtSector.length > 0) damage = Math.round(damage * 0.7);

    s.incomingWave = { type, targetSectorId: targetId, damage, eta: eta[type], announced: false };
    this.emit('waveIncoming', s.incomingWave);
  }

  private applyWaveDamage(sectorId: string, damage: number, type: WaveType): void {
    const s = this.state;
    const sector = s.sectors.get(sectorId);
    if (!sector) return;

    sector.hp = Math.max(0, sector.hp - damage);

    if (sector.hp <= 0 && sector.id !== 'core') {
      // Sector destroyed — check if core now takes overflow
      this.modifyFaith(-10);
      this.emit('sectorDestroyed', sector);
      // Damage bleeds to core
      const core = s.sectors.get('core')!;
      core.hp = Math.max(0, core.hp - 20);
      sector.hp = Math.min(20, sector.maxHp * 0.2); // Partial rebuild
    }

    if (type === 'Surge' || type === 'KingTide') {
      // Check if cowardly crabs flee
      for (const crab of s.crabs.values()) {
        if (crab.isAlive && crab.traits.includes('Cowardly') && crab.targetSectorId === sectorId) {
          crab.targetSectorId = 'core';
          crab.currentTask = 'Rest';
        }
      }
    }

    // Surge successfully survived by builders → faith up
    const buildersAtSector = Array.from(s.crabs.values()).filter(
      c => c.isAlive && !c.isTraitor && c.targetSectorId === sectorId && c.profession === 'Builder'
    ).length;
    if (buildersAtSector > 0 && sector.hp > 0) {
      this.modifyFaith(5);
    }

    const core = s.sectors.get('core')!;
    if (core.hp <= 0) {
      this.endRun('defeated');
    }
  }

  private processCrabTasks(deltaSec: number): void {
    const s = this.state;
    for (const crab of s.crabs.values()) {
      if (!crab.isAlive || crab.griefTimer > 0) continue;
      const sector = crab.targetSectorId ? s.sectors.get(crab.targetSectorId) : null;
      if (!sector) continue;

      const efficiency = this.getCrabEfficiency(crab);

      switch (crab.currentTask) {
        case 'RaiseWall':
          if (sector.hp < sector.maxHp) {
            sector.hp = Math.min(sector.maxHp, sector.hp + deltaSec * 3 * efficiency);
          }
          if (sector.hp >= sector.maxHp) crab.currentTask = 'Idle';
          break;

        case 'Dig':
          if (!sector.hasMoat) {
            sector.moatDepth = Math.min(100, sector.moatDepth + deltaSec * 4 * efficiency);
            if (sector.moatDepth >= 100) {
              sector.hasMoat = true;
              this.modifyFaith(3);
            }
          } else if (sector.moatDepth < 100) {
            sector.moatDepth = Math.min(100, sector.moatDepth + deltaSec * 2 * efficiency);
          }
          break;

        case 'Gather':
          if (Math.random() < deltaSec * 0.15 * efficiency) {
            s.resources.shells = Math.min(999, s.resources.shells + 1);
          }
          if (Math.random() < deltaSec * 0.05 * efficiency) {
            s.resources.pebbles = Math.min(999, s.resources.pebbles + 1);
          }
          break;

        case 'Patrol':
          // Patrol boosts faith of nearby crabs slightly; deters traitors
          if (Math.random() < deltaSec * 0.03) {
            this.modifyFaith(0.5);
          }
          // Catch traitors
          for (const other of s.crabs.values()) {
            if (other.isTraitor && other.targetSectorId === crab.targetSectorId) {
              other.isTraitor = false;
              other.stats.loyalty = clamp(other.stats.loyalty + 20);
              this.modifyFaith(5);
              this.emit('traitorCaught', { catcher: crab, traitor: other });
            }
          }
          break;

        case 'Rest':
          crab.stats.stamina = Math.min(100, crab.stats.stamina + deltaSec * 5);
          break;

        case 'Ritual':
          // Costs resources, boosts faith
          if (s.resources.shells >= 10 && Math.random() < deltaSec * 0.05) {
            s.resources.shells -= 10;
            this.modifyFaith(15);
            crab.currentTask = 'Idle';
          }
          break;

        case 'Sabotage':
          if (sector.hp > 10) {
            sector.hp = Math.max(10, sector.hp - deltaSec * 2);
          }
          break;
      }

      // Low loyalty crabs may turn traitor
      if (!crab.isTraitor && crab.stats.loyalty < 20 && Math.random() < deltaSec * 0.005) {
        crab.isTraitor = true;
        crab.currentTask = 'Sabotage';
        this.modifyFaith(-5);
        this.emit('crabTurnedTraitor', crab);
      }

      // Glutton kelp consumption
      if (crab.traits.includes('Glutton') && Math.random() < deltaSec * 0.02) {
        if (s.resources.kelp > 0) {
          s.resources.kelp--;
        } else {
          crab.stats.loyalty = Math.max(0, crab.stats.loyalty - 0.5);
        }
      }
    }
  }

  private getCrabEfficiency(crab: Crab): number {
    const s = this.state;
    let eff = 1.0;
    // Wise crabs boost nearby
    const wiseNearby = Array.from(s.crabs.values()).filter(
      c => c.isAlive && c.traits.includes('Wise') && c.targetSectorId === crab.targetSectorId && c.id !== crab.id
    ).length;
    if (wiseNearby > 0) eff += 0.2;
    // Faith affects efficiency
    const faithBonus = (s.faith - 50) / 200;
    eff += faithBonus;
    // Traitors are slow
    if (crab.isTraitor) eff *= 0.3;
    // Grief is slow
    if (crab.griefTimer > 0) eff *= 0.1;
    // Stamina
    eff *= (crab.stats.stamina / 100);
    return Math.max(0.1, eff);
  }

  assignTask(crabId: string, task: import('./types').TaskType, sectorId?: string): void {
    const crab = this.state.crabs.get(crabId);
    if (!crab || !crab.isAlive) return;
    crab.currentTask = task;
    if (sectorId) crab.targetSectorId = sectorId;
    crab.isTraitor = false; // Assigning a task reforms traitors temporarily
    this.emit('crabTaskAssigned', { crab, task });
  }

  modifyFaith(delta: number): void {
    this.state.faith = clamp(this.state.faith + delta);
    this.emit('faithChanged', this.state.faith);
  }

  issueDecree(): void {
    const s = this.state;
    if (s.decreeOnCooldown) return;
    // Faith above 50 → boost; below → penalty
    const effect = s.faith >= 50 ? 2 : -2;
    this.modifyFaith(effect);
    s.decreeOnCooldown = true;
    s.decreeCooldownRemaining = DECREE_COOLDOWN;
    this.emit('decreed', effect);
  }

  resolveSchism(method: 'miracle' | 'decree' | 'exile'): void {
    const s = this.state;
    if (!s.schism) return;
    const leader = s.crabs.get(s.schism.leaderId);

    switch (method) {
      case 'miracle':
        if (s.resources.shells < 50) return;
        s.resources.shells -= 50;
        this.modifyFaith(30);
        this.emit('miraclePerformed');
        break;
      case 'decree':
        this.modifyFaith(10);
        if (leader) {
          leader.stats.loyalty = clamp(leader.stats.loyalty + 30);
          leader.isTraitor = false;
          leader.storyMoments.push('diplomatic');
        }
        break;
      case 'exile':
        if (leader) {
          leader.isAlive = false;
          this.modifyFaith(5);
          this.emit('crabDied', { crab: leader, heroic: false });
          this.modifyFaith(-3); // short-term grief
        }
        break;
    }
    s.schism = null;
    this.emit('schismResolved', method);
  }

  private triggerSchism(): void {
    const s = this.state;
    if (s.schism) return;
    const alive = Array.from(s.crabs.values()).filter(c => c.isAlive);
    const ambitious = alive.filter(c => c.traits.includes('Ambitious'));
    const candidates = ambitious.length > 0 ? ambitious : alive;
    if (candidates.length === 0) return;
    const leader = candidates.reduce((prev, cur) => cur.stats.loyalty < prev.stats.loyalty ? cur : prev);
    const faction = alive.filter(c => c.id !== leader.id && c.stats.loyalty < 45).slice(0, 3);

    s.schism = { leaderId: leader.id, factionMemberIds: faction.map(c => c.id), startedAt: s.gameTime };
    for (const fid of s.schism.factionMemberIds) {
      const fc = s.crabs.get(fid);
      if (fc) fc.currentTask = 'Idle';
    }
    leader.currentTask = 'Idle';
    this.emit('schismTriggered', s.schism);
  }

  addNarrativeEvent(event: StoryEvent): void {
    const s = this.state;
    s.narrativeEvents.unshift(event);
    if (s.narrativeEvents.length > 50) s.narrativeEvents.pop();
    s.score.storyCount++;
    this.emit('narrativeEvent', event);

    // Apply effects of high-drama events
    if (event.category === 'Heroism') this.modifyFaith(5);
    if (event.category === 'Betrayal') this.modifyFaith(-8);
    if (event.category === 'Redemption') this.modifyFaith(8);
    if (event.category === 'Tragedy') this.modifyFaith(-3);
  }

  updateNarrativeCooldown(id: string, cooldown: number): void {
    this.narrativeCooldowns.set(id, this.state.gameTime + cooldown);
  }

  isNarrativeOnCooldown(id: string): boolean {
    const until = this.narrativeCooldowns.get(id) ?? 0;
    return this.state.gameTime < until;
  }

  crabDied(crabId: string, heroic: boolean): void {
    const s = this.state;
    const crab = s.crabs.get(crabId);
    if (!crab || !crab.isAlive) return;
    crab.isAlive = false;
    this.modifyFaith(heroic ? 3 : -5);

    // Notify romantic partners
    for (const other of s.crabs.values()) {
      if (!other.isAlive) continue;
      const rel = other.relationships.find(r => r.targetCrabId === crabId && r.type === 'Romantic');
      if (rel) {
        other.griefTimer = 180; // 3 min
        other.currentTask = 'Rest';
      }
    }
    s.score.crabsSaved = Array.from(s.crabs.values()).filter(c => c.isAlive).length;
    this.emit('crabDied', { crab, heroic });
  }

  recruitCrab(): void {
    const s = this.state;
    if (s.resources.shells < 5) return;
    s.resources.shells -= 5;
    const professions: Profession[] = ['Builder', 'Digger', 'Scout', 'Warrior', 'Forager'];
    const profession = professions[Math.floor(Math.random() * professions.length)];
    const traits = pickTraits(2);
    const name = getRandomName(this.usedNames);
    this.usedNames.add(name);
    const crab = createCrab(name, profession, traits);
    crab.currentTask = this.defaultTaskForProfession(profession);
    crab.targetSectorId = this.defaultSectorForProfession(profession);
    s.crabs.set(crab.id, crab);
    this.modifyFaith(2);
    this.emit('crabRecruited', crab);
    this.emit('stateChanged', s);
  }

  private endRun(outcome: 'survived' | 'defeated'): void {
    const s = this.state;
    if (s.phase === 'gameover') return;
    s.phase = 'gameover';
    s.score.crabsSaved = Array.from(s.crabs.values()).filter(c => c.isAlive).length;
    this.emit('gameOver', { outcome, score: s.score });
  }
}

export const gameStore = new GameStore();
