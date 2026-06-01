import Phaser from 'phaser';
import { gameStore } from '../GameStore';
import type { CastleSector, Crab, WaveEvent } from '../types';

const W = 480;
const H = 854;

// Castle sector rectangles: {x, y, w, h} for each sector id
const SECTOR_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  north: { x: 180, y: 130, w: 120, h: 70 },
  core:  { x: 160, y: 200, w: 160, h: 100 },
  south: { x: 180, y: 300, w: 120, h: 70 },
  west:  { x: 80,  y: 200, w: 80,  h: 100 },
  east:  { x: 320, y: 200, w: 80,  h: 100 },
};

// Where crabs wander near their assigned sector
const SECTOR_WORK_POSITIONS: Record<string, { x: number; y: number }[]> = {
  north: [{ x: 200, y: 155 }, { x: 250, y: 145 }, { x: 280, y: 160 }],
  core:  [{ x: 200, y: 240 }, { x: 240, y: 230 }, { x: 280, y: 255 }],
  south: [{ x: 195, y: 355 }, { x: 240, y: 370 }, { x: 270, y: 350 }],
  west:  [{ x: 90,  y: 235 }, { x: 100, y: 265 }, { x: 85,  y: 290 }],
  east:  [{ x: 385, y: 235 }, { x: 375, y: 260 }, { x: 390, y: 290 }],
};

// Patrol path waypoints
const PATROL_PATH = [
  { x: 140, y: 180 }, { x: 340, y: 180 },
  { x: 400, y: 260 }, { x: 340, y: 380 },
  { x: 140, y: 380 }, { x: 80,  y: 260 },
];

// Forager zones (lower beach)
const FORAGER_ZONES = [
  { x: 80,  y: 480 }, { x: 150, y: 520 }, { x: 240, y: 500 },
  { x: 320, y: 510 }, { x: 400, y: 490 }, { x: 200, y: 560 },
];

// Profession colors
const PROFESSION_COLORS: Record<string, number> = {
  Builder: 0xff6b6b,
  Digger:  0x4ecdc4,
  Scout:   0x45b7d1,
  Warrior: 0x96ceb4,
  Forager: 0xffd93d,
  Elder:   0xdda0dd,
};

function sectorColor(hp: number, maxHp: number): number {
  const pct = hp / maxHp;
  if (pct > 0.66) return 0xb8a080;
  if (pct > 0.33) return 0xb87020;
  return 0xaa2020;
}

interface CrabSprite {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Ellipse;
  nameText: Phaser.GameObjects.Text;
  taskText: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  wanderTimer: number;
  patrolIndex: number;
}

