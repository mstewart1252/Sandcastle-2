import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { NarrativeEngine } from './NarrativeEngine';
import { gameStore } from './GameStore';

// Wire up the narrative engine (it auto-connects to the store via events)
new NarrativeEngine(gameStore);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 480,
  height: 854,
  parent: 'game-container',
  backgroundColor: '#87ceeb',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene, UIScene],
  render: {
    antialias: true,
    pixelArt: false,
  },
};

const game = new Phaser.Game(config);

// Start the UI scene simultaneously
game.events.on('ready', () => {
  game.scene.start('UIScene');
});

export default game;
