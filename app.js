/* Configuration
   If you host packs in the same repo on GitHub Pages, leave these relative paths.
   If you host packs in a different repo, replace with raw GitHub URLs like:
   https://raw.githubusercontent.com/<user>/<repo>/<branch>/packs/manifest.json
*/
const MANIFEST_URL = 'packs/manifest.json';

// UI elements
const packSelect = document.getElementById('packSelect');
const loadBtn = document.getElementById('loadBtn');
const shuffleToggle = document.getElementById('shuffleToggle');

const norwegianEl = document.getElementById('norwegian');
const englishEl = document.getElementById('english');
const pronEl = document.getElementById('pronunciation');
const breakdownEl = document.getElementById('breakdown');
const positionEl = document.getElementById('position');
const progOuter = document.getElementById('progressBar');
const progInner = progOuter.querySelector('span');

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const revealBtn = document.getElementById('revealBtn');

const markKnownBtn = document.getElementById('markKnownBtn');
const resetKnownBtn = document.getElementById('resetKnownBtn');

const entriesList = document.getElementById('entriesList');
const searchInput = document.getElementById('search');

// State
let manifest = null;
let entries = [];          // current pack entries
let order = [];            // index order
let i = 0;                 // pointer
let revealed = false;
let knownSet = new Set();  // IDs marked known

// JSON schema expected for each pack:
// {
//   "id": "a1-core",
//   "name": "A1 Core 500",
//   "language": "Norwegian Bokmål",
//   "items": [
//     {
//       "id": "a1-0001",
//       "no": "Hei, jeg heter Devon.",
//       "en": "Hi, my name is Devon.",
//       "pron": "hay, yay HEH-ter DEH-von",
//       "tokens": [
//         {"no":"Hei", "en":"Hi"},
//         {"no":"jeg", "en":"I"},
//         {"no":"heter", "en":"am called"},
//         {"no":"Devon", "en":"Devon"}
//       ]
//     },
//     ...
//   ]
// }

// Load manifest and populate packs
init();

async function init() {
  try {
    const cachedManifest = sessionStorage.getItem('manifest-cache');
    if (cachedManifest) {
      manifest = JSON.parse(cachedManifest);
    } else {
      manifest = await fetchJSON(MANIFEST_URL);
      sessionStorage.setItem('manifest-cache', JSON.stringify(manifest));
    }

    if (!manifest || !Array.isArray(manifest.packs)) {
      throw new Error('Invalid manifest format');
    }

    populatePackSelect(manifest.packs);
    autoSelectLastPack();
  } catch (err) {
    console.error(err);
    packSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Failed to load manifest';
    packSelect.appendChild(opt);
  }
}

function populatePackSelect(packs) {
  packSelect.innerHTML = '';
  packs.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.url;          // relative or absolute to JSON file
    opt.textContent = p.name;   // user facing name
    packSelect.appendChild(opt);
  });
}

function autoSelectLastPack() {
  const last = localStorage.getItem('last-pack-url');
  if (last) {
    const found = Array.from(packSelect.options).find(o => o.value === last);
    if (found) packSelect.value = last;
  }
}

loadBtn.addEventListener('click', async () => {
  const url = packSelect.value;
  if (!url) return;

  localStorage.setItem('last-pack-url', url);
  knownSet = readKnown(url);
  await loadPack(url);
});

prevBtn.addEventListener('click', () => {
  if (!entries.length) return;
  i = (i - 1 + order.length) % order.length;
  revealed = false;
  render();
});

nextBtn.addEventListener('click', () => {
  if (!entries.length) return;
  i = (i + 1) % order.length;
  revealed = false;
  render();
});

revealBtn.addEventListener('click', () => {
  revealed = !revealed;
  render();
});

markKnownBtn.addEventListener('click', () => {
  if (!entries.length) return;
  const cur = entries[order[i]];
  knownSet.add(cur.id);
  saveKnown(packSelect.value, knownSet);
  advance();
});

