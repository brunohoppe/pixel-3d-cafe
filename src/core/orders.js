// Lista de pedidos: clientes da fila + quem está na retirada. Permite indicar quem vai
// retirar o café na bandeja do balcão, sem esperar a vez na fila.
// Aparece em dois lugares: no caixa registradora (menu perto do balcão) e no app do celular.
// É só tela: a escolha vira action(player, idDoCliente) no interativo 'orders'
// (no co-op o pedido vai para o host, que valida).
import { NPC_SHEETS, PICKUP_MAX } from '../npc.js';
import { spriteTex } from '../util.js';

const REFRESH = 0.2; // s entre reconstruções da lista

// Lista dentro de `root` (precisa ter .osub e .orows)
export function createOrdersList(S, root) {
  const sub = root.querySelector('.osub');
  const rows = root.querySelector('.orows');
  let queue = []; // clientes listados, na ordem da fila (índice = tecla - 1)
  let lastBuild = -Infinity;

  const face = (n) => spriteTex(NPC_SHEETS[n.sheet] ?? NPC_SHEETS[0]).image?.src || '';
  const pct = (n) => Math.max(0, Math.min(1, n.patienceMax ? n.patience / n.patienceMax : n.patience));

  function build() {
    const list = S.npcs.list;
    queue = list.filter((n) => n.state === 'queue').sort((a, b) => a.slot - b.slot);
    const pickup = list.filter((n) => n.state === 'pickup');
    const full = pickup.length >= PICKUP_MAX;
    sub.textContent = `Retirada ${pickup.length}/${PICKUP_MAX} · bandeja: ${S.game.counterCups} café(s)`;

    rows.replaceChildren();
    const row = (n, i, status, canPick) => {
      const r = document.createElement('div');
      r.className = 'orow' + (canPick ? ' can' : '');
      if (canPick) r.dataset.idx = i;
      const key = document.createElement('span');
      key.className = 'okey';
      key.textContent = canPick ? `${i + 1}` : '·';
      const img = document.createElement('span');
      img.className = 'oface';
      img.style.backgroundImage = `url("${face(n)}")`;
      const info = document.createElement('span');
      info.className = 'oinfo';
      const name = document.createElement('span');
      name.textContent = `Cliente ${n.id} — ${status}`;
      const bar = document.createElement('span');
      bar.className = 'obar';
      const fill = document.createElement('span');
      const f = n.waiting ? pct(n) : 1;
      fill.style.width = `${f * 100}%`;
      fill.style.background = f > 0.5 ? '#5bbf5b' : f > 0.25 ? '#ffd34e' : '#e8424f';
      bar.appendChild(fill);
      info.append(name, bar);
      r.append(key, img, info);
      rows.appendChild(r);
    };
    queue.forEach((n, i) => row(n, i, `${i + 1}º na fila`, !full && i < 9));
    pickup.forEach((n) => row(n, -1, n.atSpot ? 'esperando na retirada' : 'indo à retirada', false));
    if (!queue.length && !pickup.length) {
      const empty = document.createElement('div');
      empty.className = 'oempty';
      empty.textContent = 'Ninguém na fila.';
      rows.appendChild(empty);
    }
    lastBuild = S.simTime;
  }

  rows.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const r = e.target.closest('.orow.can');
    if (r) list.choose(+r.dataset.idx);
  });

  const list = {
    // Indica o cliente da posição `i` (0 = 1º da fila) para retirar no balcão
    choose(i) {
      const n = queue[i];
      const it = S.interactables.find((x) => x.id === 'orders');
      if (!n || !it) return;
      S.requestAction(it, n.id);
      lastBuild = -Infinity; // atualiza já no próximo quadro
    },
    refresh(force = false) {
      if (force || S.simTime - lastBuild >= REFRESH) build();
    },
  };
  return list;
}

// Menu do caixa registradora: só vale enquanto o barista está perto dele
export function createOrdersMenu(S) {
  const el = document.createElement('div');
  el.id = 'ordersMenu';
  el.className = 'panel olist';
  el.innerHTML = `
    <div class="otitle">PEDIDOS</div>
    <div class="osub"></div>
    <div class="orows"></div>
    <div class="ohint">1-9 ou clique: retirar no balcão · E/Esc fecha</div>`;
  document.body.appendChild(el);
  const list = createOrdersList(S, el);
  let openIt = null;

  const menu = {
    get isOpen() {
      return !!openIt;
    },
    open(it) {
      S.phone?.close();
      openIt = it;
      el.classList.add('show');
      list.refresh(true);
    },
    close() {
      openIt = null;
      el.classList.remove('show');
    },
    choose: (i) => openIt && list.choose(i),
    // A cada quadro: fecha se o barista se afastou do caixa; atualiza a lista
    update() {
      if (!openIt) return;
      if (S.current?.it !== openIt) return menu.close();
      list.refresh();
    },
  };
  return menu;
}
