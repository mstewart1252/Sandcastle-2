import Phaser from 'phaser';
import { gameStore } from '../GameStore';
import type { StoryEvent, WaveEvent, GameState } from '../types';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function categoryColor(cat: string): string {
  const map: Record<string, string> = {
    Romance: '#ff69b4', Betrayal: '#dc143c', Heroism: '#ffd700',
    Political: '#9370db', Tragedy: '#4682b4', Comedy: '#3cb371',
    Prophecy: '#ba55d3', Redemption: '#ff8c00',
  };
  return map[cat] ?? '#ccc';
}

export class UIScene extends Phaser.Scene {
  private timerDisplay!: HTMLElement;
  private waveIncoming!: HTMLElement;
  private faithBar!: HTMLElement;
  private faithValue!: HTMLElement;
  private resShells!: HTMLElement;
  private resKelp!: HTMLElement;
  private resPebbles!: HTMLElement;
  private decreeBtn!: HTMLElement;
  private chronicleBtn!: HTMLElement;
  private chroniclePanel!: HTMLElement;
  private chronicleFeed!: HTMLElement;
  private schismModal!: HTMLElement;
  private schismText!: HTMLElement;
  private gameoverModal!: HTMLElement;
  private dramaToast!: HTMLElement;
  private toastCategory!: HTMLElement;
  private toastText!: HTMLElement;

