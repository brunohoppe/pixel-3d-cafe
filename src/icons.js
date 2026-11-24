// Ícones pixel-art desenhados a partir de mapas de caracteres
const PAL = {
  k: '#2b2135', w: '#ffffff', c: '#f4ead8', b: '#7a4a2a', d: '#4b2c1a', s: '#b9c6d6',
  r: '#e8424f', R: '#a8203a', y: '#ffd34e', o: '#f08a3a', g: '#5bbf5b', G: '#2f8a3e',
  u: '#5b9be8', p: '#b57be8', e: '#5a5068',
};

const STAR = [
  '....k....',
  '...kyk...',
  'kkkyyykkk',
  'kyyyyyyyk',
  '.kyyyyyk.',
  '..kyyyk..',
  '.kyykyyk.',
  '.kyk.kyk.',
  '.kk...kk.',
];

const ICONS = {
  coffee: [
    '...s..s.....',
    '..s..s......',
    '...s..s.....',
    '............',
    'kkkkkkkkkk..',
    'kbbbbbbbbkk.',
    'kcccccccck.k',
    'kcccccccck.k',
    'kcccccccckk.',
    '.kcccccck...',
    '..kkkkkk....',
  ],
  cup: [
    'kkkkkkkkkk..',
    'kbbbbbbbbkk.',
    'kcccccccck.k',
    'kcccccccck.k',
    'kcccccccckk.',
    '.kcccccck...',
    '..kkkkkk....',
  ],
  heart: [
    '.kkk.kkk.',
    'krrrkrrrk',
    'krwrrrrrk',
    'krrrrrrrk',
    '.krrrrrk.',
    '..krrrk..',
    '...krk...',
    '....k....',
  ],
  angry: [
    '.kkkkkkk.',
    'koooooook',
    'kokoookok',
    'kookokook',
    'koooooook',
    'kookkkook',
    'kokoookok',
    'koooooook',
    '.kkkkkkk.',
  ],
  sad: [
    '.kkkkkkk.',
    'kuuuuuuuk',
    'kukuuukuk',
    'kuuuuuuuk',
    'kuuuuuuuk',
    'kuukkkuuk',
    'kukuuukuk',
    'kuuuuuuuk',
    '.kkkkkkk.',
  ],
  exclaim: ['kkk', 'kyk', 'kyk', 'kyk', 'kyk', 'kkk', '...', 'kkk', 'kyk', 'kkk'],
  note: [
    '....kkk.',
    '....kpkk',
    '....k.pk',
    '....k..k',
    '....k...',
    '.kkkk...',
    'kppppk..',
    'kppppk..',
    '.kkkk...',
  ],
  house: [
    '....kk....',
    '...kRRk...',
    '..kRRRRk..',
    '.kRRRRRRk.',
    'kkkkkkkkkk',
    '.kcccccck.',
    '.kcuckdck.',
    '.kcuckdck.',
    '.kkkkkkkk.',
  ],
  bag: [
    '...kkk...',
    '..k...k..',
    '..k...k..',
    'kkkkkkkkk',
    'kgggggggk',
    'kgggggggk',
    'kgggwgggk',
    'kgggggggk',
    'kGGGGGGGk',
    'kkkkkkkkk',
  ],
  bean: [
    '..kkk..',
    '.kdddk.',
    'kddbddk',
    'kdbdddk',
    'kddbddk',
    'kdddbdk',
    '.kddbk.',
    '..kkk..',
  ],
  coin: [
    '..kkkk..',
    '.kyyyyk.',
    'kyywyyok',
    'kywyyyok',
    'kyyyyyok',
    'kyyyyook',
    '.kyoook.',
    '..kkkk..',
  ],
  phone: [
    '.kkkkkkkk.',
    'keeeeeeeek',
    'keeekkeeek',
    'keuuuuuuek',
    'keuyyuuuek',
    'keuyyuuuek',
    'keuuuuuuek',
    'keuuugguek',
    'keuuugguek',
    'keuuuuuuek',
    'keuuuuuuek',
    'keeeeeeeek',
    'keeekkeeek',
    '.kkkkkkkk.',
  ],
  star: STAR,
  starOff: STAR.map((r) => r.replace(/y/g, 'e')),
};

const cache = {};
export function icon(name) {
  if (cache[name]) return cache[name];
  const rows = ICONS[name];
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (PAL[ch]) {
        g.fillStyle = PAL[ch];
        g.fillRect(x, y, 1, 1);
      }
    });
  });
  return (cache[name] = { url: c.toDataURL(), w, h });
}
