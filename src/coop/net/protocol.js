// Protocolo do co-op (host autoritativo)
//
// parceiro → host
//   { t: 'hello', v }            ao conectar
//   { t: 'p', x, z, a, s }       posição/ângulo/velocidade do barista do parceiro (20×/s)
//   { t: 'i', id, arg }          pedido de interação com o objeto `id` (arg: ex. id do cliente no menu de pedidos)
//
// host → parceiro
//   { t: 'welcome', v }          aceito na sala
//   { t: 'full' } / { t: 'version' }  recusado
//   { t: 's', time, g, m, pl, q, h, gc, n, ev }  snapshot (15×/s):
//     g  = [dinheiro, grãos, reputação, atendidos, perdidos, cafés na bandeja do balcão]
//     m  = cafeteira [preparando, t, prontas]
//     pl = canteiros [[estado, progresso, regado], ...]
//     q  = [tamanho da fila, primeiro pronto para servir]
//     h  = barista do host [x, z, ângulo, velocidade, xícaras]
//     gc = xícaras do parceiro
//     n  = clientes (ver NPCManager.toNet)
//     ev = efeitos desde o último snapshot (som, avisos, textos, partículas)

export const VERSION = 3; // 2: bandeja do balcão no estado; 3: retirada no balcão (estado 'pickup', slot na fila)
export const SNAP_HZ = 15;
export const INPUT_HZ = 20;
export const INTERP_DELAY = 0.1; // s de atraso para interpolar entre snapshots
export const TIMEOUT = 10; // s sem mensagens = conexão caiu

export const now = () => performance.now() / 1000;
export const r2 = (v) => Math.round(v * 100) / 100;

export function encodeGame(g) {
  return [g.money, g.beans, g.rep, g.served, g.lost, g.counterCups];
}

export function applyGame(g, a) {
  [g.money, g.beans, g.rep, g.served, g.lost, g.counterCups] = a;
}
