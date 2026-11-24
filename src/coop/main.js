// Co-op online para 2 jogadores: lobby (criar/entrar na sala) e montagem da partida
import { createSession } from '../core/session.js';
import { initAudio } from '../audio.js';
import { NPCPuppets } from './net/puppets.js';
import { startHost } from './net/host.js';
import { startClient } from './net/client.js';
import { randomCode, normalizeCode, hostOnline, joinOnline, hostLocal, joinLocal } from './net/transport.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const local = qs.has('local'); // ?local = abas do mesmo navegador (testes)
const debug = (S) => qs.has('debug') && import('../debug/index.js').then((m) => m.attachDebug(S)); // ?debug: clique do mouse
const lobby = $('lobby');
const status = (msg, err = false) => {
  $('lobbyStatus').textContent = msg;
  $('lobbyStatus').classList.toggle('err', err);
};
let busy = false;

function showRoom(code) {
  $('hud').classList.remove('off');
  $('roomCode').textContent = code;
  $('roomPanel').style.display = 'block';
}
function setRoomStatus(s) {
  $('roomStatus').textContent = s === 'connected' ? 'parceiro conectado' : 'aguardando parceiro...';
}

function createRoom(code = randomCode(), tries = 0) {
  if (busy && tries === 0) return;
  busy = true;
  initAudio();
  status('Criando sala...');
  let host = null;
  const handlers = {
    onReady(c) {
      lobby.classList.add('hidden');
      const S = createSession({ mode: 'host', coop: true, localId: 'host', localSheet: 'player', keepAliveInBackground: true });
      host = startHost(S, { onStatus: setRoomStatus });
      debug(S);
      if (import.meta.env.DEV) window.__S = S; // inspeção em desenvolvimento
      showRoom(c);
      setRoomStatus('waiting');
      S.run();
      S.fx.toast(`Sala ${c} criada — passe o código ao parceiro`, 'gold');
    },
    onGuest: (t) => host?.attach(t),
    onError(msg) {
      if (msg === 'taken' && tries < 3) return createRoom(randomCode(), tries + 1);
      busy = false;
      status(msg === 'taken' ? 'Não foi possível criar a sala. Tente de novo.' : msg, true);
    },
  };
  if (local) hostLocal(code, handlers);
  else hostOnline(code, handlers);
}

function joinRoom(raw) {
  const code = normalizeCode(raw);
  if (busy) return;
  if (code.length < 4) return status('Digite o código da sala.', true);
  busy = true;
  initAudio();
  status(`Entrando na sala ${code}...`);
  const handlers = {
    onOpen(t) {
      lobby.classList.add('hidden');
      const S = createSession({
        mode: 'client', coop: true, localId: 'guest', localSheet: 'player2', keepAliveInBackground: true,
        makeNpcs: (scene, overlay) => new NPCPuppets(scene, overlay),
      });
      startClient(S, t, { onEnd: showEnd });
      debug(S);
      if (import.meta.env.DEV) window.__S = S; // inspeção em desenvolvimento
      showRoom(code);
      setRoomStatus('connected');
      S.run();
      S.fx.toast('Conectado! Vocês dividem a cafeteria', 'gold');
    },
    onError(msg) {
      busy = false;
      status(msg, true);
    },
  };
  if (local) joinLocal(code, handlers);
  else joinOnline(code, handlers);
}

function showEnd(msg) {
  $('endMsg').textContent = msg;
  $('endScreen').classList.remove('hidden');
}

$('btnHost').addEventListener('click', () => createRoom());
$('btnJoin').addEventListener('click', () => joinRoom($('codeInput').value));
$('codeInput').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') joinRoom($('codeInput').value);
});
$('btnBack').addEventListener('click', () => location.reload());

// Atalhos: ?host=CODIGO cria a sala com esse código; ?join=CODIGO entra direto
if (qs.get('host')) createRoom(normalizeCode(qs.get('host')));
else if (qs.get('join')) joinRoom(qs.get('join'));
