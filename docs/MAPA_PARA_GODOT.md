# Mapa para portar o Pixel Café para o Godot 4

Guia para reescrever o jogo à mão no Godot 4. Ele descreve **o estado atual do diretório de trabalho**, que é a versão com visual pixel art (câmera isométrica, sprites e texturas PNG). Essa versão ainda **não foi commitada**: o único commit (`d8efe51`) é a versão antiga em voxel. Se for comparar com o original, rode a versão do diretório (`npm run dev`), não a do commit.

Unidades: 1 unidade de mundo ≈ 1 metro. Eixos iguais aos do Godot: **Y para cima**, X para a direita, Z para "baixo" no mapa (sul). O three.js e o Godot usam o mesmo sistema destro, então as coordenadas deste documento podem ser copiadas direto.

> **Atenção, duas coisas pedidas no roteiro não existem no jogo:**
> - **XP**: não existe. O que faz esse papel é a **reputação** (`game.rep`, de 0 a 100), que define as estrelas. Este documento chama isso de "reputação (equivale ao XP)".
> - **Fechar a loja**: não existe. Não há ciclo de dia, horário, fim de expediente, salvamento nem fim de jogo. O jogo roda para sempre. Isso está na seção 9 como funcionalidade faltando.

---

## 1. Visão geral

Você é o barista da única cafeteria de uma rua. Pedestres andam nas duas calçadas. Alguns querem café (ícone ☕ sobre a cabeça) e, ao chegar à faixa de pedestres, entram na fila da cafeteria. Você colhe grãos na horta ao lado, usa a cafeteira atrás do balcão para transformar grãos em xícaras e serve o primeiro da fila no balcão. Cliente bem atendido paga e aumenta a reputação. Cliente que espera demais desiste e reduz a reputação. A reputação define as **estrelas (1 a 5)**, e cada estrela libera **+5 lugares na fila**, traz mais pedestres e deixa os clientes menos pacientes.

**Loop principal:**

```
Horta: plantar → (regar, opcional) → crescer → colher (+2 grãos)
            ↓
Cafeteira: 1 grão → 4 s → 2 xícaras na máquina → pegar (até 4 nas mãos)
            ↓
Pedestres surgem → na faixa decidem querer café → entram na fila (se houver vaga)
            ↓
Chegam à vaga → paciência começa a contar
            ↓
Jogador serve no balcão → +$ e +reputação → cliente sai feliz
       ou paciência acaba → −reputação → cliente sai bravo
            ↓
Reputação → estrelas → tamanho da fila, frequência de clientes, paciência
```

Não existe "fechar a loja": o loop é contínuo.

---

## 2. Funcionalidades

### 2.1 Movimento do jogador

**Para o jogador:** anda com WASD ou setas, corre com Shift, colide com paredes, móveis, árvores e NPCs. A direção é relativa à tela: W leva para cima **na tela**, e não para o −Z do mundo, porque a câmera está girada 45°.

**Regras e números** (`src/main.js`, `updatePlayer`):
- Entrada na tela `(sx, sy)` convertida para o mundo com os eixos da câmera:
  `dir = sx * groundRight + sy * groundUp`, normalizado.
  - `groundRight = (cos 45°, −sin 45°)` → no mundo, `(0,707, −0,707)` em (x, z).
  - `groundUp = (−sin 45°, −cos 45°)` → no mundo, `(−0,707, −0,707)` em (x, z).
- Velocidade: **4,0** andando e **6,2** com Shift (sem stamina).
- Aceleração suavizada: `vel += (alvo − vel) * (1 − e^(−12·dt))`. Não há aceleração constante: é uma interpolação exponencial.
- Ordem a cada frame:
  1. move `pos += vel * dt`;
  2. empurra para fora dos NPCs: se a distância até um NPC for < **0,6**, o jogador é afastado até 0,6 (o NPC não se mexe nesse passo);
  3. resolve colisão com os retângulos (raio do jogador **0,35**) usando `resolveCircle`;
  4. limita a área: `x ∈ [−44, 44]`, `z ∈ [−15, 12,3]`.
- Altura do chão: `y` interpola para `groundY(x, z)` com fator `min(1, dt·15)`:
  - dentro da cafeteria (`x ∈ (−9, 5)`, `z ∈ (−12, 0)`): 0,12
  - calçadas (`z ∈ [0, 3]` ou `[9, 11,6]`): 0,12
  - rua (`z ∈ (3, 9)`): 0,03
  - resto: 0
- Direção para onde olha: só muda com velocidade > **0,3**. Interpola o ângulo pelo caminho mais curto (`lerpAngle`) com fator `1 − e^(−14·dt)`. O ângulo é `atan2(vel.x, vel.z)`.
- Posição inicial: `(6, 0,12, 1,8)` (calçada norte, entre a cafeteria e a horta).

**Colisão** (`src/util.js`, `solid`, `solidBox`, `resolveCircle`): uma lista global de retângulos AABB no plano XZ. Para cada um, calcula o ponto mais próximo do círculo e empurra para fora. Se o centro estiver dentro do retângulo, empurra pelo lado de menor penetração. É um único passe e a ordem importa pouco. Os retângulos são criados em `world.js` e `garden.js` (veja 2.10).

**Estados:** parado (velocidade ≤ 0,3, quadro 0 da animação) ou andando.

**Depende de:** layout do mundo (colisores), lista de NPCs, câmera (eixos para a entrada).

**Arquivos:** `src/main.js` (`updatePlayer`), `src/util.js` (`resolveCircle`, `groundY`, `clamp`, `lerpAngle`), `src/sprites.js` (`CAM.groundRight` e `CAM.groundUp`).

---

### 2.2 Câmera de jogo

**Para o jogador:** a câmera segue o jogador com um pequeno atraso, em vista isométrica fixa (não gira).

**Regras** (`src/main.js`, `updateCamera`; `src/pixelRenderer.js`, `follow`):
- O alvo `camTarget` começa em `(6, 0, 1,8)`. Só X e Z seguem o jogador (Y fica 0), com fator `1 − e^(−5·dt)`.
- A câmera fica em `alvo + toCam * 60`, olhando para o alvo, onde `toCam = (sin45·cos30, sin30, cos45·cos30)`.
- A câmera ortográfica mostra exatamente `rtW × rtH` pixels do render target, cada um com `texel = 1/18` unidade de mundo (veja a seção 6).
- A posição da câmera é arredondada para a grade de pixels (detalhes em 6.3).

**Depende de:** jogador e renderizador de pixels.

---

### 2.3 Sistema de interação

**Para o jogador:** perto de algo interativo aparece um balão escuro "[E] ação" sobre o objeto. E ou Espaço executa a ação. Se a ação estiver indisponível, o balão fica cinza, sem o "E", e apertar E toca um som de "negado".

**Regras** (`src/main.js`, `interactables`, `findInteractable`, listener de `keydown`):
- Cada interativo tem: `pos` (ponto no chão), `r` (raio de alcance, medido só no plano XZ), `py` (altura do balão), `label()` e `action()`.
- `label()` retorna `null` (não mostra nada), `{ text }` (ação disponível) ou `{ text, off: true }` (indisponível, só informa).
- A cada frame, entre os interativos com distância ≤ `r` e `label() != null`, vale o **mais próximo**.
- E ou Espaço, sem repetição de tecla: se houver interativo atual e ele não estiver `off`, chama `action()`. Se estiver `off`, toca `sfx.deny`. Sem interativo, não faz nada.
- Antes de começar o jogo (tela inicial) não há interação.

**Lista de interativos:**

| Interativo | Ponto | Raio | Altura do balão |
|---|---|---|---|
| Cafeteira | (−5, 0,12, −10,4) | 2,0 | 2,9 |
| Balcão (servir) | (−4,5, 0,12, −7) | 2,0 | 1,9 |
| Canteiros da horta (6) | centro de cada canteiro | 2,1 | 1,4 |

**Depende de:** jogador, cafeteira, fila, horta e HUD (balão).

---

### 2.4 Cafeteira

**Para o jogador:** atrás do balcão. Com grãos, inicia um preparo que leva 4 s e gera 2 xícaras, que aparecem na bandeja da máquina. Interagir de novo pega as xícaras para as mãos (até 4) e, se possível, já inicia outro preparo no mesmo toque.

