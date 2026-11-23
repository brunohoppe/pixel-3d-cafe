import Peer from 'peerjs';

// Transporte comum aos dois modos: { send(msg), onMessage(fn), onClose(fn), close() }
//  - online: WebRTC via PeerJS (servidor público e gratuito só para o "aperto de mão")
//  - local:  BroadcastChannel entre abas do mesmo navegador (testes, ?local na URL)

const PREFIX = 'pixel-3d-cafe-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const randomCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const normalizeCode = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

function makeTransport(sendRaw, closeRaw) {
  const msgFns = [], closeFns = [];
  let closed = false;
  const t = {
    send(msg) {
      if (!closed) sendRaw(msg);
    },
    onMessage: (fn) => msgFns.push(fn),
    onClose: (fn) => closeFns.push(fn),
    close() {
      if (closed) return;
      closeRaw();
      t._closed();
    },
    _recv: (msg) => !closed && msgFns.forEach((fn) => fn(msg)),
    _closed() {
      if (closed) return;
      closed = true;
      closeFns.forEach((fn) => fn());
    },
  };
  return t;
}

// ------------------------------------------------------------------ Online (PeerJS)
function fromConn(conn) {
  const t = makeTransport((m) => conn.open && conn.send(m), () => conn.close());
  conn.on('data', (d) => t._recv(d));
  conn.on('close', () => t._closed());
  conn.on('error', () => t._closed());
  addEventListener('pagehide', () => t.close());
  return t;
}

const peerError = (err) => ({
  'unavailable-id': 'taken',
  'peer-unavailable': 'Sala não encontrada. Confira o código.',
  network: 'Sem conexão com o servidor de salas.',
  'server-error': 'Servidor de salas indisponível. Tente de novo.',
  'browser-incompatible': 'Este navegador não suporta WebRTC.',
}[err.type] || `Erro de conexão (${err.type || err.message || err}).`);

export function hostOnline(code, { onReady, onGuest, onError }) {
  const peer = new Peer(PREFIX + code);
  peer.on('open', () => onReady(code));
  peer.on('connection', (conn) => conn.on('open', () => onGuest(fromConn(conn))));
  peer.on('error', (err) => onError(peerError(err)));
  // Se cair do servidor de salas, as conexões abertas continuam; reconecta para aceitar novas
  peer.on('disconnected', () => !peer.destroyed && peer.reconnect());
  return peer;
}

export function joinOnline(code, { onOpen, onError }) {
  const peer = new Peer();
  let done = false;
  const fail = (msg) => {
    if (done) return;
    done = true;
    peer.destroy();
    onError(msg);
  };
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      if (done) return;
      done = true;
      onOpen(fromConn(conn));
    });
  });
  peer.on('error', (err) => fail(peerError(err)));
  setTimeout(() => fail('Tempo esgotado ao conectar. Confira o código ou a rede.'), 15000);
  return peer;
}

// ------------------------------------------------------------------ Local (BroadcastChannel)
// Cada aba que entra ganha um id de conexão (cid); o host decide se aceita (máx. 1 parceiro)
export function hostLocal(code, { onReady, onGuest }) {
  const ch = new BroadcastChannel(`pixelcafe-${code}`);
  const conns = new Map();
  ch.onmessage = ({ data: d }) => {
    if (d.from !== 'guest') return;
    if (d.type === 'connect') {
      const cid = d.cid;
      const t = makeTransport(
        (msg) => ch.postMessage({ from: 'host', cid, type: 'msg', msg }),
        () => ch.postMessage({ from: 'host', cid, type: 'bye' }),
      );
      t.onClose(() => conns.delete(cid));
      conns.set(cid, t);
      ch.postMessage({ from: 'host', cid, type: 'accept' });
      onGuest(t);
    } else if (d.type === 'msg') conns.get(d.cid)?._recv(d.msg);
    else if (d.type === 'bye') conns.get(d.cid)?._closed();
  };
  addEventListener('pagehide', () => conns.forEach((t) => t.close()));
  queueMicrotask(() => onReady(code));
}

export function joinLocal(code, { onOpen, onError }) {
  const ch = new BroadcastChannel(`pixelcafe-${code}`);
  const cid = Math.random().toString(36).slice(2);
  let t = null;
  ch.onmessage = ({ data: d }) => {
    if (d.from !== 'host' || d.cid !== cid) return;
    if (d.type === 'accept' && !t) {
      t = makeTransport(
        (msg) => ch.postMessage({ from: 'guest', cid, type: 'msg', msg }),
        () => ch.postMessage({ from: 'guest', cid, type: 'bye' }),
      );
      addEventListener('pagehide', () => t.close());
      onOpen(t);
    } else if (t && d.type === 'msg') t._recv(d.msg);
    else if (t && d.type === 'bye') t._closed();
  };
  ch.postMessage({ from: 'guest', cid, type: 'connect' });
  setTimeout(() => !t && onError('Sala local não encontrada.'), 3000);
}
