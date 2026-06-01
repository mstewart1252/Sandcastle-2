import type { EventTemplate, GameState, Crab } from '../types';

function liveCrabs(state: GameState): Crab[] {
  return Array.from(state.crabs.values()).filter(c => c.isAlive);
}

function withTrait(crabs: Crab[], trait: string): Crab[] {
  return crabs.filter(c => c.traits.includes(trait as never));
}

function withRelationship(crabs: Crab[], state: GameState, type: string): [Crab, Crab] | null {
  for (const crab of crabs) {
    const rel = crab.relationships.find(r => r.type === type && state.crabs.get(r.targetCrabId)?.isAlive);
    if (rel) {
      const partner = state.crabs.get(rel.targetCrabId);
      if (partner) return [crab, partner];
    }
  }
  return null;
}

export const STORY_TEMPLATES: EventTemplate[] = [
  {
    id: 'romance_01',
    category: 'Romance',
    intensity: 'medium',
    cooldownSeconds: 180,
    template: '{A} and {B} reached for the same shell at the same moment. Their claws touched. Neither let go. They have been inseparable since.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const romantics = withTrait(alive, 'Romantic');
      if (romantics.length === 0) return { valid: false, crabs: [] };
      const crabA = romantics[0];
      const others = alive.filter(c => c.id !== crabA.id && !crabA.relationships.find(r => r.targetCrabId === c.id && r.type === 'Romantic'));
      if (others.length === 0) return { valid: false, crabs: [] };
      return { valid: true, crabs: [crabA, others[Math.floor(Math.random() * others.length)]] };
    },
  },
  {
    id: 'romance_02',
    category: 'Romance',
    intensity: 'low',
    cooldownSeconds: 240,
    template: '{A} has started leaving kelp fronds outside {B}\'s resting spot each morning. {B} pretends not to notice. They both know.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      if (alive.length < 2) return { valid: false, crabs: [] };
      const pair = withRelationship(alive, state, 'Romantic');
      if (pair) return { valid: true, crabs: pair };
      if (state.resources.kelp >= 5) {
        const a = alive[Math.floor(Math.random() * alive.length)];
        const b = alive.find(c => c.id !== a.id)!;
        return b ? { valid: true, crabs: [a, b] } : { valid: false, crabs: [] };
      }
      return { valid: false, crabs: [] };
    },
  },
  {
    id: 'betrayal_01',
    category: 'Betrayal',
    intensity: 'high',
    cooldownSeconds: 300,
    template: '{A} was passed over when {B} was given command of the eastern wall. In the shadow of the sacred flame, {A} made a quiet vow.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const treacherous = withTrait(alive, 'Treacherous');
      if (treacherous.length === 0) return { valid: false, crabs: [] };
      const crabA = treacherous[0];
      if (crabA.stats.loyalty > 50) return { valid: false, crabs: [] };
      const others = alive.filter(c => c.id !== crabA.id);
      if (others.length === 0) return { valid: false, crabs: [] };
      return { valid: true, crabs: [crabA, others[Math.floor(Math.random() * others.length)]] };
    },
  },
  {
    id: 'heroism_01',
    category: 'Heroism',
    intensity: 'legendary',
    cooldownSeconds: 360,
    template: 'When the wall began to crumble, every crab fled — except {A}. Armed with nothing but sheer will, they held the section alone for two terrible minutes.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const heroic = withTrait(alive, 'Heroic');
      if (heroic.length === 0) return { valid: false, crabs: [] };
      const damagedSector = Array.from(state.sectors.values()).find(s => s.hp < s.maxHp * 0.35);
      if (!damagedSector) return { valid: false, crabs: [] };
      return { valid: true, crabs: [heroic[Math.floor(Math.random() * heroic.length)]] };
    },
  },
  {
    id: 'heroism_02',
    category: 'Heroism',
    intensity: 'high',
    cooldownSeconds: 240,
    template: '{A} saw {B} carried off by the undertow and dove in without hesitation. The colony held its breath. They returned together, draped in kelp and dignity.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const heroic = withTrait(alive, 'Heroic');
      if (heroic.length === 0) return { valid: false, crabs: [] };
      if (state.tideLevel < 20) return { valid: false, crabs: [] };
      const others = alive.filter(c => !c.traits.includes('Heroic'));
      if (others.length === 0) return { valid: false, crabs: [] };
      return { valid: true, crabs: [heroic[0], others[0]] };
    },
  },
  {
    id: 'tragedy_01',
    category: 'Tragedy',
    intensity: 'high',
    cooldownSeconds: 0,
    template: '{A} has not worked since {B} was taken by the tide. They sit at the waterline and watch the waves, as if waiting for the sea to return what it took.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      for (const crab of alive) {
        if (!crab.traits.includes('Romantic')) continue;
        const lostRomance = crab.relationships.find(r => r.type === 'Romantic' && !state.crabs.get(r.targetCrabId)?.isAlive);
        if (lostRomance) {
          const lost = state.crabs.get(lostRomance.targetCrabId);
          if (lost) return { valid: true, crabs: [crab, lost] };
        }
      }
      return { valid: false, crabs: [] };
    },
  },
  {
    id: 'comedy_01',
    category: 'Comedy',
    intensity: 'low',
    cooldownSeconds: 120,
    template: '{A} intended to dig a small retreat tunnel. Six feet down and forty feet sideways, they had accidentally created the colony\'s most strategically perfect secondary moat. No one is sure they know this.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const cowardly = withTrait(alive, 'Cowardly');
      if (cowardly.length === 0) return { valid: false, crabs: [] };
      const goodMoat = Array.from(state.sectors.values()).find(s => s.hasMoat && s.moatDepth > 70);
      if (!goodMoat) return { valid: false, crabs: [] };
      return { valid: true, crabs: [cowardly[0]] };
    },
  },
  {
    id: 'comedy_02',
    category: 'Comedy',
    intensity: 'low',
    cooldownSeconds: 180,
    template: '{A} and {B} have now each constructed and deconstructed the same wall section three times in apparent disagreement over optimal claw-packing technique. The wall remains unfinished.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const builders = alive.filter(c => c.profession === 'Builder');
      if (builders.length < 2) return { valid: false, crabs: [] };
      const rivals = builders.find(c => c.relationships.find(r => r.type === 'Rival' && state.crabs.get(r.targetCrabId)?.profession === 'Builder'));
      if (rivals) {
        const rel = rivals.relationships.find(r => r.type === 'Rival');
        const b2 = state.crabs.get(rel!.targetCrabId);
        if (b2) return { valid: true, crabs: [rivals, b2] };
      }
      return { valid: true, crabs: [builders[0], builders[1]] };
    },
  },
  {
    id: 'prophecy_01',
    category: 'Prophecy',
    intensity: 'medium',
    cooldownSeconds: 420,
    template: 'Elder {A} gathered the young crabs at dusk and said only: "Before the third great wave, one among you will choose between the castle and their heart." No one laughed.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const elder = alive.find(c => c.profession === 'Elder');
      if (!elder) return { valid: false, crabs: [] };
      if (state.gameTime < 120) return { valid: false, crabs: [] };
      return { valid: true, crabs: [elder] };
    },
  },
  {
    id: 'prophecy_02',
    category: 'Prophecy',
    intensity: 'medium',
    cooldownSeconds: 600,
    template: '{A} stopped mid-dig, stared at the horizon, and announced: "The sea remembers what we forget. And it is coming to remind us." Work paused for a full minute.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const wise = withTrait(alive, 'Wise');
      if (wise.length === 0) return { valid: false, crabs: [] };
      if (state.tideLevel < 30) return { valid: false, crabs: [] };
      return { valid: true, crabs: [wise[0]] };
    },
  },
  {
    id: 'political_01',
    category: 'Political',
    intensity: 'high',
    cooldownSeconds: 300,
    template: '{A} has organized a faction. "We dig and we dig," they told the colony, "but where is our god?" Their claws have slowed. They are waiting.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const ambitious = withTrait(alive, 'Ambitious');
      if (ambitious.length === 0) return { valid: false, crabs: [] };
      if (state.faith > 45) return { valid: false, crabs: [] };
      const leader = ambitious.find(c => c.stats.loyalty < 50);
      if (!leader) return { valid: false, crabs: [] };
      return { valid: true, crabs: [leader] };
    },
  },
  {
    id: 'redemption_01',
    category: 'Redemption',
    intensity: 'high',
    cooldownSeconds: 0,
    template: '{A}, once a traitor, now works harder than any crab in the colony. They never speak of what changed. But they always volunteer for the most dangerous wall sections.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const reformed = alive.find(c => c.isTraitor === false && c.storyMoments.some(m => m.includes('traitor')));
      if (!reformed) return { valid: false, crabs: [] };
      return { valid: true, crabs: [reformed] };
    },
  },
  {
    id: 'rivalry_01',
    category: 'Political',
    intensity: 'low',
    cooldownSeconds: 200,
    template: '{A} glared at {B} across the wall site for the entire morning shift. At dusk, {B} "accidentally" filled in the section {A} had just excavated. The colony pretended not to notice.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      for (const crab of alive) {
        const rivalRel = crab.relationships.find(r => r.type === 'Rival');
        if (rivalRel) {
          const rival = state.crabs.get(rivalRel.targetCrabId);
          if (rival?.isAlive) return { valid: true, crabs: [crab, rival] };
        }
      }
      return { valid: false, crabs: [] };
    },
  },
  {
    id: 'grief_deepens',
    category: 'Tragedy',
    intensity: 'medium',
    cooldownSeconds: 200,
    template: '{A} completed {B}\'s unfinished section of the wall before sitting down and refusing to move. In crab custom, this is the highest possible tribute.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      for (const crab of alive) {
        if (crab.griefTimer <= 0) continue;
        const lost = Array.from(state.crabs.values()).find(c => !c.isAlive && crab.relationships.some(r => r.targetCrabId === c.id));
        if (lost) return { valid: true, crabs: [crab, lost] };
      }
      return { valid: false, crabs: [] };
    },
  },
  {
    id: 'paranoia_01',
    category: 'Political',
    intensity: 'low',
    cooldownSeconds: 180,
    template: '{A} has been watching {B} suspiciously for three days. "{B}\'s claws," they explained to anyone who would listen, "are angled wrong." {B}\'s claws are fine.',
    prerequisites(state) {
      const alive = liveCrabs(state);
      const paranoid = withTrait(alive, 'Paranoid');
      if (paranoid.length === 0) return { valid: false, crabs: [] };
      const others = alive.filter(c => c.id !== paranoid[0].id);
      if (others.length === 0) return { valid: false, crabs: [] };
      return { valid: true, crabs: [paranoid[0], others[Math.floor(Math.random() * others.length)]] };
    },
  },
];