**Dados** (`src/main.js`, objeto `machine`): `brewing` (bool), `t` (tempo decorrido), `dur = 4` s, `ready` (xícaras na máquina), `max = 4` (capacidade da bandeja da máquina).

**Regras** (`interactables[0]`, `state()` e `action()`; `updateMachine`):
- `canPick = ready > 0 && carry < maxCarry(4)`
- `canBrew = !brewing && beans > 0 && (ready − pegas) ≤ max − 2`, onde `pegas = min(ready, 4 − carry)` se `canPick`, senão 0. Na prática: só prepara se, depois de pegar, sobrarem no máximo 2 xícaras na máquina, para caber +2.
- `action()` executa **as duas coisas no mesmo toque**, nesta ordem: primeiro pega (`n = min(ready, 4 − carry)`, `ready −= n`, `carry += n`, texto flutuante "+n café"), depois inicia o preparo (`beans −= 1`, `brewing = true`, `t = 0`).
- No `update`, durante o preparo: `t += dt`. Quando `t ≥ 4`: `brewing = false`, `ready = min(4, ready + 2)`, som `ready` e texto flutuante "Café pronto!".
- **1 grão = 2 xícaras.** O grão é consumido no início do preparo.

**Textos do balão (por prioridade):**
1. pegar e preparar → "Pegar café + preparar mais"
2. só pegar → "Pegar café (N)"
3. só preparar → "Fazer café (1 grão = 2)"
4. preparando → "Preparando... X%" (off)
5. tem xícara, mas as mãos estão cheias → "Mãos cheias!" (off)
6. resto → "Sem grãos — colha na horta" (off)

**Estados:** `ocioso` → (E com grão) → `preparando` (4 s) → `ocioso com ready > 0` → (E) → as xícaras vão para as mãos.

**Feedback visual:**
- Luz da máquina: vermelha (`0xe8424f`) quando ociosa e vazia; piscando a 4 Hz entre laranja (`0xffb84e`) e marrom (`0x7a4a1a`) durante o preparo; verde (`0x5bff7b`) com `ready > 0`.
- Xícaras na bandeja da máquina: as primeiras `ready` ficam visíveis, de 4 posições.
- Barra acima da máquina: laranja, mostra `t/dur` durante o preparo; verde e cheia com `ready > 0`; escondida no resto do tempo.
- Vapor: uma partícula branca a cada 0,08 s durante o preparo.

**Depende de:** interação, inventário (grãos e xícaras), HUD.

---

### 2.5 Inventário e economia

**Dados** (`src/main.js`, objeto `game`):

| Campo | Inicial | Regra |
|---|---|---|
| `money` | 0 | +5 + gorjeta por cliente servido. **Não há onde gastar.** |
| `beans` (grãos) | 2 | +2 por colheita, −1 por preparo. Sem limite. |
| `carry` (xícaras nas mãos) | 0 | Máximo `maxCarry = 4`. −1 por cliente servido. |
| `rep` (reputação ≈ XP) | 10 | Limitada a [0, 100]. |
| `served` | 0 | +1 por cliente servido (mostrado no HUD). |
| `lost` | 0 | +1 por cliente que desistiu (**não aparece em lugar nenhum**). |

Quando `carry > 0`, o jogador mostra uma bandeja com `min(4, carry)` xícaras.

---

### 2.6 Clientes (NPCs) e fila

O sistema mais complexo. Tudo está em `src/npc.js`, na classe `NPCManager`. Os NPCs não usam física nem navmesh: andam em linha reta por listas de pontos fixos (waypoints) e ignoram os colisores.

#### 2.6.1 Surgimento (spawn)
- No início: **6 NPCs** já espalhados (`spawn(true)`), com `x` aleatório em [−38, 38].
- Timer de spawn: começa em **1,5 s**. Ao zerar, cria um NPC se `list.length < maxNPCs()` e sorteia o próximo intervalo:
  `intervalo = rand(2,5, 5,5) / (0,8 + 0,15 · estrelas)`
- `maxNPCs = 7 + 2 · estrelas` (de 9 a 17).
- Cada NPC sorteia:
  - sentido: 50% para a esquerda ou para a direita (`dir = ±1`);
  - calçada: 55% norte (a da cafeteria) e 45% sul;
  - **faixa** (z), por sentido, para evitar trombadas de frente: norte `2,0` (dir +1) ou `2,6` (dir −1); sul `10,0` (dir +1) ou `10,6` (dir −1); mais um ruído de ±0,15;
  - nascimento em `x = −dir · 46` (fora da tela) e destino `endX = dir · 46`;
  - velocidade: `rand(1,5, 2,1)`;
  - visual: um dos 8 sprites `npc_0`…`npc_7`, aleatório;
  - **desejo inicial** `wants`: `true` com probabilidade `wantChance = 0,22 + 0,05 · estrelas` (de 0,27 a 0,47), mas só se ainda não tiver passado da faixa de pedestres;
  - ícone de "desejo de passeio" para quem não quer café: nota musical, casa, sacola ou nenhum (25% cada).
- `decided` começa `true` para quem nasceu já depois da faixa (só no spawn inicial). Esses nunca entram na fila.

#### 2.6.2 Estados do NPC

```
walk (andando na calçada)
  │ cruza x = −2 (faixa de pedestres) e ainda não decidiu → decide()
  │   ├─ não quer e não teve impulso → continua em walk
  │   ├─ quer, mas a fila está cheia → ícone triste 3 s, wants = false, continua em walk
  │   └─ quer e há vaga → queue (waiting = false), recebe uma vaga e uma rota
  ▼
queue, a caminho (path não vazio, waiting = false)
  │ chega ao fim da rota
  ▼
queue, esperando (waiting = true; a paciência começa)
  │ a fila anda → ganha nova vaga → anda até ela (continua waiting = true, a paciência NÃO reinicia)
  ├─ é o primeiro, já chegou e o jogador serve → leave (coração 4 s)
  └─ paciência ≤ 0 → leave (raiva 3,5 s) + penalidade
  ▼
leave (segue a rota de saída)
  │ fim da rota
  ▼
walk (calçada norte, sentido aleatório, decided continua true)
  │ |x| ≥ 46 no sentido do destino
  ▼
removido (dead)
```

#### 2.6.3 Decisão na faixa (`decide`)
- Dispara quando o NPC em `walk` cruza `x = −2` (`(prevX + 2) · (x + 2) ≤ 0`) e `decided == false`. Vale para as duas calçadas.
- Impulso: se `wants == false`, há uma chance `impulseChance = 0,06 + 0,05 · estrelas` (de 0,11 a 0,31) de passar a querer café. Nesse caso aparece o ícone "!" por 1,0 s.
- Fila cheia (`queue.length ≥ queueCap`): ícone triste por 3 s, `wants = false`, sem penalidade de reputação. Aparece o aviso "Fila cheia! Um cliente foi embora", **no máximo um a cada 6 s**.
- Entrou: vai para o fim da lista `queue`, `slot = índice`, rota calculada por `route()` e som `join`.

#### 2.6.4 Tamanho da fila e vagas
- `queueCap = 5 · estrelas` (5, 10, 15, 20, 25).
- 25 vagas fixas (`SLOTS`):
  - 0: (−4,5, −5,7), em frente ao balcão (é onde a pessoa é servida)
  - 1: (−4,5, −4,5)
  - 2: (−4,5, −3,3)
  - 3: (−3,8, −2,2)
  - 4: (−2,6, −1,2), logo dentro da porta
  - 5: (−2,6, 1,15), na calçada, em frente à porta
  - 6 a 24: `x = −2,6 − 1,2·(i − 5)`, `z = 1,15`, seguindo a calçada para oeste até x ≈ −25,4
- As vagas 0 a 4 ficam dentro da cafeteria (`INSIDE = 5`).

#### 2.6.5 Rotas (`route`)
- Se o NPC já está esperando (`waiting`) ou já está dentro (`z < 0,3`): vai direto para a vaga.
- Senão, ele está fora:
  - se estiver na calçada sul ou no meio da rua (`z > 2,9`), primeiro vai a (−2, 2,3), ou seja, atravessa pela faixa;
  - para uma vaga interna (< 5): passa por `DOOR_OUT = (−2,6, 1,9)` (pulado se já estiver a menos de 0,5 dela em x e com z < 2,0) e depois por **todas as vagas internas da 4 até a sua**, em ordem decrescente, como numa fila indiana;
  - para uma vaga externa (≥ 5): vai a `(x_da_vaga, 1,9)` e depois à vaga.