  private pendingNewEvents = 0;
  private chronicleOpen = false;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    this.bindElements();
    this.bindStoreEvents();
    this.bindDOMEvents();
  }

  private bindElements(): void {
    const q = (id: string) => document.getElementById(id)!;
    this.timerDisplay = q('timer-display');
    this.waveIncoming = q('wave-incoming');
    this.faithBar = q('faith-bar');
    this.faithValue = q('faith-value');
    this.resShells = q('res-shells');
    this.resKelp = q('res-kelp');
    this.resPebbles = q('res-pebbles');
    this.decreeBtn = q('decree-btn');
    this.chronicleBtn = q('chronicle-btn');
    this.chroniclePanel = q('chronicle-panel');
    this.chronicleFeed = q('chronicle-feed');
    this.schismModal = q('schism-modal');
    this.schismText = q('schism-text');
    this.gameoverModal = q('gameover-modal');
    this.dramaToast = q('drama-toast');
    this.toastCategory = q('toast-category');
    this.toastText = q('toast-text');
  }

  private bindStoreEvents(): void {
    gameStore.on('stateChanged', (state: GameState) => this.onStateChanged(state));
    gameStore.on('waveIncoming', (wave: WaveEvent) => this.onWaveIncoming(wave));
    gameStore.on('narrativeEvent', (event: StoryEvent) => this.onNarrativeEvent(event));
    gameStore.on('schismTriggered', () => this.onSchismTriggered());
    gameStore.on('schismResolved', () => { this.schismModal.classList.remove('open'); });
    gameStore.on('gameOver', (data: { outcome: string; score: GameState['score'] }) => this.onGameOver(data));
    gameStore.on('decreed', (effect: number) => this.flashFaith(effect > 0 ? '#gold' : '#red'));
    gameStore.on('miraclePerformed', () => this.showMiracleEffect());
  }

  private bindDOMEvents(): void {
    this.decreeBtn.addEventListener('click', () => {
      if (gameStore.state.phase !== 'running') return;
      gameStore.issueDecree();
    });

    this.chronicleBtn.addEventListener('click', () => this.toggleChronicle());
    document.getElementById('close-chronicle')!.addEventListener('click', () => this.closeChronicle());

    document.getElementById('btn-miracle')!.addEventListener('click', () => {
      const state = gameStore.state;
      const btn = document.getElementById('btn-miracle')!;
      if (state.resources.shells < 50) {
        btn.classList.add('btn-disabled');
        return;
      }
      gameStore.resolveSchism('miracle');
    });
    document.getElementById('btn-decree-schism')!.addEventListener('click', () => gameStore.resolveSchism('decree'));
    document.getElementById('btn-exile')!.addEventListener('click', () => gameStore.resolveSchism('exile'));
    document.getElementById('close-toast')!.addEventListener('click', () => this.hideDramaToast());
    document.getElementById('play-again-btn')!.addEventListener('click', () => this.restartRun());
  }

  private onStateChanged(state: GameState): void {
    // Timer
    this.timerDisplay.textContent = formatTime(state.tideCountdownSeconds);
    this.timerDisplay.style.color = state.tideCountdownSeconds < 120 ? '#ff4444' : '#fff';

    // Faith bar
    const faithPct = state.faith;
    this.faithBar.style.width = `${faithPct}%`;
    const faithColor = faithPct > 60 ? '#c0a030' : faithPct > 30 ? '#ff8c00' : '#dc143c';
    this.faithBar.style.background = faithColor;
    this.faithValue.textContent = `${Math.round(faithPct)} / 100`;

    // Resources
    this.resShells.textContent = String(state.resources.shells);
    this.resKelp.textContent = String(state.resources.kelp);
    this.resPebbles.textContent = String(state.resources.pebbles);

    // Decree cooldown
    if (state.decreeOnCooldown) {
      this.decreeBtn.classList.add('on-cooldown');
      const icon = this.decreeBtn.querySelector('.icon');
      if (icon) icon.textContent = `${Math.ceil(state.decreeCooldownRemaining)}s`;
    } else {
      this.decreeBtn.classList.remove('on-cooldown');
      const icon = this.decreeBtn.querySelector('.icon');
      if (icon) icon.textContent = '📜';
    }

    // Miracle button affordance
    const miracleBtn = document.getElementById('btn-miracle');
    if (miracleBtn) {
      miracleBtn.classList.toggle('btn-disabled', state.resources.shells < 50);
      miracleBtn.querySelector('strong')!.textContent = `✨ Divine Miracle — Spend 50 🐚 (have ${state.resources.shells})`;
    }
  }

  private onWaveIncoming(wave: WaveEvent): void {
    const typeLabel: Record<string, string> = {
      Lapping: '〜 Lapping wave',
      Surge: '🌊 SURGE WAVE',
      KingTide: '⚡ KING TIDE',
      RogueWave: '💥 ROGUE WAVE',
    };
    const sectorName = wave.targetSectorId.charAt(0).toUpperCase() + wave.targetSectorId.slice(1);
    this.waveIncoming.textContent = `${typeLabel[wave.type] ?? wave.type} → ${sectorName} in ${wave.eta.toFixed(0)}s`;

    if (wave.type === 'KingTide' || wave.type === 'RogueWave') {
      this.waveIncoming.style.color = '#ff4444';
    } else if (wave.type === 'Surge') {
      this.waveIncoming.style.color = '#ffaa00';
    } else {
      this.waveIncoming.style.color = '#88aaff';
    }
  }

  private onNarrativeEvent(event: StoryEvent): void {
    // Add to chronicle feed
    const entry = document.createElement('div');
    entry.className = 'story-event';
    entry.innerHTML = `
      <div class="event-category cat-${event.category}" style="color:${categoryColor(event.category)}">
        ${event.category.toUpperCase()} · ${event.intensity.toUpperCase()}
      </div>
      <div>${event.text}</div>
      <div class="event-time">${formatTime(event.triggeredAt)} into the tide</div>
    `;
    this.chronicleFeed.insertBefore(entry, this.chronicleFeed.firstChild);

    // Show toast for high/legendary events
    if (event.intensity === 'high' || event.intensity === 'legendary') {
      this.showDramaToast(event);
    }

    // Glow the chronicle button
    if (!this.chronicleOpen) {
      this.pendingNewEvents++;
      this.chronicleBtn.classList.add('has-new');
    }
  }

  private showDramaToast(event: StoryEvent): void {
    this.toastCategory.textContent = event.category.toUpperCase();
    this.toastCategory.style.color = categoryColor(event.category);
    this.toastText.textContent = event.text;

    this.dramaToast.classList.remove('show');
    void this.dramaToast.offsetHeight; // reflow
    this.dramaToast.classList.add('show');

    setTimeout(() => this.hideDramaToast(), 5500);
  }

  private hideDramaToast(): void {
    this.dramaToast.classList.remove('show');
  }

  private toggleChronicle(): void {
    if (this.chronicleOpen) {
      this.closeChronicle();
    } else {
      this.chroniclePanel.classList.add('open');
      this.chronicleOpen = true;
      this.pendingNewEvents = 0;
      this.chronicleBtn.classList.remove('has-new');
    }
  }

  private closeChronicle(): void {
    this.chroniclePanel.classList.remove('open');
    this.chronicleOpen = false;
  }

  private onSchismTriggered(): void {
    const state = gameStore.state;
    const leader = state.schism ? state.crabs.get(state.schism.leaderId) : null;
    this.schismText.textContent = leader
      ? `${leader.name} leads a faction of doubters. Work has halted. The colony questions your divine authority.`
      : 'A faction of doubters has emerged. They demand proof of your godhood.';
    this.schismModal.classList.add('open');
  }

  private onGameOver(data: { outcome: string; score: GameState['score'] }): void {
    const subtitle = data.outcome === 'survived'
      ? 'The tide receded. Your castle endures. The crabs sing of your glory.'
      : 'The sea has claimed your castle. But the stories will live on.';
    document.getElementById('gameover-subtitle')!.textContent = subtitle;
    document.getElementById('score-time')!.textContent = formatTime(data.score.survivalTime);
    document.getElementById('score-crabs')!.textContent = String(data.score.crabsSaved);
    document.getElementById('score-stories')!.textContent = String(data.score.storyCount);
    document.getElementById('score-faith')!.textContent = String(Math.round(data.score.peakFaith));
    this.gameoverModal.classList.add('open');
  }

  private flashFaith(_color: string): void {
    const panel = document.getElementById('faith-panel')!;
    panel.style.transition = 'none';
    panel.style.boxShadow = '0 0 12px rgba(255,215,0,0.8)';
    setTimeout(() => {
      panel.style.transition = 'box-shadow 0.5s';
      panel.style.boxShadow = '';
    }, 300);
  }

  private showMiracleEffect(): void {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position:fixed; inset:0; background:rgba(255,255,200,0.5);
      pointer-events:none; z-index:100; animation: fadeInOut 1s forwards;
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 1100);
  }

  private restartRun(): void {
    this.gameoverModal.classList.remove('open');
    this.schismModal.classList.remove('open');
    this.dramaToast.classList.remove('show');
    this.chronicleFeed.innerHTML = '';
    this.pendingNewEvents = 0;
    this.chronicleBtn.classList.remove('has-new');
    this.closeChronicle();
    this.waveIncoming.textContent = '';

    gameStore.startRun();
  }

  update(): void {
    const state = gameStore.state;
    if (state.phase !== 'running') return;

    // Live wave ETA update
    if (state.incomingWave) {
      const wave = state.incomingWave;
      const typeLabel: Record<string, string> = {
        Lapping: '〜 Lapping',
        Surge: '🌊 SURGE',
        KingTide: '⚡ KING TIDE',
        RogueWave: '💥 ROGUE',
      };
      const sectorName = wave.targetSectorId.charAt(0).toUpperCase() + wave.targetSectorId.slice(1);
      this.waveIncoming.textContent = `${typeLabel[wave.type] ?? wave.type} → ${sectorName} in ${Math.max(0, wave.eta).toFixed(1)}s`;
    } else {
      const nextSurge = Math.max(0, 60 - (state.gameTime % 60));
      if (nextSurge > 5) this.waveIncoming.textContent = `Next wave in ~${nextSurge.toFixed(0)}s`;
    }
  }
}
