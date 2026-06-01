import type { TraitName, CrabStats } from '../types';

export interface TraitDefinition {
  name: TraitName;
  description: string;
  statModifiers: Partial<CrabStats>;
}

export const TRAIT_DEFINITIONS: Record<TraitName, TraitDefinition> = {
  Devout: {
    name: 'Devout',
    description: 'High faith; resists corruption; may convert doubters.',
    statModifiers: { faith: 25, loyalty: 15 },
  },
  Ambitious: {
    name: 'Ambitious',
    description: 'Works faster but may start coup attempts if overlooked.',
    statModifiers: { strength: 15, speed: 10, loyalty: -10 },
  },
  Romantic: {
    name: 'Romantic',
    description: 'Forms bonds rapidly; heartbreak causes work slowdowns.',
    statModifiers: { faith: 5, stamina: -5 },
  },
  Cowardly: {
    name: 'Cowardly',
    description: 'Flees from surge waves; refuses dangerous zones.',
    statModifiers: { speed: 15, strength: -15, loyalty: -5 },
  },
  Heroic: {
    name: 'Heroic',
    description: 'Rushes toward danger; may sacrifice self to save a wall.',
    statModifiers: { strength: 20, stamina: 15, speed: 5 },
  },
  Treacherous: {
    name: 'Treacherous',
    description: 'Low baseline loyalty; easily becomes a traitor.',
    statModifiers: { loyalty: -30, speed: 10 },
  },
  Wise: {
    name: 'Wise',
    description: 'Boosts nearby crab efficiency; gives the player hints.',
    statModifiers: { faith: 15, stamina: 10 },
  },
  Glutton: {
    name: 'Glutton',
    description: 'Consumes extra kelp; morale collapses if kelp is scarce.',
    statModifiers: { strength: 10, stamina: 5 },
  },
  Paranoid: {
    name: 'Paranoid',
    description: 'Distrusts others; resistant to traitor manipulation.',
    statModifiers: { loyalty: 10, faith: -10 },
  },
};

export function pickTraits(count: number, exclude: TraitName[] = []): TraitName[] {
  const all = Object.keys(TRAIT_DEFINITIONS) as TraitName[];
  const pool = all.filter(t => !exclude.includes(t));
  const chosen: TraitName[] = [];
  while (chosen.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(i, 1)[0]);
  }
  return chosen;
}