- **Andar da fila** (`reroute`): sempre que alguém sai da fila, cada NPC cujo índice mudou recebe a nova vaga e uma nova rota a partir da posição atual.
- Saída depois de **servido**: (−3,2, −4,2) → (−1,4, −1,8) → (−1,4, 1,9) → (−1,4, 2,3).
- Saída depois de **desistir**: se estiver dentro, (−1,4, z_atual) → (−1,4, 1,9) → (−1,4, 2,3); se estiver fora, só (x_atual, 2,3).
- Ao fim da saída, volta para `walk` na **calçada norte**, sentido aleatório e faixa conforme o sentido.

#### 2.6.6 Paciência
- Só começa a contar quando o NPC **chega pela primeira vez** à vaga (`path` vazio e `waiting` ainda falso). O tempo andando até a fila não conta.
- `patienceMax = 75 − 5 · estrelas` segundos (70, 65, 60, 55, 50).
- Diminui `dt` por frame enquanto `waiting`, inclusive enquanto ele anda para a vaga seguinte.
- Chegou a 0 → `angry()`: sai, ícone de raiva por 3,5 s, **reputação −7**, `lost += 1`, aviso "Cliente desistiu de esperar!", texto flutuante "-rep" e som `angry`.

#### 2.6.7 Atendimento (balcão)
- `front()` devolve o NPC da vaga 0 **somente se** ele está esperando e já chegou (`path` vazio).
- Balão do balcão:
  - sem cliente pronto: nenhum balão;
  - cliente pronto e `carry == 0`: "Cliente esperando — pegue café" (off);
  - cliente pronto e `carry > 0`: "Servir café".
- Servir:
  - `frac = paciência / paciênciaMax`, calculado no momento do serviço (0 a 1);
  - `carry −= 1`;
  - gorjeta = `round(4 · frac)`, de 0 a 4;
  - `money += 5 + gorjeta`;
  - reputação `+ (4 + round(3 · frac))`, de +4 a +7;
  - `served += 1`;
  - texto flutuante "+$N (gorjeta!)" se a gorjeta for > 0, senão "+$5";
  - som `serve`; o NPC sai com coração por 4 s.

#### 2.6.8 Movimento e desvio
- Em `walk`: `x += dir · velocidade · dt`. O `z` interpola até a faixa com fator `min(1, dt·2)`.
- Em `queue` e `leave`: `follow()` anda em linha reta até cada ponto. Se sobrar distância naquele frame, já começa o próximo ponto.
- **Separação** (só para quem **não** está em `queue`):
  - contra cada outro NPC: raio mínimo 0,65, força 0,5;
  - contra o jogador: raio 0,75, força 1;
  - o empurrão tem um componente lateral de 40%, cujo lado depende de o `id` ser par ou ímpar, para que um contorne o outro.
- Altura do chão: interpola até `groundY` com `min(1, dt·12)`.
- Direção: se a velocidade medida for > 0,25, olha para onde anda. Parado na fila, olha para a vaga da frente (ou para o balcão, se estiver na vaga 0). Interpolação de ângulo com `min(1, dt·10)`.

**Depende de:** estrelas e reputação (todas as chances, o tamanho e a paciência), jogador (desvio), interação e inventário (atendimento), HUD (balões e avisos).

---

### 2.7 Reputação (≈ XP) e estrelas

**Regras** (`src/main.js`, objeto `game` e `addRep`):
- `rep` vai de 0 a 100, começa em **10**.
- `estrelas = clamp(1 + floor(rep / 20), 1, 5)`.

| rep | estrelas | fila máx. | chance de querer café | chance de impulso | paciência | NPCs máx. | divisor do spawn |
|---|---|---|---|---|---|---|---|
| 0–19 | 1 | 5 | 0,27 | 0,11 | 70 s | 9 | 0,95 |
| 20–39 | 2 | 10 | 0,32 | 0,16 | 65 s | 11 | 1,10 |
| 40–59 | 3 | 15 | 0,37 | 0,21 | 60 s | 13 | 1,25 |
| 60–79 | 4 | 20 | 0,42 | 0,26 | 55 s | 15 | 1,40 |
| 80–100 | 5 | 25 | 0,47 | 0,31 | 50 s | 17 | 1,55 |

- **Ganha:** de +4 a +7 por cliente servido (mais quanto mais rápido).
- **Perde:** −7 por cliente que desiste. A fila cheia não penaliza.
- Ao subir de estrela: aviso dourado "Nova estrela! N★ — fila máx M" e som `star`. Ao descer: aviso vermelho "Perdeu uma estrela... N★".
- A barra do HUD mostra o progresso dentro da estrela atual: `(rep mod 20) / 20`. Com 5 estrelas: `(rep − 80) / 20`.
- Se a reputação cair, a capacidade da fila diminui, mas **ninguém é expulso**: a fila pode ficar temporariamente maior que a capacidade.

**Depende de:** atendimento e desistências. Alimenta NPCs e HUD.

---

### 2.8 Horta

**Para o jogador:** cercado à direita da cafeteria, com 6 canteiros. Em um canteiro vazio você planta. Com a planta crescendo, pode regar uma vez (cresce 2× mais rápido). Quando fica pronta (com frutinhas vermelhas), você colhe +2 grãos e o canteiro volta a ficar vazio.

**Dados** (`src/garden.js`, classe `Garden`; cada canteiro tem `state`, `g` (progresso 0–1), `watered` e `wet`):
- Centros dos canteiros: (9,3, −8,6), (12, −8,6), (14,7, −8,6), (9,3, −4,5), (12, −4,5), (14,7, −4,5). Cada um mede 2,2 × 2,2 e é sólido, com colisor 2,4 × 2,4.
- `GROW_TIME = 28` s sem regar e **14 s regado**. Crescimento: `g += dt / (28 / (regado ? 2 : 1))`.
- Regar a qualquer momento do crescimento vale até a colheita. Só dá para regar uma vez. O solo fica mais escuro enquanto está regado.
- Colher: `beans += 2` e o canteiro volta para `empty` (`g = 0`, `watered = false`).
- **Estado inicial:** o canteiro de índice 3, (9,3, −4,5), começa **pronto**; o de índice 4, (12, −4,5), começa crescendo com **60%**; os demais começam vazios (`src/main.js`, logo após `new Garden`).

**Estados:** `empty` → (E: plantar) → `growing` → (g ≥ 1) → `ready` → (E: colher) → `empty`. Dentro de `growing`, `watered` pode passar de falso para verdadeiro uma única vez.

**Estágios visuais** (quadro do sprite `coffee_plant.png`, função `stageFrame`):

| Condição | Quadro | Desenho |
|---|---|---|
| `g < 0,04` | 5 | monte de terra (semente) |
| `g < 0,30` | 0 | broto |
| `g < 0,60` | 1 | arbusto pequeno |
| `g < 0,85` | 2 | arbusto médio |
| até ficar pronto | 3 | arbusto grande |
| `ready` | 4 | arbusto grande com frutos vermelhos |

Cada canteiro mostra 4 mudas, nas posições (±0,5, ±0,5) em relação ao centro, sempre no mesmo estágio.

**Balões:** vazio → "Plantar café"; pronto → "Colher (+2 grãos)"; crescendo e sem regar → "Regar (X%)"; crescendo e regado → "Crescendo... X%" (off).

**Feedback:** partículas marrons ao plantar (10), vermelhas ao colher (12) e azuis ao regar (14); sons `plant`, `harvest` e `water`; texto flutuante "+2 grãos".

**Depende de:** interação e inventário.

---

### 2.9 Esmaecimento do que tapa a visão (paredes, telhado, árvores)

**Para o jogador:** ao entrar na cafeteria, a fachada, a parede leste e o telhado somem. Se você estiver atrás da cafeteria, ela toda fica "pontilhada" (semitransparente). Árvores na frente do jogador também ficam pontilhadas.

