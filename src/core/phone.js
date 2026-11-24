// Celular do barista: botão no HUD (embaixo do inventário) que abre um celular com apps.
// App "Pedidos": a mesma lista do caixa, usada de qualquer lugar do mapa.
import { icon } from '../icons.js';
import { createOrdersList } from './orders.js';

export function createPhone(S) {
  // Coluna da direita do HUD: inventário + botão do celular logo abaixo
  const inv = document.getElementById('inv');
  const col = document.createElement('div');
  col.id = 'hudRight';
  inv.parentNode.insertBefore(col, inv);
  col.appendChild(inv);

  const btn = document.createElement('button');
  btn.id = 'phoneBtn';
  btn.title = 'Celular (C)';
  btn.innerHTML = `<img alt="Celular" /><span class="pbadge"></span>`;
  btn.querySelector('img').src = icon('phone').url;
  col.appendChild(btn);
  const badge = btn.querySelector('.pbadge');

  const el = document.createElement('div');
  el.id = 'phone';
  el.innerHTML = `
    <div class="pnotch"></div>
    <div class="pscreen">
      <div class="pstatus"><span class="ptime"></span><span>CaféNet ▮▮▮</span></div>
      <div class="phome">
        <button class="papp" data-app="orders">
          <span class="picon"><img alt="" /><span class="pbadge"></span></span>
          <span class="plabel">Pedidos</span>
        </button>
      </div>
      <div class="pview olist">
        <div class="phead"><button class="pback">◀</button><span class="otitle">PEDIDOS</span></div>
        <div class="osub"></div>
        <div class="orows"></div>
        <div class="ohint">1-9 ou toque: retirar no balcão · Esc fecha</div>
      </div>
    </div>
    <button class="phomebar" title="Início"></button>`;
  document.body.appendChild(el);
  el.querySelector('.papp img').src = icon('coffee').url;
  const time = el.querySelector('.ptime');
  const appBadge = el.querySelector('.papp .pbadge');
  const list = createOrdersList(S, el.querySelector('.pview'));

  let open = false;
  let app = null; // null = tela inicial
  let lastCount = -1;

  // Abre logo abaixo do botão, sem cobrir o inventário
  const place = () => {
    const top = Math.round(btn.getBoundingClientRect().bottom + 10);
    el.style.top = `${top}px`;
    el.style.height = `${Math.max(240, Math.min(520, innerHeight - top - 16))}px`;
  };
  addEventListener('resize', () => open && place());

  const render = () => {
    if (open) place();
    el.classList.toggle('show', open);
    el.classList.toggle('inapp', !!app);
    btn.classList.toggle('on', open);
  };

  const phone = {
    get isOpen() {
      return open;
    },
    get appOpen() {
      return open && app === 'orders';
    },
    open() {
      S.ui?.orders.close();
      open = true;
      render();
    },
    close() {
      open = false;
      app = null;
      render();
    },
    toggle() {
      open ? phone.close() : phone.open();
    },
    openApp(name) {
      app = name;
      render();
      list.refresh(true);
    },
    home() {
      app = null;
      render();
    },
    choose: (i) => phone.appOpen && list.choose(i),
    update() {
      const n = S.npcs.queueLength ?? 0;
      if (n !== lastCount) {
        lastCount = n;
        badge.textContent = appBadge.textContent = n ? `${n}` : '';
      }
      if (!open) return;
      const d = new Date();
      time.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      if (app === 'orders') list.refresh();
    },
  };

  // Cliques não vazam para o jogo (o debug anda com o botão do mouse)
  for (const n of [btn, el]) n.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', () => phone.toggle());
  el.querySelector('.papp').addEventListener('click', () => phone.openApp('orders'));
  el.querySelector('.pback').addEventListener('click', () => phone.home());
  el.querySelector('.phomebar').addEventListener('click', () => phone.home());
  return phone;
}
