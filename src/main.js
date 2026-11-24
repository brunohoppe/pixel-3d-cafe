// Jogo solo: monta a partida com um barista e a tela inicial
import { createSession } from './core/session.js';

const S = createSession({ mode: 'solo', titleScreen: true });
S.run();

// ?debug na URL: clique do mouse para andar, interagir e inspecionar (módulo carregado à parte)
if (new URLSearchParams(location.search).has('debug')) import('./debug/index.js').then((m) => m.attachDebug(S));

// O link do co-op na tela inicial não deve iniciar o jogo solo
document.querySelector('.coop-link a')?.addEventListener('pointerdown', (e) => e.stopPropagation());