**Regras** (`src/main.js`, `updateFade`):
- "Dentro": `x ∈ (−9,2, 5,2)` e `z ∈ (−12,2, 0,25)`.
- Um raio sai de `(jogador.x, jogador.y + 0,7, jogador.z)` na direção da câmera (`toCam`).
- "Atrás": não está dentro e o raio atravessa a caixa da cafeteria `[(−9,3, 0, −12,3), (5,3, 6, 0,6)]`.
- Alvo do `fade`: 0 dentro, 0,4 atrás, 1 fora. O valor anda até o alvo a no máximo 4 por segundo e é arredondado em degraus de 1/16.
- `fadeMats` (fachada, parede leste, telhado, chaminé, toldos, letreiro) recebem esse valor. O grupo inteiro fica invisível quando o valor é ≤ 0,01.
- `shellMats` (paredes norte e oeste) ficam em 0,4 quando o jogador está atrás e em 1 no resto do tempo.
- Árvores: se o raio atravessa a caixa da árvore (1,8 × 2,6 × 1,8), o material troca na hora para a versão pontilhada (0,35).

**Depende de:** jogador, câmera e o shader de pontilhado (6.6).

---

### 2.10 Mundo e cenário (layout)

Montado em `src/world.js` (`buildWorld`, `buildStreet`, `buildCafe`, `table`, `buildGarden`, `lamp`, `bench`, `bin`).

| Elemento | Posição e tamanho | Colisor |
|---|---|---|
| Grama | plano 260 × 260 | — |
| Rua | z 3 a 9, x de −80 a 80; faixa amarela tracejada em z = 6 a cada 3 unidades (sem tracejado perto de x = −2) | — |
| Faixa de pedestres | x = −2; 6 listras em z = 3,5 a 8,5 | — |
| Calçada norte | z 0 a 3, altura 0,12; meio-fio em z ≈ 2,95 | — |
| Calçada sul | z 9 a 11,6; meio-fio em z ≈ 9,05 | — |
| Postes | norte (z = 2,72): x = −30, −18, −9, 6, 19, 32; sul (z = 9,35): x = −24, −12, 3, 16, 28 | 0,3 × 0,3 |
| Bancos | z = 11,2; x = −15, 9, 23 | 1,7 × 0,55 |
| Lixeiras | (0,7, 0,45) e (−9,5, 11,3) | 0,45 × 0,45 |
| Ponto de ônibus | (13, 9,6) | 0,2 × 0,2 |
| Cafeteria | x −9 a 5, z −12 a 0; paredes de altura 3,2 e espessura 0,3 | paredes |
| Porta | vão na fachada em x −3,2 a −0,8 | — |
| Floreiras da fachada | centros x = −7,4, −4,7, 0,6, 3,4 | x ± 1, z 0 a 0,5 |
| Balcão | x −8,7 a −1,5, z −7,55 a −6,45, altura ~1,1 | sim |
| Bancada de trás (com a máquina) | x −8,7 a −2, z −11,7 a −10,75 | sim |
| Máquina | grupo em (−5, 1,22, −11,3) | — |
| Mesas | x = 2,6; z = −3,2, −6,4, −9,6; cada uma com 2 cadeiras | 2,3 × 1,1 |
| Vasos | (4,2, −11,2), (−8,2, −0,8), (4,2, −0,8) | 0,55 |
| Sacos de grãos | — | x −8,7 a −7,7, z −9,7 a −8,2 |
| Lixeiras atrás da cafeteria | — | x −7,4 a −5,7, z −12,85 a −12 |
| Horta (cerca) | x 7 a 17, z −11 a −1; portão em x 11 a 13 no lado sul | cada lado da cerca, espessura 0,2 |
| Placa "HORTA" | (10,4, −0,6) | — |
| Regador | (15,8, −1,8) | sim |
| Saco de sementes | (8,2, −1,8) | sim |
| Árvores e arbustos | sorteados com semente fixa (`rng(1337)`): uma fileira ao sul (z 15,5 a 19), uma ao norte (z −15,5 a −20), um parque a oeste (x −46 a −12) e um a leste (x 21 a 46). Nunca em áreas reservadas (cafeteria, horta, rua) | árvore 0,5 × 0,5; arbusto 0,7 × 0,5 |

O layout é decorativo, com uma exceção: **as vagas da fila, as rotas dos NPCs e os pontos de interação usam coordenadas fixas** que dependem dele. Se você mudar o layout no Godot, ajuste essas coordenadas também.

---

### 2.11 Tela inicial e início do jogo

- Ao abrir, aparece um cartão "PIXEL CAFÉ" com as instruções. O mundo e os NPCs já se movem por trás.
- Qualquer tecla ou clique no cartão inicia o jogo (`start()`): libera o áudio, esconde o cartão e mostra o aviso "Bem-vindo! Colha café na horta →". **A tecla usada para começar não é processada** (não move nem interage).
- Antes de começar: o jogador não anda, não há balão de interação e as teclas O e P não fazem nada.

### 2.12 Sons

Os sons são sintetizados na hora com WebAudio, por osciladores (`src/audio.js`); não há arquivos de áudio. São eles: `plant`, `water`, `harvest`, `brew`, `ready`, `pick`, `serve`, `angry`, `star`, `deny` e `join`. Cada um é uma sequência curta de 1 a 4 tons (onda quadrada, triangular, dente de serra ou senoidal), com frequência, duração e volume definidos no arquivo. Para o Godot, o mais simples é gerar WAVs curtos com o mesmo timbre.

### 2.13 Partículas

`src/particles.js`: pequenos cubos coloridos sem iluminação, com velocidade, gravidade e tempo de vida, que encolhem com `sqrt(vida/vidaMax)`. O jogo usa:
- `burst` na horta: 8 a 14 cubos de 0,12, com vida de 0,5 a 0,9 s e gravidade 7 a 9;
- vapor da máquina: um cubo a cada 0,08 s durante o preparo, subindo a 1,2, com vida de 0,9 s;
- fumaça da chaminé: um cubo a cada 0,6 s (0,15 s durante o preparo), tamanho 0,28, vida de 2,2 s, só enquanto o telhado está visível.

---

## 3. Dados e configuração

### 3.1 `src/config.js` (visual; nada aqui muda as regras do jogo)

| Chave | Valor | O que faz |
|---|---|---|
| `targetHeight` | 270 | Altura alvo do render target, em pixels. A escala de tela é `round(alturaDaTela / 270)` (inteira), mais o zoom. |
| `texel` | 1/18 | Unidades de mundo por pixel do render target. Define o "tamanho do pixel" no mundo. |
| `camYaw` | 45 | Rotação da câmera em torno de Y, em graus. |
| `camPitch` | 30 | Inclinação da câmera, em graus. 30° gera as linhas 2:1 típicas de pixel art. |
| `posterizeLevels` | 5 | Níveis de posterização da luminância. 0 desliga. A tecla P alterna entre 0, 4, 5 e 6. |
| `outline` | true | Liga o contorno de 1px. A tecla O alterna. |
| `outlineDepth` | 0,35 | Diferença de profundidade (em unidades de mundo) com o vizinho que gera contorno. |
| `outlineDarkness` | 0,45 | Multiplicador da cor no pixel de contorno (0 = preto). |
| `subpixelSmooth` | true | Desloca a imagem ampliada pela fração de texel que sobra da câmera, para a rolagem ficar suave. |
| `shadowColor` | 0x8a84a6 | Cor que multiplica o chão nas sombras em elipse. |
| `plantWind` | false | Vento nas plantas: desloca 1 pixel inteiro quando `sin(t·1,5 + k + i) > 0,7`. |

Ao trocar `texel`, `camYaw` ou `camPitch` em tempo de execução, nada muda: esses valores são lidos uma única vez, quando os módulos carregam. Só `posterizeLevels`, `outline`, `outlineDepth` e `outlineDarkness` são lidos a cada frame.

### 3.2 Constantes de jogo (espalhadas pelo código)

**`src/main.js`, objeto `game`:**
- Valores iniciais: `money` 0, `beans` 2, `carry` 0, `rep` 10, `maxCarry` 4.
- Fórmulas: `stars`, `queueCap`, `wantChance`, `impulseChance`, `maxNPCs` e `patience` (tabela em 2.7).

**`src/main.js`, recompensas e penalidades (literais no código):**
- `addRep(−7)` ao desistir.
- Pagamento `5 + round(4·frac)` e reputação `4 + round(3·frac)` ao servir.

**`src/main.js`, cafeteira (`machine`):** `dur` 4, `max` 4, +2 xícaras por preparo, posição (−5, 0,12, −10,4).

**`src/main.js`, movimento do jogador:** velocidades 4,0 e 6,2; suavização 12; raio 0,35; empurrão de NPC 0,6; limites x ±44, z −15 a 12,3; giro 14; altura 15; início (6, 0,12, 1,8).

