import type { GameStore } from './GameStore';
import type { GameState, Crab, StoryEvent } from './types';
import { STORY_TEMPLATES } from './data/storyTemplates';

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function fillTemplate(template: string, crabs: Crab[]): string {
  let text = template;
  const labels = ['A', 'B', 'C'];
  crabs.forEach((crab, i) => {
    const key = labels[i];
    text = text.replaceAll(`{${key}}`, crab.name);
    text = text.replaceAll(`{crab_${key.toLowerCase()}.name}`, crab.name);
    const trait = crab.traits[0] ?? 'determination';
    text = text.replaceAll(`{${key}.trait}`, trait.toLowerCase());
    text = text.replaceAll(`{crab_${key.toLowerCase()}.trait}`, trait.toLowerCase());
  });
  return text;
}

export class NarrativeEngine {
  private store: GameStore;

  constructor(store: GameStore) {
    this.store = store;
    // Subscribe to the narrative evaluation trigger from GameStore
    store.on('narrativeEval', (state: GameState) => this.evaluate(state));
  }

  private evaluate(state: GameState): void {
    // Shuffle templates so the order of evaluation varies
    const shuffled = [...STORY_TEMPLATES].sort(() => Math.random() - 0.5);

    let generated = 0;
    for (const template of shuffled) {
      if (generated >= 1) break; // Max one event per evaluation cycle
      if (this.store.isNarrativeOnCooldown(template.id)) continue;

      const result = template.prerequisites(state);
      if (!result.valid || result.crabs.length === 0) continue;

      const text = fillTemplate(template.template, result.crabs);
      const event: StoryEvent = {
        id: uid(),
        category: template.category,
        text,
        involvedCrabIds: result.crabs.map(c => c.id),
        triggeredAt: state.gameTime,
        intensity: template.intensity,
      };

      // Update relationships based on the event category
      this.updateRelationships(state, template.category, result.crabs);

      this.store.addNarrativeEvent(event);
      this.store.updateNarrativeCooldown(template.id, template.cooldownSeconds);
      generated++;
    }
  }

  private updateRelationships(state: GameState, category: string, crabs: Crab[]): void {
    if (crabs.length < 2) return;
    const [a, b] = crabs;
    const type = (() => {
      switch (category) {
        case 'Romance': return 'Romantic';
        case 'Rivalry': return 'Rival';
        case 'Heroism': return 'Friend';
        case 'Tragedy': return 'Friend';
        default: return null;
      }
    })();
    if (!type) return;

    // Add or strengthen relationship
    const existing = a.relationships.find(r => r.targetCrabId === b.id);
    if (existing) {
      existing.strength = Math.min(100, existing.strength + 15);
      existing.formativeEvents.push(category.toLowerCase());
    } else {
      a.relationships.push({
        targetCrabId: b.id,
        type: type as import('./types').RelationshipType,
        strength: 30,
        formativeEvents: [category.toLowerCase()],
      });
    }

    const existingB = b.relationships.find(r => r.targetCrabId === a.id);
    if (existingB) {
      existingB.strength = Math.min(100, existingB.strength + 15);
    } else {
      b.relationships.push({
        targetCrabId: a.id,
        type: type as import('./types').RelationshipType,
        strength: 30,
        formativeEvents: [category.toLowerCase()],
      });
    }
  }
}