export class GameScene extends Phaser.Scene {
  private castleGraphics!: Phaser.GameObjects.Graphics;
  private tideGraphics!: Phaser.GameObjects.Graphics;
  private waveGraphics!: Phaser.GameObjects.Graphics;
  private beachGraphics!: Phaser.GameObjects.Graphics;
  private crabSprites = new Map<string, CrabSprite>();
  private commandWheel: Phaser.GameObjects.Container | null = null;
  private selectedCrabId: string | null = null;
  private waveX = -100;
  private waveAnimating = false;
  private waveTargetSectorId: string | null = null;
  private shellItems: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  preload(): void {
    // All graphics are procedural — nothing to load
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#87ceeb');

    this.beachGraphics = this.add.graphics();
    this.tideGraphics = this.add.graphics();
    this.castleGraphics = this.add.graphics();
    this.waveGraphics = this.add.graphics();

    this.drawBeach();
    this.spawnShellItems();

    // Input: close wheel on background tap
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!this.commandWheel) return;
      const wx = this.commandWheel.x;
      const wy = this.commandWheel.y;
      const dist = Phaser.Math.Distance.Between(ptr.x, ptr.y, wx, wy);
      if (dist > 80) this.closeCommandWheel();
    });

    // Listen to store events
    gameStore.on('runStarted', () => this.onRunStarted());
    gameStore.on('stateChanged', () => this.onStateChanged());
    gameStore.on('waveIncoming', (wave: WaveEvent) => this.startWaveAnimation(wave));
    gameStore.on('crabRecruited', (crab: Crab) => this.addCrabSprite(crab));

    // Start the run
    gameStore.startRun();
  }

  private onRunStarted(): void {
    // Clear existing crab sprites
    for (const s of this.crabSprites.values()) s.container.destroy();
    this.crabSprites.clear();

    const state = gameStore.state;
    for (const crab of state.crabs.values()) {
      this.addCrabSprite(crab);
    }
  }

  private addCrabSprite(crab: Crab): void {
    const startPos = this.getStartPosition(crab);

    const body = this.add.ellipse(0, 0, 22, 18, PROFESSION_COLORS[crab.profession] ?? 0xcccccc);
    body.setStrokeStyle(2, 0x000000, 0.4);

    // Claws
    const clawL = this.add.ellipse(-14, 4, 10, 7, PROFESSION_COLORS[crab.profession] ?? 0xcccccc);
    const clawR = this.add.ellipse(14, 4, 10, 7, PROFESSION_COLORS[crab.profession] ?? 0xcccccc);

    const nameText = this.add.text(0, -16, crab.name, {
      fontSize: '9px', color: '#fff',
      stroke: '#000', strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5, 1);

    const taskText = this.add.text(0, 13, '', {
      fontSize: '8px', color: '#ffff88',
      stroke: '#000', strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5, 0);

    const container = this.add.container(startPos.x, startPos.y, [body, clawL, clawR, nameText, taskText]);
    container.setSize(28, 28);
    container.setInteractive();

    container.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      ptr.event.stopPropagation();
      this.openCommandWheel(crab.id);
    });

    const sprite: CrabSprite = {
      container,
      body,
      nameText,
      taskText,
      targetX: startPos.x,
      targetY: startPos.y,
      wanderTimer: Math.random() * 3,
      patrolIndex: 0,
    };
    this.crabSprites.set(crab.id, sprite);
  }

  private getStartPosition(crab: Crab): { x: number; y: number } {
    if (crab.profession === 'Forager') {
      return FORAGER_ZONES[Math.floor(Math.random() * FORAGER_ZONES.length)];
    }
    const sid = crab.targetSectorId ?? 'core';
    const positions = SECTOR_WORK_POSITIONS[sid] ?? SECTOR_WORK_POSITIONS['core'];
    return positions[Math.floor(Math.random() * positions.length)];
  }

  private openCommandWheel(crabId: string): void {
    this.closeCommandWheel();
    const state = gameStore.state;
    const crab = state.crabs.get(crabId);
    if (!crab || !crab.isAlive) return;

    this.selectedCrabId = crabId;
    const sprite = this.crabSprites.get(crabId);
    if (!sprite) return;

    const cx = sprite.container.x;
    const cy = sprite.container.y;

    const wheel = this.add.container(cx, cy);
    // Background circle
    const bg = this.add.circle(0, 0, 80, 0x000000, 0.7);
    bg.setStrokeStyle(1, 0xc0a030, 0.8);
    wheel.add(bg);

    const tasks = this.getAvailableTasks(crab);
    const angleStep = (Math.PI * 2) / tasks.length;

    tasks.forEach((task, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const tx = Math.cos(angle) * 58;
      const ty = Math.sin(angle) * 58;

      const btn = this.add.circle(tx, ty, 20, task.color, 1);
      btn.setStrokeStyle(2, 0xffffff, 0.6);
      btn.setInteractive({ useHandCursor: true });

      const label = this.add.text(tx, ty, task.icon, {
        fontSize: '14px', align: 'center',
      }).setOrigin(0.5, 0.5);

      const subLabel = this.add.text(tx, ty + 22, task.label, {
        fontSize: '8px', color: '#fff', align: 'center',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0);

      btn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event.stopPropagation();
        this.assignTaskFromWheel(crabId, task.task, task.sectorId);
        this.closeCommandWheel();
      });

      wheel.add([btn, label, subLabel]);
    });

    // Crab name in center
    const centerLabel = this.add.text(0, 0, crab.name, {
      fontSize: '9px', color: '#ffd700',
      stroke: '#000', strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5, 0.5);
    wheel.add(centerLabel);

    // Keep wheel on screen
    wheel.x = Phaser.Math.Clamp(cx, 90, W - 90);
    wheel.y = Phaser.Math.Clamp(cy, 90, H - 90);

    this.commandWheel = wheel;
    this.tweens.add({ targets: wheel, scaleX: { from: 0.3, to: 1 }, scaleY: { from: 0.3, to: 1 }, duration: 150, ease: 'Back.Out' });
  }

  private getAvailableTasks(crab: Crab): { task: import('../types').TaskType; label: string; icon: string; color: number; sectorId?: string }[] {
    const tasks: { task: import('../types').TaskType; label: string; icon: string; color: number; sectorId?: string }[] = [
      { task: 'RaiseWall', label: 'Build',   icon: '🏗️', color: 0x8b6914, sectorId: 'south' },
      { task: 'Dig',       label: 'Dig',     icon: '⛏️', color: 0x4a7c59, sectorId: 'south' },
      { task: 'Patrol',    label: 'Patrol',  icon: '🛡️', color: 0x2a5580, sectorId: 'north' },
      { task: 'Gather',    label: 'Gather',  icon: '🐚', color: 0x6a4c93, sectorId: null as unknown as string },
      { task: 'Rest',      label: 'Rest',    icon: '😴', color: 0x555555, sectorId: 'core' },
      { task: 'Ritual',    label: 'Ritual',  icon: '✨', color: 0xaa2020, sectorId: 'core' },
    ];
    // Treacherous crabs have sabotage option removed (they'd do it themselves)
    return tasks.filter(t => t.task !== 'Sabotage');
  }

  private assignTaskFromWheel(crabId: string, task: import('../types').TaskType, sectorId?: string): void {
    // Pick best sector for task
    const sectors = gameStore.state.sectors;
    let sid = sectorId ?? 'south';
    if (task === 'RaiseWall') {
      // Pick most damaged non-core sector
      let lowest = Infinity;
      for (const [id, sec] of sectors) {
        if (id === 'core') continue;
        if (sec.hp < lowest) { lowest = sec.hp; sid = id; }
      }
    } else if (task === 'Dig') {
      // Pick sector with no moat
      for (const [id, sec] of sectors) {
        if (id === 'core') continue;
        if (!sec.hasMoat) { sid = id; break; }
      }
    } else if (task === 'Gather') {
      sid = 'west'; // Lower area
    }
    gameStore.assignTask(crabId, task, sid);
  }

  private closeCommandWheel(): void {
    if (this.commandWheel) {
      this.tweens.add({
        targets: this.commandWheel,
        scaleX: 0, scaleY: 0,
        duration: 100,
        onComplete: () => { this.commandWheel?.destroy(); this.commandWheel = null; },
      });
    }
    this.selectedCrabId = null;
  }

  private startWaveAnimation(wave: WaveEvent): void {
    this.waveAnimating = true;
    this.waveX = -30;
    this.waveTargetSectorId = wave.targetSectorId;
  }

  update(_time: number, delta: number): void {
    if (gameStore.state.phase !== 'running') return;
    gameStore.update(delta);

    this.drawTide();
    this.drawCastle();
    this.updateWaveAnimation(delta);
    this.updateCrabMovement(delta);
  }

  private drawBeach(): void {
    const g = this.beachGraphics;
    g.clear();

    // Sky gradient (simple bands)
    g.fillGradientStyle(0x87ceeb, 0x87ceeb, 0xffd580, 0xffd580, 1);
    g.fillRect(0, 0, W, 110);

    // Upper beach sand
    g.fillGradientStyle(0xf4d03f, 0xf4d03f, 0xe8b84b, 0xe8b84b, 1);
    g.fillRect(0, 110, W, 300);

    // Lower beach (darker sand)
    g.fillStyle(0xd4a030);
    g.fillRect(0, 410, W, 300);

    // Decorative wave lines on dry sand
    g.lineStyle(1, 0xc8a020, 0.3);
    for (let y = 440; y < 700; y += 25) {
      g.beginPath();
      for (let x = 0; x < W; x += 8) {
        const yOff = Math.sin(x * 0.05 + y * 0.02) * 4;
        if (x === 0) g.moveTo(x, y + yOff);
        else g.lineTo(x, y + yOff);
      }
      g.strokePath();
    }

    // Horizon line
    g.lineStyle(2, 0x4a90d9, 0.4);
    g.strokeLineShape(new Phaser.Geom.Line(0, 110, W, 110));
  }

  private spawnShellItems(): void {
    const emojis = ['🐚', '🦀', '⭐', '🌊'];
    for (let i = 0; i < 12; i++) {
      const x = 30 + Math.random() * (W - 60);
      const y = 430 + Math.random() * 220;
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      const t = this.add.text(x, y, emoji, { fontSize: '14px' })
        .setAlpha(0.7)
        .setDepth(1);
      this.shellItems.push(t);
    }
  }

  private drawCastle(): void {
    const g = this.castleGraphics;
    g.clear();
    const state = gameStore.state;

    for (const [id, sector] of state.sectors) {
      const rect = SECTOR_RECTS[id];
      if (!rect) continue;
      const { x, y, w, h } = rect;
      const pct = sector.hp / sector.maxHp;

      // Shadow
      g.fillStyle(0x000000, 0.2);
      g.fillRect(x + 4, y + 4, w, h);

      // Wall body
      g.fillStyle(sectorColor(sector.hp, sector.maxHp), 1);
      g.fillRect(x, y, w, h);

      // Battlements on top
      g.fillStyle(sectorColor(sector.hp, sector.maxHp) - 0x111111, 1);
      const battleW = Math.max(6, Math.floor(w / 10)) * 2;
      for (let bx = x + 4; bx < x + w - 4; bx += battleW) {
        g.fillRect(bx, y - 8, battleW - 3, 8);
      }

      // Moat
      if (sector.hasMoat || sector.moatDepth > 0) {
        const moatAlpha = sector.moatDepth / 100;
        g.fillStyle(0x1e5f99, moatAlpha * 0.8);
        g.fillRect(x - 10, y + h - 6, w + 20, 10);
        g.lineStyle(1, 0x4a90d9, moatAlpha);
        g.strokeRect(x - 10, y + h - 6, w + 20, 10);
      }

      // HP bar
      const barY = y + h + 2;
      g.fillStyle(0x333333, 0.8);
      g.fillRect(x, barY, w, 5);
      const barColor = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffaa00 : 0xcc2222;
      g.fillStyle(barColor, 1);
      g.fillRect(x, barY, w * pct, 5);

      // Sector label
      // (rendered via Phaser text would be better but Graphics only for now)
      // Use a simple dot to show sector identity
      g.fillStyle(0x000000, 0.5);
      g.fillRect(x + w / 2 - 12, y + 4, 24, 10);

      // Outline
      g.lineStyle(2, 0x000000, 0.5);
      g.strokeRect(x, y, w, h);

      // Core gets a crown marker
      if (id === 'core') {
        g.fillStyle(0xffd700, 1);
        g.fillTriangle(
          x + w / 2, y - 4,
          x + w / 2 - 8, y + 4,
          x + w / 2 + 8, y + 4
        );
      }
    }

    // Connecting walls between sectors
    g.lineStyle(4, 0xa08060, 0.5);
    g.strokeLineShape(new Phaser.Geom.Line(220, 200, 220, 300)); // West-Core
    g.strokeLineShape(new Phaser.Geom.Line(320, 200, 320, 300)); // Core-East
  }

  private drawTide(): void {
    const g = this.tideGraphics;
    g.clear();
    const state = gameStore.state;

    // Tide fill rises from bottom
    const tideY = H - (state.tideLevel / 100) * (H - 380);

    // Water body
    g.fillGradientStyle(0x0a3f6e, 0x0a3f6e, 0x1e6fb4, 0x1e6fb4, 0.9);
    g.fillRect(0, tideY, W, H - tideY);

    // Wave crests on tide surface
    g.lineStyle(3, 0xffffff, 0.5);
    g.beginPath();
    const waveAmp = 6;
    const waveFreq = 0.05;
    const timeOffset = this.time.now * 0.001;
    for (let x = 0; x <= W; x += 4) {
      const waveY = tideY + Math.sin(x * waveFreq + timeOffset) * waveAmp;
      if (x === 0) g.moveTo(x, waveY);
      else g.lineTo(x, waveY);
    }
    g.strokePath();

    // Secondary wave
    g.lineStyle(2, 0xaaddff, 0.3);
    g.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const waveY = tideY + 12 + Math.sin(x * waveFreq * 0.7 + timeOffset * 1.3) * waveAmp;
      if (x === 0) g.moveTo(x, waveY);
      else g.lineTo(x, waveY);
    }
    g.strokePath();
  }

  private updateWaveAnimation(delta: number): void {
    const g = this.waveGraphics;
    g.clear();
    if (!this.waveAnimating) return;

    this.waveX += delta * 0.35;

    const targetRect = this.waveTargetSectorId ? SECTOR_RECTS[this.waveTargetSectorId] : null;
    const targetX = targetRect ? targetRect.x + targetRect.w / 2 : W / 2;

    if (this.waveX > targetX + 40) {
      this.waveAnimating = false;
      this.waveGraphics.clear();
      return;
    }

    // Draw wave as a curved surge line
    g.lineStyle(6, 0xffffff, 0.85);
    g.beginPath();
    const baseY = H - (gameStore.state.tideLevel / 100) * (H - 380);
    const crestY = Math.min(baseY, 400);

    for (let i = 0; i < 30; i++) {
      const px = this.waveX - i * 8;
      const progress = Phaser.Math.Clamp((this.waveX - px) / 200, 0, 1);
      const py = Phaser.Math.Linear(crestY, baseY, progress);
      const amp = (1 - progress) * 20;
      const wy = py + Math.sin(px * 0.12 + this.time.now * 0.002) * amp;
      if (i === 0) g.moveTo(px, wy);
      else g.lineTo(px, wy);
    }
    g.strokePath();

    // Foam dots
    g.fillStyle(0xffffff, 0.6);
    for (let i = 0; i < 5; i++) {
      const fx = this.waveX - i * 15 + Math.random() * 6;
      const fy = crestY + Math.random() * 20;
      g.fillCircle(fx, fy, 3 + Math.random() * 4);
    }
  }

  private updateCrabMovement(delta: number): void {
    const state = gameStore.state;
    const deltaSec = delta / 1000;

    for (const [id, sprite] of this.crabSprites) {
      const crab = state.crabs.get(id);
      if (!crab || !crab.isAlive) {
        sprite.container.setAlpha(0.3);
        continue;
      }

      sprite.container.setAlpha(crab.isTraitor ? 0.6 : 1);

      // Body color reflects traitor status
      sprite.body.setFillStyle(crab.isTraitor ? 0x880000 : (PROFESSION_COLORS[crab.profession] ?? 0xcccccc));

      // Task label
      sprite.taskText.setText(this.taskEmoji(crab.currentTask));

      // Wander timer — pick new target occasionally
      sprite.wanderTimer -= deltaSec;
      if (sprite.wanderTimer <= 0) {
        const newPos = this.pickTargetPosition(crab);
        sprite.targetX = newPos.x;
        sprite.targetY = newPos.y;
        sprite.wanderTimer = 2 + Math.random() * 3;
      }

      // Move toward target
      const dx = sprite.targetX - sprite.container.x;
      const dy = sprite.targetY - sprite.container.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2) {
        const speed = (crab.stats.speed / 100) * 55 * deltaSec;
        const step = Math.min(speed, dist);
        sprite.container.x += (dx / dist) * step;
        sprite.container.y += (dy / dist) * step;

        // Subtle bob when moving
        sprite.body.setScale(1 + Math.sin(this.time.now * 0.008) * 0.04);
      }

      // Claw bob animation
      sprite.body.setAngle(Math.sin(this.time.now * 0.004 + id.charCodeAt(0)) * 5);
    }
  }

  private pickTargetPosition(crab: Crab): { x: number; y: number } {
    if (crab.griefTimer > 0) {
      // Grief: sit at tide line
      const tideY = H - (gameStore.state.tideLevel / 100) * (H - 380) - 20;
      return { x: 200 + Math.random() * 80, y: Math.max(420, tideY - 10) };
    }

    if (crab.currentTask === 'Gather' || crab.profession === 'Forager') {
      const zone = FORAGER_ZONES[Math.floor(Math.random() * FORAGER_ZONES.length)];
      return { x: zone.x + (Math.random() - 0.5) * 40, y: zone.y + (Math.random() - 0.5) * 30 };
    }

    if (crab.currentTask === 'Patrol') {
      const idx = (crab as any)._patrolIdx ?? 0;
      const wp = PATROL_PATH[idx % PATROL_PATH.length];
      (crab as any)._patrolIdx = (idx + 1) % PATROL_PATH.length;
      return wp;
    }

    if (crab.currentTask === 'Rest') {
      return { x: 200 + Math.random() * 80, y: 240 + Math.random() * 60 };
    }

    const sid = crab.targetSectorId ?? 'core';
    const positions = SECTOR_WORK_POSITIONS[sid] ?? SECTOR_WORK_POSITIONS['core'];
    const pos = positions[Math.floor(Math.random() * positions.length)];
    return { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + (Math.random() - 0.5) * 20 };
  }

  private taskEmoji(task: string): string {
    switch (task) {
      case 'RaiseWall': return '🏗';
      case 'Dig': return '⛏';
      case 'Patrol': return '🛡';
      case 'Gather': return '🐚';
      case 'Rest': return '💤';
      case 'Ritual': return '✨';
      case 'Recruit': return '📣';
      case 'Sabotage': return '💀';
      default: return '';
    }
  }

  private onStateChanged(): void {
    // Remove dead crab sprites after a moment
    const state = gameStore.state;
    for (const [id, sprite] of this.crabSprites) {
      const crab = state.crabs.get(id);
      if (crab && !crab.isAlive) {
        this.tweens.add({
          targets: sprite.container,
          alpha: 0, y: sprite.container.y + 20,
          duration: 1000,
          onComplete: () => {
            sprite.container.destroy();
            this.crabSprites.delete(id);
          },
        });
      }
    }
  }
}