resetKnownBtn.addEventListener('click', () => {
  if (!entries.length) return;
  knownSet.clear();
  saveKnown(packSelect.value, knownSet);
  render();
});

shuffleToggle.addEventListener('change', () => {
  if (!entries.length) return;
  makeOrder();
  i = 0;
  revealed = false;
  render();
});

searchInput.addEventListener('input', () => {
  filterList(searchInput.value.trim());
});

async function loadPack(url) {
  try {
    entries = await fetchJSON(url);
    if (!entries || !Array.isArray(entries.items)) {
      throw new Error('Invalid pack format');
    }
    makeOrder();
    i = 0;
    revealed = false;
    buildList(entries.items);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    norwegianEl.textContent = 'Failed to load pack';
    englishEl.textContent = '';
    pronEl.textContent = '';
    breakdownEl.innerHTML = '';
    positionEl.textContent = '0 / 0';
    progInner.style.width = '0%';
  }
}

function makeOrder() {
  const n = entries.items.length;
  order = Array.from({ length: n }, (_, idx) => idx);
  if (shuffleToggle.checked) shuffle(order);
}

function render() {
  const n = entries.items.length;
  if (!n) return;
  const cur = entries.items[order[i]];

  norwegianEl.textContent = cur.no || '';
  englishEl.textContent = revealed ? (cur.en || '') : '••••';
  pronEl.textContent = revealed ? (cur.pron || '') : '';
  breakdownEl.innerHTML = '';
  if (revealed && Array.isArray(cur.tokens)) {
    for (const t of cur.tokens) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `${t.no} = ${t.en}`;
      breakdownEl.appendChild(chip);
    }
  }

  positionEl.textContent = `${i + 1} / ${n}`;

  const knownCount = countKnown(entries.items, knownSet);
  const pct = n ? Math.round((knownCount / n) * 100) : 0;
  progInner.style.width = `${pct}%`;

  // reflect known state on card border
  const card = document.getElementById('card');
  if (knownSet.has(cur.id)) {
    card.style.boxShadow = '0 0 0 1px rgba(158,240,185,0.35) inset';
  } else {
    card.style.boxShadow = 'none';
  }

  // keep list selection in sync
  markListActive(cur.id);
}

function buildList(items) {
  entriesList.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.dataset.id = it.id;

    const left = document.createElement('div');
    const no = document.createElement('p');
    no.textContent = it.no;
    const en = document.createElement('p');
    en.textContent = it.en;
    en.className = 'small';

    left.appendChild(no);
    left.appendChild(en);

    const right = document.createElement('div');
    const btn = document.createElement('button');
    btn.textContent = 'Go';
    btn.addEventListener('click', () => {
      const idx = entries.items.findIndex(x => x.id === it.id);
      if (idx >= 0) {
        i = order.indexOf(idx);
        if (i === -1) {
          // if order is shuffled and item not present, rebuild order
          makeOrder();
          i = order.indexOf(idx);
        }
        revealed = true;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    right.appendChild(btn);

    li.appendChild(left);
    li.appendChild(right);
    entriesList.appendChild(li);
  }
}

function filterList(q) {
  const needle = q.toLowerCase();
  const items = entriesList.querySelectorAll('li');
  items.forEach(li => {
    const text = li.textContent.toLowerCase();
    li.style.display = text.includes(needle) ? '' : 'none';
  });
}

function markListActive(id) {
  entriesList.querySelectorAll('li').forEach(li => {
    li.style.outline = li.dataset.id === id ? '2px solid #6aa6ff' : 'none';
  });
}

function advance() {
  i = (i + 1) % order.length;
  revealed = false;
  render();
}

function countKnown(items, set) {
  let k = 0;
  for (const it of items) if (set.has(it.id)) k++;
  return k;
}

function saveKnown(key, set) {
  try { localStorage.setItem(`known:${key}`, JSON.stringify([...set])); } catch {}
}

function readKnown(key) {
  try {
    const raw = localStorage.getItem(`known:${key}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function shuffle(a) {
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [a[j], a[k]] = [a[k], a[j]];
  }
}