**`src/main.js`, câmera:** suavização 5; alvo inicial (6, 0, 1,8).

**`src/main.js`, pontos e raios dos interativos:** tabela em 2.3.

**`src/main.js`, esmaecimento:** retângulo "dentro", deslocamento do raio 0,7, alvos 0 / 0,4 / 1, velocidade 4/s, degraus de 1/16.

**`src/main.js`, interface e efeitos:**
- Aviso de fila cheia: no máximo 1 a cada 6 s.
- Avisos: no máximo 4 na tela; somem aos 2,4 s e saem da tela aos 2,9 s.
- Textos flutuantes: 1,4 s, subindo 1,2 unidades/s a partir da altura 2,4.
- Barra da máquina na altura 2,4.
- Vapor a cada 0,08 s; chaminé a cada 0,6 s (0,15 s durante o preparo).

**`src/npc.js`:**
- `SLOTS` (25 vagas), `INSIDE = 5`, `CROSS_X = −2`, `END_X = 46`, `DOOR_OUT = (−2,6, 1,9)`, `COUNTER = (−4,5, −7)`.
- Faixas: 2,0 / 2,6 / 10,0 / 10,6 (±0,15).
- Probabilidades: 55% calçada norte; desejo de passeio 25% para cada opção.
- Velocidade `rand(1,5, 2,1)`; spawn inicial de 6 com x em [−38, 38]; primeiro timer 1,5 s; intervalo `rand(2,5, 5,5) / (0,8 + 0,15·estrelas)`.
- Separação: 0,65 / 0,5 entre NPCs, 0,75 / 1 contra o jogador, componente lateral 0,4.
- Durações dos ícones temporários: "!" 1,0 s, triste 3 s, coração 4 s, raiva 3,5 s.
- Ícone de passeio visível quando `(tempo + semente) mod 9 < 3,5`.
- Altura do balão 1,75; barra de paciência verde > 50%, amarela > 25%, vermelha abaixo disso, tremendo abaixo de 25%.

**`src/garden.js`:** `GROW_TIME` 28; regar = ×2; centros dos canteiros; limites dos estágios (0,04 / 0,3 / 0,6 / 0,85); cor de solo molhado `0x8c7a78`.

**`src/util.js`:** `groundY` (alturas 0,12 / 0,03 / 0), retângulo `CAFE` (x −9 a 5, z −12 a 0), rampa toon de 5 tons `[70, 125, 170, 215, 255]`, tamanhos das texturas (`TEX_SIZES`: 16 px para `table`, `chair`, `pot`, `plant`, `soil`, `bark`, `fence`, `brick` e `awning`; 32 px para as demais).

**`src/pixelRenderer.js`:** distância da câmera 60; near 1 e far 140; render target com margem de +2 px e lados pares; zoom de −1 a +2.

**`src/main.js`, luz:** hemisférica (céu `0xfff6e8`, chão `0x8a9a7a`, intensidade 1,0); direcional (`0xfff0d0`, intensidade 2,2, direção (0,05, 1, 0,6)); fundo `0x78bb52`.

---

## 4. Controles

### Controles de jogo

| Entrada | Ação |
|---|---|
| W / ↑ | Andar para cima na tela |
| S / ↓ | Andar para baixo na tela |
| A / ← | Andar para a esquerda na tela |
| D / → | Andar para a direita na tela |
| Shift (esquerdo ou direito) | Correr (6,2 em vez de 4,0) |
| E ou Espaço | Interagir com o objeto mais próximo (sem repetição de tecla) |
| Roda do mouse | Zoom em degraus inteiros (−1 a +2 na escala de pixels) |
| Qualquer tecla ou clique no cartão | Começar (só na tela inicial) |

Perder o foco da janela solta todas as teclas.

### Teclas de ajuste visual e debug

| Tecla | Ação |
|---|---|
| O | Liga e desliga o contorno de 1px (aviso "Contorno: ligado/desligado") |
| P | Alterna o posterize entre desligado, 4, 5 e 6 níveis (aviso "Posterize: …") |

Não há outras teclas de debug. O modo de teste por URL que usei durante o desenvolvimento (`?x=&z=&q=&t=…`) foi removido do código.

---

## 5. Interface

Toda a interface é HTML e CSS sobre o canvas (`index.html`, `style.css`), com a fonte "Press Start 2P". Os ícones são pixel art gerada em canvas a partir de mapas de caracteres (`src/icons.js`).

### 5.1 HUD fixo
- **Canto superior esquerdo:**
  - 5 estrelas (cheias até o número atual);
  - barra dourada de progresso para a próxima estrela;
  - "Fila N/M" (pessoas na fila, contando as que estão a caminho, sobre a capacidade);
  - "Atendidos N".
- **Canto superior direito:** moeda e "$N"; grão e quantidade de grãos; xícara e "N/4" (nas mãos).
- **Centro do topo:** objetivo atual, a primeira regra verdadeira desta lista:
  1. tem xícara e há cliente pronto → "Sirva o cliente no BALCÃO"
  2. tem xícara → "Aguarde um cliente no balcão"
  3. há café pronto na máquina → "Pegue o café na CAFETEIRA"
  4. está preparando → "Preparando café..."
  5. tem grãos → "Use a CAFETEIRA atrás do balcão"
  6. há canteiro pronto → "Colha os grãos na HORTA"
  7. resto → "Plante e regue café na HORTA"
- **Rodapé:** linha de ajuda com os controles.

### 5.2 Elementos presos ao mundo (posicionados a cada frame projetando um ponto 3D na tela)
- **Balão de interação:** "[E] texto", ou cinza e sem o "E" quando indisponível. Fica sobre o interativo atual, na altura `py`.
- **Balão do NPC** (branco, com borda pixelada e uma "ponta"), na altura 1,75 sobre o pé. Ordem de prioridade:
  1. ícone temporário, enquanto `tempT > 0`: "!" (impulso, 1 s), triste (fila cheia, 3 s), coração (servido, 4 s), raiva (desistiu, 3,5 s);
  2. em `queue`: xícara de café; depois que ele chega à vaga, aparece também a barra de paciência (verde, amarela ou vermelha, tremendo abaixo de 25%);
  3. andando, querendo café e ainda sem decidir: xícara de café;
  4. andando com ícone de passeio (nota, casa ou sacola): visível 3,5 s a cada 9 s;
  5. nenhum dos anteriores: sem balão.
  O balão fica escondido se o NPC estiver fora da tela.
- **Barra da máquina:** veja 2.4.
- **Textos flutuantes:** sobem e somem em 1,4 s. Aparecem em "+N café", "Café pronto!", "+2 grãos", "+$N (gorjeta!)"/"+$5" e "-rep".

### 5.3 Avisos ("toasts") no centro superior
Até 4 ao mesmo tempo; somem aos 2,4 s. Cores: dourado, vermelho, laranja ou branco.
- "Bem-vindo! Colha café na horta →" (dourado), ao começar.
- "Nova estrela! N★ — fila máx M" (dourado).
- "Perdeu uma estrela... N★" (vermelho).
- "Cliente desistiu de esperar!" (vermelho).
- "Fila cheia! Um cliente foi embora" (laranja, no máximo 1 a cada 6 s).
- "Contorno: …" e "Posterize: …" (teclas de debug).

### 5.4 Tela inicial
Um cartão com título, as 3 etapas (Horta, Cafeteira, Balcão), a regra "cada estrela libera +5 lugares na fila" e o texto piscando "Clique ou aperte uma tecla".

### 5.5 Escala da interface
A variável CSS `--px` vale o tamanho de 1 pixel do jogo na tela (`escala / devicePixelRatio`). Bordas, balões e ícones usam múltiplos dela, para que tudo tenha o mesmo tamanho de pixel do jogo. A largura de um ícone é `larguraEmPixels · --px`.

---

## 6. Visual e assets (deixe para o fim)

### 6.1 Resumo do pipeline (`src/pixelRenderer.js`)
1. A cena 3D é renderizada num render target pequeno (`rtW × rtH`, filtro nearest, HalfFloat, com textura de profundidade).
2. Um quad de tela cheia amplia esse render target com **escala inteira**, aplica o contorno e o posterize e converte para sRGB.
3. O HUD em HTML é desenhado por cima.

