// Parâmetros visuais ajustáveis (nenhum altera a lógica do jogo)
export const CONFIG = {
  // Resolução interna: altura alvo do render target. A escala na tela é sempre inteira,
  // então o tamanho real fica perto disso (1080p → 270, 720p → 240).
  targetHeight: 270,
  // Unidades de mundo por pixel do render target (define o "tamanho do pixel" no mundo).
  texel: 1 / 18,

  // Câmera ortográfica isométrica
  camYaw: 45, // graus em torno do eixo Y
  camPitch: 30, // graus de inclinação (30° = linhas 2:1 clássicas de pixel art)

  // Pós-processamento
  posterizeLevels: 5, // 0 = desligado; 4 a 6 recomendado (tecla P alterna)
  outline: true, // contorno escuro de 1px (tecla O alterna)
  outlineDepth: 0.35, // diferença de profundidade (unidades de mundo) que gera contorno
  outlineDarkness: 0.45, // 0 = preto, 1 = sem escurecer
  subpixelSmooth: true, // rolagem suave sem quebrar a grade de pixels

  // Sombras sólidas (elipses)
  shadowColor: 0x8a84a6, // multiplicada sobre o chão

  // Animação de vento nas plantas (era a causa do "tremor" das plantas)
  plantWind: false,
};

export const DEG = Math.PI / 180;
