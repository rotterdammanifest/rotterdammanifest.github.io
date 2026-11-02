const card = document.getElementById('card');
const title = document.querySelector('h1');
const calm = matchMedia('(prefers-reduced-motion: reduce)');

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// split the title so each letter can react on its own
const word = title.textContent;
title.setAttribute('aria-label', word);
title.textContent = '';
const letters = [...word].map(ch => {
  const s = document.createElement('span');
  s.textContent = ch;
  s.setAttribute('aria-hidden', 'true');
  title.append(s);
  return s;
});

let centers = [];
function measure() {
  centers = letters.map(s => {
    const r = s.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });
}
measure();
document.fonts.ready.then(measure);
addEventListener('resize', measure);

function aim(e) {
  if (calm.matches) return;

  const box = card.getBoundingClientRect();
  const x = clamp((e.clientX - box.left) / box.width, 0, 1);
  const y = clamp((e.clientY - box.top) / box.height, 0, 1);
  card.style.setProperty('--rx', ((0.5 - y) * 10).toFixed(2) + 'deg');
  card.style.setProperty('--ry', ((x - 0.5) * 12).toFixed(2) + 'deg');
  card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
  card.style.setProperty('--my', (y * 100).toFixed(1) + '%');

  letters.forEach((s, i) => {
    const d = Math.hypot(e.clientX - centers[i][0], e.clientY - centers[i][1]);
    const k = Math.pow(clamp(1 - d / 170, 0, 1), 2);
    s.style.fontVariationSettings = `"opsz" 96, "wght" ${Math.round(420 + 300 * k)}, "wdth" ${Math.round(88 + 12 * k)}`;
  });
}

function rest() {
  ['--rx', '--ry', '--mx', '--my'].forEach(p => card.style.removeProperty(p));
  letters.forEach(s => s.style.removeProperty('font-variation-settings'));
}

addEventListener('pointermove', aim);
document.addEventListener('pointerleave', rest);
addEventListener('blur', rest);