### 6.2 Resolução e escala
- `escala = max(1, round(alturaDaTelaEmPixelsReais / 270) + zoom)`; o zoom vai de −1 a +2 e muda com a roda do mouse.
- `rtW = par(ceil(larguraDaTela / escala) + 2)` e `rtH = par(ceil(alturaDaTela / escala) + 2)`. A margem de 2 px serve para o deslocamento sub-pixel.
- Câmera ortográfica com `left/right = ±rtW/2 · texel` e `top/bottom = ±rtH/2 · texel`. Assim, 1 pixel do render target sempre equivale a `1/18` de unidade no mundo, e o zoom não deforma a pixel art.
- Leva em conta o `devicePixelRatio`: o canvas usa pixels físicos.

### 6.3 Câmera presa à grade
- Eixos fixos da câmera (`src/sprites.js`, `CAM`):
  - `right = (cos y, 0, −sin y)`
  - `up = (−sin y·sin p, cos p, −cos y·sin p)`
  - `toCam = (sin y·cos p, sin p, cos y·cos p)`
  - com y = 45° e p = 30°.
- `follow()`: calcula a posição desejada, projeta em `right` e `up`, arredonda cada componente para um múltiplo de `texel` e posiciona a câmera ali. A diferença (sempre menor que meio texel) vira `shift`.
- No shader final, `shift` desloca a imagem ampliada. Resultado: o mundo nunca "nada" dentro do pixel, mas a rolagem continua suave (com `subpixelSmooth`).
- Sprites que se movem (jogador e NPCs) também são presos à grade com `pixelSnapOffset` (`character.snap()`), chamado **depois** de posicionar a câmera. Árvores, arbustos e plantas são presos uma única vez, ao serem criados.

### 6.4 Shader final (`FINAL_FRAG`)
- Lê o pixel do render target com `floor`, sem interpolação.
- **Contorno:** compara a profundidade do pixel com a dos 4 vizinhos. Se algum vizinho estiver mais longe que `outlineDepth` (0,35 unidade), multiplica a cor por `outlineDarkness` (0,45). Só usa profundidade, não normais. Como a câmera é ortográfica, a profundidade é linear: `valor · (far − near)`.
- **Posterize:** converte para sRGB, calcula a luminância `L`, quantiza `q = round(L · níveis) / níveis` e multiplica a cor por `clamp(q/L, 0,7, 1,35)`. Isso preserva o matiz e cria faixas de brilho. O limite de 0,7 a 1,35 evita que pixels escuros fiquem pretos.

### 6.5 Iluminação dos objetos 3D
- `MeshToonMaterial` com rampa de 5 tons (`gradientMap`) e as duas luzes da seção 3.2.
- A direção da luz foi escolhida para o topo ficar claro, a face sul média e a face leste escura.
- Não há mapa de sombras (`castShadow` ainda aparece no código, mas não tem efeito).

### 6.6 Materiais com UV de mundo e pontilhado (`src/util.js`, `decorate`)
- Os materiais recebem código extra por `onBeforeCompile`.
- **UV de mundo** (quando há `WORLD_UV`): escolhe o eixo pela normal dominante. Topo usa (x, −z); faces voltadas para X usam (−z, y); faces voltadas para Z usam (x, y). Divide por `uTile = tamanhoDoPNG · texel`, o que dá cerca de 1 texel por pixel. Por isso as caixas não têm UV próprio: a textura "corre" pelo mundo.
- **Pontilhado:** `uFade`. Se for menor que 1, descarta o pixel quando o valor da matriz de Bayer 4×4 em `gl_FragCoord` for ≥ `uFade`. Como roda no render target pequeno, o pontilhado já sai na resolução da pixel art.

### 6.7 Sprites (`src/sprites.js`, `src/character.js`)
- Cada sprite é um **plano vertical** virado para o ângulo da câmera (rotação Y = 45°), apoiado no chão.
- Largura `fw · texel`. Altura `fh · texel / cos(30°)`, para que, visto a 30°, cada texel dê exatamente 1 pixel.
- Material sem iluminação (`MeshBasicMaterial`), com `alphaTest` 0,5.
- O quadro da folha é escolhido por offset e repeat da textura (cada sprite usa um clone da textura). O espelhamento (`flip`) usa repeat negativo.
- **Personagem:** folha 4×3 de quadros 16×24.
  - Colunas: 0 parado, 1 passo A, 2 parado, 3 passo B.
  - Linhas: 0 frente, 1 costas, 2 lado (direita; a esquerda é espelhada).
  - Ciclo de quadros: `t += dt·(0,8 + 0,85·velocidade)` e `quadro = floor(2t) mod 4`. Parado: quadro 0 e `t` zerado.
  - Direção: converte o ângulo para a tela (`sx`, `sy`). Se `|sx| > 1,15·|sy|`, usa a linha de lado (esquerda se `sx < 0`). Senão usa costas se `sy > 0` (subindo na tela) ou frente.
  - **Bandeja do jogador:** sprite 16×8 de 5 quadros (0 a 4 xícaras), 5 px acima do pé. Fica um pouco à frente do corpo, na direção da câmera; de costas, fica atrás. De lado, desloca 4 px para o lado em que o personagem olha.
- **Sombra em elipse** (`blob`): plano horizontal com `shadow.png` (elipse branca), cor `shadowColor`, mistura **multiplicativa**, `alphaTest`, sem escrever profundidade e com polygon offset. Tamanhos usados:

  | Objeto | Tamanho |
  |---|---|
  | Personagem | 0,75 × 0,36 |
  | Árvore | 1,9 × 0,95 |
  | Arbusto | 0,95 × 0,45 |
  | Mesa | 1,5 × 0,9 |
  | Cadeira | 0,6 × 0,45 |
  | Poste | 0,6 × 0,3 |
  | Banco | 1,9 × 0,6 |
  | Vaso | 0,8 × 0,45 |
  | Lixeira | 0,7 × 0,35 |
  | Regador e saco de sementes | 0,6 × 0,35 e 0,7 × 0,4 |

### 6.8 Lista de PNGs

Todos são gerados por `node tools/gen-assets.mjs`, com cores e formas definidas no próprio script. No Godot, importe todos com **Filter: Nearest e Mipmaps: off**. Para as texturas de `assets/textures/`, ative **Repeat**.

**`assets/textures/`** (aplicadas com UV de mundo, exceto os letreiros):

| Arquivo | Tamanho | Onde é usado |
|---|---|---|
| `wood_floor.png` | 32×32 | Piso da cafeteria (tábuas de 8 px) |
| `wall.png` | 32×32 | Paredes (tábuas horizontais claras) |
| `counter.png` | 32×32 | Balcão e bancada de trás (painéis) |
| `table.png` | 16×16 | Tampo das mesas, bancos da rua, prateleira |
| `chair.png` | 16×16 | Cadeiras |
| `sidewalk.png` | 32×32 | Calçadas (lajotas de 16 px) |
| `grass.png` | 32×32 | Chão de grama |
| `roof.png` | 32×32 | Telhado |
| `pot.png` | 16×16 | Vasos e floreiras |
| `plant.png` | 16×16 | Folhagem dos vasos e floreiras |
| `asphalt.png` | 32×32 | Rua |
| `soil.png` | 16×16 | Terra dos canteiros (tingida ao regar) |
| `bark.png` | 16×16 | (gerado, mas não usado no momento) |
| `fence.png` | 16×16 | Ripas da cerca e bordas dos canteiros |
| `brick.png` | 16×16 | Chaminé |
| `awning.png` | 16×16 | Toldos listrados |
| `sign_cafe.png` | 48×11 | Letreiro "PIXEL CAFE" (UV normal, plano de 48×11 texels) |
| `sign_horta.png` | 25×9 | Placa "HORTA" |
| `menu.png` | 34×18 | Quadro de menu na parede |

**`assets/sprites/`:**

| Arquivo | Tamanho | Layout |
|---|---|---|
| `player.png` | 64×72 | 4 colunas × 3 linhas de 16×24 (barista: boné verde, avental) |
| `npc_0.png` … `npc_7.png` | 64×72 cada | Mesmo layout, 8 visuais de cliente |
| `tray.png` | 80×8 | 5 quadros de 16×8 (bandeja com 0 a 4 xícaras) |
| `coffee_plant.png` | 96×16 | 6 quadros de 16×16 (broto, pequeno, médio, grande, com frutos, semente) |
| `tree.png` | 64×40 | 2 variações de 32×40 |
| `bush.png` | 32×12 | 2 variações de 16×12 |
| `shadow.png` | 16×8 | Elipse branca (máscara da sombra) |

