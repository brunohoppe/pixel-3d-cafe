// Jogo solo: monta a partida com um barista e a tela inicial
import { createSession } from './core/session.js';

createSession({ mode: 'solo', titleScreen: true }).run();

// O link do co-op na tela inicial não deve iniciar o jogo solo
document.querySelector('.coop-link a')?.addEventListener('pointerdown', (e) => e.stopPropagation());
