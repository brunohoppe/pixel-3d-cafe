// Jogo solo: monta a partida com um barista e a tela inicial
import { createSession } from './core/session.js';

createSession({ mode: 'solo', titleScreen: true }).run();