**Gerados em código, fora dos PNGs:** os ícones de interface (`src/icons.js`: café, xícara, coração, raiva, triste, "!", nota, casa, sacola, grão, moeda, estrela cheia e vazia). Para o Godot, vale exportá-los como PNG.

---

## 7. Ordem sugerida para portar

Cada passo traz o que testar para conferir que ficou igual ao original. Rode o original lado a lado com `npm run dev`.

**1. Mundo básico e colisão.** Chão, rua, calçadas, cafeteria (paredes, porta, balcão, bancada), horta (cerca e canteiros) e as caixas de colisão da seção 2.10, ainda sem texturas.
- Teste: a porta tem 2,4 de largura (x −3,2 a −0,8); o jogador não atravessa o balcão; só entra atrás do balcão pela ponta direita (x > −1,5); o portão da horta fica em x 11 a 13.

**2. Movimento do jogador.** Velocidades, suavização exponencial, raio 0,35, limites e altura do chão.
- Teste: de parado, chega a ~95% da velocidade em cerca de 0,25 s. Correndo de x = −44 a 44 leva cerca de 14 s. Subir na calçada eleva o personagem 0,12 de forma suave.

**3. Câmera isométrica.** Ortográfica, 45°/30°, com seguimento suave de fator 5. Faça também a conversão WASD → tela.
- Teste: W leva o personagem para cima na tela (no mundo, para −x −z). A rua aparece na diagonal. A câmera chega ao jogador com um atraso visível, de cerca de 0,5 s.

**4. Interação.** Lista de interativos, escolha do mais próximo dentro do raio e balão com o texto.
- Teste: entre o balcão e a máquina (por exemplo, em x = −5, z ≈ −8,8) vale o mais próximo; o balão cinza não executa nada e toca o som de "negado".

**5. Cafeteira e inventário.** Grãos, xícaras nas mãos (máximo 4), máquina com 4 s, 2 xícaras e no máximo 4 na bandeja, e a regra "pega + prepara no mesmo toque".
- Teste: começando com 2 grãos: E → prepara (1 grão); depois de 4 s, 2 xícaras; E → pega 2 e já prepara outro (0 grãos); 4 s depois, mais 2; E → pega 2 (mãos 4/4). Com as mãos cheias e café na máquina, aparece "Mãos cheias!".

**6. Clientes e fila.** Spawn, faixas, decisão na faixa x = −2, vagas, rotas, paciência que começa ao chegar, atendimento, saída e remoção em |x| ≥ 46. Faça primeiro sem a separação entre NPCs e acrescente depois.
- Teste: com 1 estrela, a fila nunca passa de 5; o 6º cliente faz cara triste e segue andando. O cliente da vaga 0 só pode ser servido depois de parar. Ao servir, os outros andam uma vaga. A paciência é de 70 s com 1 estrela e a barra muda de cor em 50% e 25%. Clientes da calçada sul atravessam pela faixa.

**7. Reputação (≈ XP) e estrelas.** Fórmulas da tabela 2.7, `addRep`, avisos.
- Teste: começando com rep 10, 2 atendimentos rápidos (+7 cada) levam a 24, ou seja, 2 estrelas, aviso "Nova estrela! 2★ — fila máx 10" e capacidade 10. Duas desistências seguidas (−14) voltam para 1 estrela. A barra de progresso mostra `rep mod 20`.

**8. Horta.** 6 canteiros, estados, crescimento de 28 s (14 s regado), colheita de +2, estágios visuais e o estado inicial (canteiro 3 pronto, canteiro 4 em 60%).
- Teste: plantar e esperar sem regar → pronto em 28 s; regar logo após plantar → pronto em 14 s; regar quando já estiver em 50% → faltam 7 s. Os quadros mudam em 4%, 30%, 60% e 85%.

**9. Fechar a loja.** **Não existe no original**, então não há o que copiar. Se quiser, desenhe do zero (horário de funcionamento, fim do dia, resumo, salvamento) e trate como funcionalidade nova.

**10. Interface.** HUD, objetivo, avisos, textos flutuantes, balões dos NPCs, barra da máquina, tela inicial e escala de pixel.
- Teste: o objetivo segue a ordem da seção 5.1; no máximo 4 avisos; o de fila cheia não se repete antes de 6 s.

**11. Esmaecimento** (paredes, telhado, árvores) com pontilhado.
- Teste: entrar na cafeteria esconde a fachada, a parede leste e o telhado em cerca de 0,25 s; atrás da cafeteria, tudo fica pontilhado a 40%; passar atrás de uma árvore a deixa pontilhada.

**12. Visual de pixel art.** Render target pequeno com escala inteira, câmera presa à grade, sprites, texturas com 1 texel por pixel, toon de 5 tons, posterize, contorno, sombras em elipse, sons e partículas.
- Teste: a 1080p, o render target tem cerca de 482×272 e escala 4. Andando devagar, nenhum pixel do cenário "treme". Comparando prints lado a lado, as cores e as faixas de luz batem. O contorno some com O; o posterize alterna com P.

---

## 8. Equivalências no Godot 4 (referência, sem código)

| Parte do jogo | O que costuma ser usado no Godot 4 |
|---|---|
| Estado global (`game`: dinheiro, grãos, reputação, estrelas) | Um **Autoload** (singleton) com **sinais** (`reputation_changed`, `star_changed`, `customer_served`…) |
| Configuração (`config.js`) e números de balanceamento | **Resource** personalizado (`.tres`) com `@export`, ou constantes no Autoload |
| Jogador | **CharacterBody3D** com `move_and_slide` e **CollisionShape3D** (CapsuleShape3D ou CylinderShape3D, raio 0,35). A suavização da velocidade continua manual. |
| Colisores do cenário (AABBs) | **StaticBody3D** com **BoxShape3D** |
| Altura do chão (`groundY`) | Colisão real com o chão (o CharacterBody3D sobe degraus baixos) ou um cálculo manual de Y |
| Câmera | **Camera3D** com `projection = Orthogonal`, `size` = altura visível em metros (`rtH · texel`), rotação fixa de 45°/−30° |
| Interativos | **Area3D** com uma forma de raio (ou uma busca manual pelo mais próximo, como no original), num grupo "interactable" |
| Cafeteira, preparo de 4 s | Um nó próprio com **Timer** (`one_shot`), ou um contador no `_process` |
| NPCs | **CharacterBody3D** ou **Node3D** simples (o original não tem física para NPCs) |
| Rotas e vagas da fila | **Marker3D** para cada vaga e ponto de rota, ou **Path3D/Curve3D**. **NavigationAgent3D** só se quiser trocar as rotas fixas por navegação (o original não usa) |
| Separação entre NPCs | Manual, como no original, ou o "avoidance" do NavigationAgent3D |
| Spawn de clientes | **Timer** com `wait_time` sorteado a cada disparo, mais **PackedScene** para o NPC |
| Horta (canteiros) | Uma cena por canteiro (**Node3D** com **Sprite3D** e Area3D), estado num enum |
| Sprites de personagem | **AnimatedSprite3D** com **SpriteFrames** (animações "frente", "costas", "lado") ou **Sprite3D** com `hframes`, `vframes` e `frame`; `flip_h` para a esquerda; `texture_filter = Nearest`; `billboard` desligado (o plano fica girado 45° em Y), `alpha_cut = Discard` |
| Árvores, arbustos, plantas | **Sprite3D** (mesmas regras), ou **MultiMeshInstance3D** se houver muitas |
| Sombras em elipse | **MeshInstance3D** (QuadMesh deitado) com ShaderMaterial `render_mode blend_mul, unshaded`, ou o nó **Decal** |
| Resolução baixa + escala inteira | **SubViewport** (tamanho do render target) dentro de um **SubViewportContainer** com `stretch` e `stretch_shrink` = escala. Outra opção: nas configurações do projeto, `display/window/stretch/mode = viewport` e `scale_mode = integer` |
| Câmera presa à grade + deslocamento sub-pixel | Manual (arredondar a posição da câmera nos eixos dela) e deslocar a posição do SubViewportContainer/TextureRect pela fração |
| Posterize e contorno | Shader de pós-processamento: um **ColorRect** de tela cheia com `canvas_item` shader sobre a textura do SubViewport; ou um **MeshInstance3D** quad de tela cheia com `spatial` shader lendo `hint_screen_texture` e `hint_depth_texture`; ou um **CompositorEffect** (Godot 4.3+) |
| Toon de 5 tons | `spatial` shader com função `light()` quantizando `dot(N, L)`, ou StandardMaterial3D com `diffuse_mode = Toon` (menos controle) |
| UV de mundo + pontilhado | `spatial` shader: UV calculado a partir de `MODEL_MATRIX * VERTEX` e da normal; `discard` com a matriz de Bayer em `FRAGCOORD` |
| Texturas pixel art | Importação com Filter Nearest, sem mipmaps, Repeat ligado; no material, `texture_filter = filter_nearest` |
| Esmaecimento por oclusão | `AABB.intersects_ray` (manual, como no original) ou **RayCast3D** / `PhysicsDirectSpaceState3D.intersect_ray` com camadas de colisão "oclusor" |
| HUD | **CanvasLayer** com **Control** (MarginContainer, HBoxContainer, **Label**, **TextureRect**, **TextureProgressBar**), fonte pixel via **FontFile** e um **Theme** com StyleBox para as bordas |
| Balões sobre NPCs e objetos | **Control** no CanvasLayer posicionado com `Camera3D.unproject_position()` (equivale ao `project()`), ou **Sprite3D** com billboard dentro do SubViewport (aí já sai pixelado) |
| Avisos e textos flutuantes | Label + **Tween** (fade e subida), num VBoxContainer para a pilha de avisos |
| Tela inicial | Control em tela cheia que pausa o input até o primeiro evento |
| Sons | **AudioStreamPlayer** com WAVs curtos (recrie os timbres de `audio.js`) ou **AudioStreamGenerator** para sintetizar |
| Partículas | **CPUParticles3D** ou **GPUParticles3D** com malha de cubo pequena e material unshaded; ou o pool manual, como no original |
| Teclas | **Input Map** com ações (`move_up`, `move_down`, `move_left`, `move_right`, `run`, `interact`, `zoom_in`, `zoom_out`, `debug_outline`, `debug_posterize`) |
| Números aleatórios com semente (árvores) | **RandomNumberGenerator** com `seed` fixo (a sequência não vai bater com o `rng(1337)` do JS; se precisar das mesmas posições, exporte as posições) |

