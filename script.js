const card = document.getElementById('card');
const aurora = document.querySelector('.aurora');
const calm = matchMedia('(prefers-reduced-motion: reduce)');

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function aim(e) {
  if (calm.matches) return;

  const box = card.getBoundingClientRect();
  const x = clamp((e.clientX - box.left) / box.width, 0, 1);
  const y = clamp((e.clientY - box.top) / box.height, 0, 1);

  card.style.setProperty('--rx', ((0.5 - y) * 10).toFixed(2) + 'deg');
  card.style.setProperty('--ry', ((x - 0.5) * 12).toFixed(2) + 'deg');
  card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
  card.style.setProperty('--my', (y * 100).toFixed(1) + '%');

  // background drifts a little the other way
  aurora.style.setProperty('--px', ((e.clientX / innerWidth - 0.5) * -40).toFixed(1) + 'px');
  aurora.style.setProperty('--py', ((e.clientY / innerHeight - 0.5) * -40).toFixed(1) + 'px');
}

function rest() {
  ['--rx', '--ry', '--mx', '--my'].forEach(p => card.style.removeProperty(p));
  ['--px', '--py'].forEach(p => aurora.style.removeProperty(p));
}

addEventListener('pointermove', aim);
document.addEventListener('pointerleave', rest);
addEventListener('blur', rest);