---

## 9. Bugs, gambiarras e coisas incompletas (não porte isto)

**Funcionalidades que não existem:**
1. **Não há XP.** Só existe a reputação de 0 a 100. A partir de 80 ela vira 5 estrelas, e os pontos acima de 80 só enchem a barra, sem nenhum efeito.
2. **Não há "fechar a loja"**: nenhum ciclo de dia, horário, fim de expediente, resumo, salvamento ou fim de jogo.
3. **O dinheiro não serve para nada.** Não há loja, upgrades nem compra de sementes.
4. **`game.lost`** (clientes perdidos) é contado, mas nunca aparece.
5. **O ícone de "desejo de passeio"** (nota, casa, sacola) é só decorativo: não muda nenhum comportamento.

**Comportamentos estranhos que valem uma decisão consciente:**

6. **Dá para servir pelo lado do cliente.** O ponto do balcão (−4,5, −7) tem raio 2, então o jogador consegue servir pela frente do balcão sem ir para trás dele.
7. **A paciência não conta durante a caminhada até a fila** e não reinicia quando a fila anda. Um cliente que entrou e ficou preso atrás dos outros chega à vaga 0 com pouca paciência. É consistente, mas talvez não seja o desejado.
8. **Quando as estrelas diminuem, a fila pode passar da capacidade**: ninguém é removido.
9. **Fila cheia não tem penalidade** e o aviso aparece no máximo a cada 6 s, então várias rejeições seguidas passam despercebidas.
10. **NPCs ignoram todos os colisores.** A separação pode empurrá-los para dentro de paredes ou móveis, principalmente perto da porta. Quem está na fila não é empurrado, mas empurra os outros.
11. **A separação contra o jogador é assimétrica.** O NPC andando desvia do jogador com força 1; o jogador também é empurrado para fora do NPC (raio 0,6). Os dois códigos não combinam (0,6 de um lado, 0,75 do outro).
12. **NPCs que nasceram depois da faixa** (só no spawn inicial) nunca podem querer café. Quem sai da cafeteria volta sempre pela calçada norte.
13. **A decisão só acontece ao cruzar x = −2.** Um NPC empurrado para trás pela separação até recruzar a faixa não decide de novo, porque `decided` já é verdadeiro. Está certo, mas depende desse detalhe.
14. **O passo de tempo é limitado a 0,05 s** (`Math.min(0.05, dt)`). Abaixo de 20 FPS o jogo inteiro fica mais lento em vez de pular quadros. No Godot, decida se quer manter isso.
15. **A luz da máquina pisca com o relógio real** (`clock.elapsedTime`), enquanto o resto usa `simTime`. Diferença irrelevante, mas inconsistente.
16. **A tecla usada para sair da tela inicial é descartada.**
17. **O estado inicial da horta está fixo no código** (`main.js`, logo após `new Garden`): canteiro 3 pronto e canteiro 4 com 60%, para servir de tutorial.

**Gambiarras de código (reescreva de forma limpa):**

18. **Primeiro quadro com `dt = 0`.** Isso gerava `NaN` na animação dos NPCs e os deixava invisíveis. Foi contornado em três lugares (`Math.max(1e-4, …)` no loop, `if (!(dt > 0)) return` no `NPCManager.update` e `Number.isFinite` em `animate`). No Godot, o `delta` não é zero, mas evite dividir por `dt` para estimar a velocidade: guarde a velocidade de verdade.
19. **A velocidade dos NPCs é medida pela diferença de posição** (`(p − anterior)/dt`) depois da separação, então os empurrões contam como "andar" e podem girar o sprite por um quadro.
20. **`game.onRejected` usa `clock` antes de ele ser declarado.** Funciona só porque é chamado mais tarde. Organize a ordem de inicialização.
21. **Coordenadas mágicas repetidas.** O retângulo "dentro da cafeteria" aparece com valores diferentes em `groundY` (−9 a 5, −12 a 0), em `updateFade` (−9,2 a 5,2, −12,2 a 0,25) e na caixa `cafeBox` (−9,3 a 5,3, −12,3 a 0,6). As vagas e as rotas da fila são números soltos que dependem do layout. No Godot, use Marker3D e uma área única.
22. **Os balões são DOM HTML posicionados por projeção a cada frame**, um elemento por NPC. Funciona, mas no Godot prefira Controls reaproveitados ou Sprite3D.
23. **A troca de material das árvores para "pontilhado" é instantânea**, enquanto a cafeteria esmaece aos poucos. Inconsistência visual.
24. **A posição dos sprites é presa à grade nos eixos `right` e `up` da câmera.** Como `up` tem componente Y, o pé do sprite pode ficar até meio texel acima ou abaixo do chão. É invisível, mas existe.
25. **As partículas não são presas à grade de pixels** e podem cintilar um pouco.
26. **Restos que não são usados:** `bark.png` gerado e não usado; o parâmetro `size` em `loadPixelTexture`; as reexportações `gradientMap` e `mat` em `world.js`; `castShadow` e `receiveShadow` sem efeito (não há mapa de sombras); a função `makeCup` tem um parâmetro de escala que não é mais usado na bandeja.
27. **Valores lidos só na carga.** `texel`, `camYaw` e `camPitch` são lidos uma vez (os sprites e os eixos da câmera são calculados ao carregar o módulo), e `world.js` repete a conversão do `camYaw` para radianos em vez de usar `CAM.yaw`. No Godot, centralize isso num único lugar.
28. **O "posterize" não é um posterize clássico.** Ele quantiza a luminância e limita o ganho entre 0,7 e 1,35. Se portar exatamente, os resultados batem; se usar um posterize por canal, as cores mudam.
29. **O contorno só usa profundidade.** Objetos baixos sobre o chão (tapete, faixas da rua) não ganham contorno, e as quinas internas também não. Isso é intencional, mas não é um contorno completo.
30. **O estado atual não está commitado.** O único commit (`d8efe51`) é a versão voxel antiga. Faça um commit antes de usar o projeto como referência, para não perder a versão que este documento descreve.
