/* Lingua practice: sentence builder, conjugation drill, gap fill, dictation, article blitz.
   Uses window.Lingua (set up in app.js). Verb tables and AI sentences are cached on the device. */
'use strict';
{
const A = window.Lingua, { S, esc, $, toast } = A;
const P = { conj: A.load('conj', {}), stats: A.load('conjstats', {}), gen: A.load('prgen', {}), best: A.load('best', {}), nouns: A.load('prnouns', {}) };
const saveP = () => { A.save('conj', P.conj); A.save('conjstats', P.stats); A.save('prgen', P.gen); A.save('best', P.best); A.save('prnouns', P.nouns); };
const lang = () => S.lang, myCards = () => A.cards.filter(c => c.lang === S.lang);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------- language data ----------
const ACCENTS = { es: 'á é í ó ú ñ ü ¿ ¡', de: 'ä ö ü ß', no: 'æ ø å', it: 'à è é ì ò ù', fr: 'à â ç é è ê ë î ï ô û ù œ',
  pt: 'á â ã à ç é ê í ó ô õ ú', nl: 'é ë ï ö', sv: 'å ä ö', pl: 'ą ć ę ł ń ó ś ź ż' };
const TENSES = {
  es: ['presente', 'pretérito indefinido', 'pretérito imperfecto', 'pretérito perfecto', 'futuro simple', 'condicional', 'presente de subjuntivo', 'imperativo'],
  de: ['Präsens', 'Präteritum', 'Perfekt', 'Futur I', 'Konjunktiv II', 'Imperativ'],
  no: ['presens', 'preteritum', 'presens perfektum', 'imperativ'],
  it: ['presente', 'passato prossimo', 'imperfetto', 'futuro semplice', 'condizionale presente', 'congiuntivo presente'],
  fr: ['présent', 'passé composé', 'imparfait', 'futur simple', 'conditionnel présent', 'subjonctif présent'],
  pt: ['presente', 'pretérito perfeito', 'pretérito imperfeito', 'futuro do presente', 'condicional', 'presente do subjuntivo'],
  nl: ['presens', 'imperfectum', 'perfectum'],
  sv: ['presens', 'preteritum', 'perfekt', 'imperativ'],
  pl: ['czas teraźniejszy', 'czas przeszły', 'czas przyszły', 'tryb rozkazujący']
};
const CORE = {
  es: ['ser', 'estar', 'tener', 'hacer', 'ir', 'poder', 'decir', 'querer', 'saber', 'venir', 'poner', 'salir', 'dar', 'ver', 'hablar', 'comer', 'vivir', 'llegar'],
  de: ['sein', 'haben', 'werden', 'können', 'müssen', 'wollen', 'gehen', 'kommen', 'sehen', 'geben', 'nehmen', 'wissen', 'fahren', 'essen', 'sprechen', 'machen', 'lesen', 'bleiben'],
  no: ['være', 'ha', 'bli', 'gå', 'komme', 'si', 'gjøre', 'se', 'ta', 'gi', 'få', 'vite', 'kunne', 'ville', 'skulle', 'spise', 'snakke', 'skrive'],
  it: ['essere', 'avere', 'fare', 'andare', 'venire', 'potere', 'volere', 'dovere', 'dire', 'sapere', 'stare', 'dare', 'vedere', 'parlare', 'mangiare', 'dormire'],
  fr: ['être', 'avoir', 'aller', 'faire', 'pouvoir', 'vouloir', 'devoir', 'dire', 'savoir', 'venir', 'prendre', 'voir', 'parler', 'manger', 'finir', 'partir'],
  pt: ['ser', 'estar', 'ter', 'fazer', 'ir', 'poder', 'dizer', 'querer', 'saber', 'vir', 'dar', 'ver', 'falar', 'comer', 'viver', 'pôr'],
  nl: ['zijn', 'hebben', 'worden', 'kunnen', 'moeten', 'willen', 'gaan', 'komen', 'zien', 'geven', 'nemen', 'weten', 'maken', 'spreken'],
  sv: ['vara', 'ha', 'bli', 'gå', 'komma', 'säga', 'göra', 'se', 'ta', 'ge', 'få', 'veta', 'kunna', 'vilja', 'äta', 'tala'],
  pl: ['być', 'mieć', 'iść', 'robić', 'móc', 'chcieć', 'wiedzieć', 'mówić', 'jeść', 'pić', 'widzieć', 'dawać', 'brać', 'pisać']
};

// ---------- text helpers ----------
const normW = w => String(w).toLowerCase().replace(/[^\p{L}\p{M}\d'’\-]/gu, '');
const strip = w => normW(w).normalize('NFD').replace(/\p{M}/gu, '');
const words = t => String(t).replace(/^[\s.…]+|[\s.…]+$/g, '').split(/\s+/).filter(w => normW(w));
const tileText = w => w.replace(/^[¿¡"«“(]+|[.,!?;:"»”)…]+$/g, '');
const normPhrase = t => words(t).map(normW).join(' ');
function judge(answer, expected, person) {
  let a = normPhrase(answer);
  if (person && person !== '—') { const p = normPhrase(person); if (a.startsWith(p + ' ')) a = a.slice(p.length + 1); }
  const alts = String(expected).split('/').map(x => normPhrase(x)).filter(Boolean);
  if (alts.includes(a)) return 'ok';
  const sa = a.normalize('NFD').replace(/\p{M}/gu, '');
  if (alts.some(x => x.normalize('NFD').replace(/\p{M}/gu, '') === sa)) return 'almost';
  return 'wrong';
}
function wordDiff(target, typed) {                 // colours the target sentence by what the learner got right
  const tw = words(target), uw = words(typed), a = tw.map(strip), b = uw.map(strip);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const mark = new Array(a.length).fill('bad');
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { mark[i] = normW(tw[i]) === normW(uw[j]) ? 'ok' : 'almost'; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const score = Math.round(100 * mark.filter(m => m !== 'bad').length / Math.max(1, a.length));
  return { html: tw.map((w, i) => `<span class="w-${mark[i]}">${esc(w)}</span>`).join(' '), score, perfect: mark.every(m => m === 'ok') && a.length === b.length };
}
const accentBar = () => `<div class="acc">${(ACCENTS[lang()] || '').split(' ').map(c => `<button type="button" data-ch="${c}">${c}</button>`).join('')}</div>`;
document.addEventListener('pointerdown', e => { if (e.target.closest('.acc button')) e.preventDefault(); });   // keep the keyboard open
document.addEventListener('click', e => {
  const b = e.target.closest('.acc button'); if (!b) return;
  const inp = b.closest('.card').querySelector('input,textarea'); if (!inp) return;
  const s = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? s;
  inp.value = inp.value.slice(0, s) + b.dataset.ch + inp.value.slice(en);
  inp.focus(); inp.setSelectionRange(s + 1, s + 1);
});

// ---------- sentence pool ----------
const clean = t => String(t || '').replace(/^[\s.…]+/, '').replace(/[\s…]+$/, '').trim();
function sentencePool() {
  const seen = new Set(), out = [];
  const add = (t, en) => { t = clean(t); const n = words(t).length; if (n >= 3 && n <= 16 && en && !seen.has(t)) { seen.add(t); out.push({ t, en }); } };
  myCards().forEach(c => { if (c.type === 'sentence') add(c.front, c.back); else add(c.example, c.exampleEn); });
  (P.gen[lang()] || []).forEach(x => add(x.text, x.en));
  return out;
}
async function genSentences(n, onStatus) {
  const deckWords = shuffle(myCards().filter(c => c.type === 'word').map(c => c.front)).slice(0, 25).join(', ');
  const r = await A.gemini([{ text: `Write ${n} natural, everyday ${A.L().name} sentences for a ${A.lvl()} learner, each 5–12 words.
${deckWords ? 'Use these words where natural (one or two per sentence): ' + deckWords + '.' : ''}
Return ONLY JSON: {"sentences":[{"text": the ${A.L().name} sentence, "en": English translation}]}` }], onStatus);
  const got = (r.sentences || []).filter(x => x.text && x.en);
  P.gen[lang()] = [...got, ...(P.gen[lang()] || [])].slice(0, 120); saveP();
  return got.length;
}
async function generateSentences(btn) {
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Writing…';
  try { toast(await genSentences(10) + ' new sentences'); } catch (e) { toast(e.message); }
  btn.disabled = false; btn.textContent = '✨ New AI sentences';
}
async function fetchNouns(onStatus) {
  const r = await A.gemini([{ text: `List 60 common ${A.L().name} nouns for a ${A.lvl()} learner with their definite article (${A.L().arts}). Mix the genders. Return ONLY JSON: {"nouns":[{"a": article, "n": noun, "en": English}]}` }], onStatus);
  P.nouns[lang()] = (r.nouns || []).filter(x => x.a && x.n); saveP();
}

// ---------- framework ----------
const panel = $('#prPanel'), menu = $('#prMenu'), pron = $('#pronPanel');
let timer = null, mode = null;
const NAMES = { builder: 'Sentence builder', conj: 'Conjugation', gap: 'Gap fill', dict: 'Dictation', gender: 'Article blitz', pron: 'Pronunciation' };
function stopTimer() { if (timer) clearInterval(timer); timer = null; }
function openMode(m) {
  stopTimer(); mode = m;
  menu.hidden = true; $('#offlineBox').hidden = true; $('#prBack').hidden = false; $('#prTitle').textContent = NAMES[m];
  pron.hidden = m !== 'pron'; panel.hidden = m === 'pron';
  if (MODES[m]) MODES[m]();
  window.scrollTo(0, 0);
}
function backToMenu() { stopTimer(); mode = null; menu.hidden = false; $('#offlineBox').hidden = false; offStat(); panel.hidden = true; pron.hidden = true; $('#prBack').hidden = true; $('#prTitle').textContent = 'Practice'; }
menu.onclick = e => { const b = e.target.closest('[data-mode]'); if (b) openMode(b.dataset.mode); };
$('#prBack').onclick = backToMenu;
A.onLang = () => { offStat(); if (mode && mode !== 'pron') openMode(mode); };
A.onShow = offStat;

// ---------- offline preparation ----------
function offStat() {
  const v = Object.keys(P.conj[lang()] || {}).length, s = (P.gen[lang()] || []).length, n = (P.nouns[lang()] || []).length;
  const el = $('#offStat'); if (!el) return;
  el.textContent = `${A.L().name}: ${v} verb tables · ${s} AI sentences · ${n} nouns saved. Reviews, gap fill and dictation always work offline.`;
}
$('#offBtn').onclick = async () => {
  const btn = $('#offBtn'), el = $('#offStat'), say = m => { el.innerHTML = '<span class="spinner"></span> ' + esc(m); };
  btn.disabled = true; const problems = [];
  try {
    const table = P.conj[lang()] = P.conj[lang()] || {};
    const missing = [...new Set([...deckVerbs(), ...(CORE[lang()] || [])])].filter(v => !table[v]);
    for (let i = 0; i < missing.length; i += 6) {
      say(`Verb tables ${i + 1}–${Math.min(i + 6, missing.length)} of ${missing.length}…`);
      try { await fetchTables(missing.slice(i, i + 6), say); } catch (e) { problems.push('verbs: ' + e.message); break; }
    }
    if ((P.gen[lang()] || []).length < 40) {
      say('Writing practice sentences…');
      try { await genSentences(20, say); await genSentences(20, say); } catch (e) { problems.push('sentences: ' + e.message); }
    }
    if (lang() !== 'pl' && (P.nouns[lang()] || []).length < 20) {
      say('Collecting nouns for Article blitz…');
      try { await fetchNouns(say); } catch (e) { problems.push('nouns: ' + e.message); }
    }
  } finally {
    btn.disabled = false; offStat();
    toast(problems.length ? 'Partly done. The AI was busy, tap again later (' + problems[0] + ')' : 'Ready for offline practice ✓');
  }
};
const empty = msg => { panel.innerHTML = `<div class="card"><p>${msg}</p></div>`; };
const fb = (cls, html) => `<div class="fb fb-${cls}">${html}</div>`;

// ---------- 1. sentence builder ----------
let sb = { level: 'tiles', showEn: true };
function builder() {
  const pool = sentencePool();
  if (pool.length < 1) {
    panel.innerHTML = `<div class="card"><p>No sentences yet. Add words from videos or articles (their example sentences are used), or let AI write some for you.</p>
      <button class="btn gold" id="sbGen">✨ New AI sentences</button></div>`;
    $('#sbGen').onclick = async e => { await generateSentences(e.target); builder(); };
    return;
  }
  const s = pick(pool), tw = words(s.t).map(tileText);
  let tiles = tw.map((w, i) => ({ w, k: i }));
  if (sb.level === 'decoys') {
    const others = shuffle(pool.filter(x => x !== s).flatMap(x => words(x.t).map(tileText))).filter(w => !tw.map(normW).includes(normW(w)));
    others.slice(0, 3).forEach((w, i) => tiles.push({ w, k: 100 + i, decoy: true }));
  }
  tiles = shuffle(tiles);
  let chosen = [];
  panel.innerHTML = `<div class="card">
      <div class="row"><div class="seg" id="sbLevel"><button data-l="tiles">Tiles</button><button data-l="decoys">Tiles + decoys</button><button data-l="type">Type it</button></div>
        <label class="check"><input type="checkbox" id="sbEn" ${sb.showEn ? 'checked' : ''}> Show English</label></div>
      <p class="prompt-en" ${sb.showEn ? '' : 'hidden'}>${esc(s.en)}</p>
      ${sb.level === 'type' ? `<textarea id="sbIn" rows="2" placeholder="Type the sentence in ${A.L().name}" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>${accentBar()}`
        : `<div class="answer" id="sbAns"></div><div class="pool" id="sbPool"></div>`}
      <div id="sbFb"></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="sbCheck">Check</button>${sb.level !== 'type' ? '<button class="btn ghost" id="sbHint">Hint</button>' : ''}
        <button class="btn ghost" id="sbListen">🔊</button><button class="btn ghost" id="sbNext">Next ›</button><span class="grow"></span><button class="btn ghost" id="sbGen">✨ New AI sentences</button></div>
      <p class="muted small">${pool.length} sentence${pool.length === 1 ? '' : 's'} from your deck${(P.gen[lang()] || []).length ? ' and AI' : ''}.</p></div>`;
  $('#sbLevel').querySelector(`[data-l="${sb.level}"]`).classList.add('on');
  $('#sbLevel').onclick = e => { const b = e.target.closest('button'); if (b) { sb.level = b.dataset.l; builder(); } };
  $('#sbEn').onchange = e => { sb.showEn = e.target.checked; panel.querySelector('.prompt-en').hidden = !sb.showEn; };
  const draw = () => {
    if (sb.level === 'type') return;
    $('#sbAns').innerHTML = chosen.map((t, i) => `<button class="tile" data-c="${i}">${esc(t.w)}</button>`).join('') || '<span class="muted small">Tap the words in the right order</span>';
    $('#sbPool').innerHTML = tiles.map((t, i) => chosen.includes(t) ? `<button class="tile used" disabled>${esc(t.w)}</button>` : `<button class="tile" data-p="${i}">${esc(t.w)}</button>`).join('');
  };
  if (sb.level !== 'type') {
    $('#sbPool').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { chosen.push(tiles[+b.dataset.p]); $('#sbFb').innerHTML = ''; draw(); } };
    $('#sbAns').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { chosen.splice(+b.dataset.c, 1); $('#sbFb').innerHTML = ''; draw(); } };
    $('#sbHint').onclick = () => {
      let i = 0; while (i < chosen.length && normW(chosen[i].w) === normW(tw[i])) i++;
      chosen = chosen.slice(0, i);
      const next = tiles.find(t => !chosen.includes(t) && !t.decoy && normW(t.w) === normW(tw[i]));
      if (next) chosen.push(next); draw();
    };
    draw();
  }
  $('#sbListen').onclick = () => A.speak(s.t);
  $('#sbNext').onclick = builder;
  $('#sbGen').onclick = e => generateSentences(e.target);
  $('#sbCheck').onclick = () => {
    if (sb.level === 'type') {
      const d = wordDiff(s.t, $('#sbIn').value);
      $('#sbFb').innerHTML = fb(d.perfect ? 'ok' : d.score >= 70 ? 'almost' : 'bad', `<div class="big">${d.html}</div><div class="small">${d.perfect ? 'Perfect!' : d.score + '% right · green = correct, gold = accent missing, red = wrong or missing'}</div>`);
      if (d.score >= 70) A.speak(s.t);
      return;
    }
    const ok = chosen.length === tw.length && chosen.every((t, i) => normW(t.w) === normW(tw[i]));
    if (ok) { $('#sbFb').innerHTML = fb('ok', `✓ <span class="big">${esc(s.t)}</span>`); A.speak(s.t); }
    else {
      $('#sbAns').querySelectorAll('.tile').forEach((b, i) => b.classList.toggle('wrong', !tw[i] || normW(chosen[i].w) !== normW(tw[i])));
      $('#sbFb').innerHTML = fb('bad', chosen.length < tw.length ? 'Not finished yet.' : 'Not quite. Red words are in the wrong place. Tap them to move them back.');
    }
  };
}

// ---------- 2. conjugation ----------
const CONJ = () => (S.conj = S.conj || {}, S.conj[lang()] = S.conj[lang()] || { tenses: (TENSES[lang()] || []).slice(0, 2), sprint: false });
function deckVerbs() {
  return [...new Set(myCards().filter(c => /verb/i.test(c.pos || '')).map(c => c.front.replace(/^(to )/i, '').trim()))];
}
function conj() {
  const cfg = CONJ(), tenses = TENSES[lang()] || [];
  if (!tenses.length) return empty('Conjugation is not available for this language yet.');
  const dv = deckVerbs(), cached = Object.keys(P.conj[lang()] || {});
  const best = P.best[lang() + ':conj'] || 0;
  panel.innerHTML = `<div class="card">
      <label>Tenses</label><div class="seg" id="cjT">${tenses.map(t => `<button data-t="${esc(t)}" class="${cfg.tenses.includes(t) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
      <label>Verbs</label><p class="muted small" style="margin:0">${dv.length} verbs from your deck + ${(CORE[lang()] || []).length} common verbs · ${cached.length} tables saved on this device</p>
      <label>Mode</label><div class="seg" id="cjM"><button data-m="0" class="${cfg.sprint ? '' : 'on'}">Practice</button><button data-m="1" class="${cfg.sprint ? 'on' : ''}">60-second sprint${best ? ' · best ' + best : ''}</button></div>
      <div class="row" style="margin-top:14px"><button class="btn" id="cjGo">Start</button><span class="small muted" id="cjSt"></span></div></div>`;
  $('#cjT').onclick = e => { const b = e.target.closest('button'); if (!b) return; const t = b.dataset.t;
    cfg.tenses = cfg.tenses.includes(t) ? cfg.tenses.filter(x => x !== t) : [...cfg.tenses, t]; if (!cfg.tenses.length) cfg.tenses = [t]; A.persist(); conj(); };
  $('#cjM').onclick = e => { const b = e.target.closest('button'); if (!b) return; cfg.sprint = b.dataset.m === '1'; A.persist(); conj(); };
  $('#cjGo').onclick = async () => {
    const all = [...new Set([...dv, ...(CORE[lang()] || [])])];
    const table = P.conj[lang()] = P.conj[lang()] || {};
    const missing = all.filter(v => !table[v]).slice(0, 12);
    if (missing.length) {
      const st = $('#cjSt'), btn = $('#cjGo'); btn.disabled = true;
      try {
        for (let i = 0; i < missing.length; i += 6) {
          st.innerHTML = `<span class="spinner"></span> Downloading verb tables (${i + 1}–${Math.min(i + 6, missing.length)} of ${missing.length})…`;
          await fetchTables(missing.slice(i, i + 6), m => { st.textContent = m; });
        }
      } catch (e) { if (!Object.keys(table).length) { st.textContent = '❌ ' + e.message; btn.disabled = false; return; } toast('Some verb tables could not be loaded: ' + e.message); }
      btn.disabled = false;
    }
    startDrill(all.filter(v => table[v]));
  };
}
async function fetchTables(verbs, onStatus) {
  const r = await A.gemini([{ text: `Conjugate these ${A.L().name} verbs: ${verbs.join(', ')}.
Tenses (use these names exactly as keys): ${(TENSES[lang()] || []).join(' | ')}.
Return ONLY JSON: {"verbs":[{"lemma": the infinitive as given, "meaning_en": short English meaning, "tenses": {"<tense name>": [{"p": the person / pronoun as in grammar tables, "f": the complete form, including any auxiliary or reflexive pronoun, e.g. "habe gemacht", "me levanto"}]}}]}
Use the standard set of persons for the language (for Spanish: yo, tú, él/ella/usted, nosotros, vosotros, ellos/ellas/ustedes; for German: ich, du, er/sie/es, wir, ihr, sie/Sie).
If a language has no person endings (Norwegian, Swedish), give one entry with "p": "—". For the imperative, only the persons that exist. Give alternatives as "a / b".` }], onStatus);
  const table = P.conj[lang()] = P.conj[lang()] || {};
  (r.verbs || []).forEach(v => { if (v.lemma && v.tenses) table[v.lemma] = { en: v.meaning_en || '', t: v.tenses }; });
  saveP();
}
function startDrill(verbs) {
  const cfg = CONJ(), table = P.conj[lang()], st = P.stats[lang()] = P.stats[lang()] || {};
  const cands = [];
  verbs.forEach(v => cfg.tenses.forEach(t => (table[v].t[t] || []).forEach(f => f.f && cands.push({ v, t, p: f.p, f: f.f, en: table[v].en }))));
  if (!cands.length) return empty('No forms found for these tenses. Try other tenses.');
  let score = 0, streak = 0, n = 0, left = 60, q = null, answered = false;
  const choose = () => {
    const sample = shuffle(cands).slice(0, 40);
    const w = sample.map(c => { const s = st[c.v + '|' + c.t + '|' + c.p] || {}; return Math.max(0.3, 1 + 2 * (s.w || 0) - 0.5 * Math.min(s.r || 0, 4)); });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < sample.length; i++) { r -= w[i]; if (r <= 0) return sample[i]; }
    return sample[0];
  };
  panel.innerHTML = `<div class="card">
      <div class="row"><span class="tag">${cfg.sprint ? '<span id="cjTime">60</span> s' : 'Practice'}</span><span class="grow"></span>
        <span class="small">Score <b id="cjScore">0</b> · Streak <b id="cjStreak">0</b></span></div>
      <div class="conjq" id="cjQ"></div>
      <input id="cjIn" placeholder="Type the form" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off">${accentBar()}
      <div id="cjFb"></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="cjCheck">Check</button><button class="btn ghost" id="cjSkip">Show answer</button><button class="btn ghost" id="cjBack">Settings</button></div></div>`;
  const next = () => {
    q = choose(); answered = false; n++;
    $('#cjQ').innerHTML = `<div class="muted small">${esc(q.t)}</div><div class="big">${q.p && q.p !== '—' ? `<span class="art">${esc(q.p)}</span> ` : ''}${esc(q.v)}</div><div class="muted small">${esc(q.en)}</div>`;
    $('#cjIn').value = ''; $('#cjFb').innerHTML = ''; $('#cjIn').focus();
  };
  const record = ok => { const k = q.v + '|' + q.t + '|' + q.p, s = st[k] = st[k] || {}; if (ok) s.r = (s.r || 0) + 1; else s.w = (s.w || 0) + 1; saveP(); };
  const check = () => {
    if (answered) return next();
    answered = true;
    const res = judge($('#cjIn').value, q.f, q.p);
    if (res === 'ok') { score++; streak++; $('#cjFb').innerHTML = fb('ok', `✓ ${esc(q.f)}`); A.speak((q.p && q.p !== '—' ? q.p.split('/')[0] + ' ' : '') + q.f.split('/')[0]); }
    else if (res === 'almost') { score += 0.5; streak = 0; $('#cjFb').innerHTML = fb('almost', `Almost: check the accents → <b>${esc(q.f)}</b>`); }
    else { streak = 0; $('#cjFb').innerHTML = fb('bad', `✗ <b>${esc(q.f)}</b>${$('#cjIn').value ? ` <span class="muted">(you wrote ${esc($('#cjIn').value)})</span>` : ''}`); }
    record(res === 'ok');
    $('#cjScore').textContent = score; $('#cjStreak').textContent = streak;
    if (cfg.sprint) setTimeout(() => { if (answered && left > 0) next(); }, res === 'ok' ? 500 : 1400);
  };
  $('#cjCheck').onclick = check;
  $('#cjIn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); check(); } };
  $('#cjSkip').onclick = () => { if (!answered) { $('#cjIn').value = ''; check(); } };
  $('#cjBack').onclick = () => { stopTimer(); conj(); };
  next();
  if (cfg.sprint) {
    timer = setInterval(() => {
      left--; const el = $('#cjTime'); if (el) el.textContent = left;
      if (left <= 0) {
        stopTimer(); const k = lang() + ':conj', rec = score > (P.best[k] || 0); if (rec) { P.best[k] = score; saveP(); }
        panel.innerHTML = `<div class="card flash"><div class="score">${score}</div><p>${rec ? 'New best score! 🏆' : 'Best: ' + P.best[k]}</p>
          <div class="row"><button class="btn" id="cjAgain">Play again</button><button class="btn ghost" id="cjSet">Settings</button></div></div>`;
        $('#cjAgain').onclick = () => startDrill(verbs); $('#cjSet').onclick = conj;
      }
    }, 1000);
  }
}

// ---------- 3. gap fill ----------
function gapItems() {
  const out = [];
  myCards().forEach(c => {
    if (!c.example || c.type === 'sentence') return;
    for (const cand of [c.form, c.front].filter(Boolean)) {
      const pat = cand.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const m = new RegExp(`(?<![\\p{L}\\p{M}])${pat}(?![\\p{L}\\p{M}])`, 'iu').exec(c.example);
      if (m) { out.push({ c, ans: m[0], before: c.example.slice(0, m.index), after: c.example.slice(m.index + m[0].length) }); break; }
    }
  });
  return out;
}
function gap() {
  const items = gapItems();
  if (!items.length) return empty('No gap sentences yet. Words you add from videos and articles come with example sentences, and they show up here.');
  const g = pick(items); let hints = 0, answered = false;
  panel.innerHTML = `<div class="card">
      <p class="gapsent">${esc(g.before)}<span class="gap">${'_'.repeat(Math.max(4, g.ans.length))}</span>${esc(g.after)}</p>
      <p class="muted small">${esc(g.c.exampleEn)}</p>
      <input id="gpIn" placeholder="Missing word" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off">${accentBar()}
      <div id="gpFb"></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="gpCheck">Check</button><button class="btn ghost" id="gpHint">Hint</button><button class="btn ghost" id="gpNext">Next ›</button></div>
      <p class="muted small">${items.length} sentence${items.length === 1 ? '' : 's'} from your deck</p></div>`;
  const check = () => {
    if (answered) return gap();
    answered = true;
    const res = judge($('#gpIn').value, g.ans);
    panel.querySelector('.gap').textContent = g.ans; panel.querySelector('.gap').classList.add('filled');
    $('#gpFb').innerHTML = res === 'ok' ? fb('ok', '✓ Correct') : res === 'almost' ? fb('almost', `Almost: <b>${esc(g.ans)}</b> (accents)`) : fb('bad', `✗ <b>${esc(g.ans)}</b> · ${esc(g.c.back)}`);
    A.speak(g.c.example);
  };
  $('#gpCheck').onclick = check;
  $('#gpIn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); check(); } };
  $('#gpHint').onclick = () => {
    hints++;
    $('#gpFb').innerHTML = fb('hint', hints === 1 ? `Meaning: ${esc(g.c.back)}${normW(g.c.front) !== normW(g.ans) ? ` · dictionary form: <b>${esc(g.c.front)}</b>` : ''}` : `Starts with <b>${esc(g.ans.slice(0, hints - 1))}</b>…`);
  };
  $('#gpNext').onclick = gap;
}

// ---------- 4. dictation ----------
function dict() {
  const pool = sentencePool();
  if (!pool.length) return empty('No sentences yet. Add words with example sentences, or use ✨ New AI sentences in the Sentence builder.');
  const s = pick(pool);
  panel.innerHTML = `<div class="card">
      <div class="row"><button class="btn" id="dcPlay">🔊 Play</button><button class="btn ghost" id="dcSlow">🐢 Slowly</button>
        <label class="check"><input type="checkbox" id="dcEn"> Show English</label></div>
      <p class="prompt-en" id="dcEnT" hidden>${esc(s.en)}</p>
      <textarea id="dcIn" rows="2" placeholder="Type what you hear" autocapitalize="off" autocorrect="off" spellcheck="false" style="margin-top:12px"></textarea>${accentBar()}
      <div id="dcFb"></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="dcCheck">Check</button><button class="btn ghost" id="dcNext">Next ›</button></div></div>`;
  $('#dcPlay').onclick = () => A.speak(s.t);
  $('#dcSlow').onclick = () => A.speak(s.t, true);
  $('#dcEn').onchange = e => { $('#dcEnT').hidden = !e.target.checked; };
  $('#dcCheck').onclick = () => {
    const d = wordDiff(s.t, $('#dcIn').value);
    $('#dcFb').innerHTML = fb(d.perfect ? 'ok' : d.score >= 70 ? 'almost' : 'bad', `<div class="big">${d.html}</div><div class="small">${d.perfect ? 'Perfect!' : d.score + '% · ' + esc(s.en)}</div>`);
  };
  $('#dcNext').onclick = dict;
  setTimeout(() => A.speak(s.t), 300);
}

// ---------- 5. article blitz ----------
async function gender() {
  if (lang() === 'pl') return empty('Polish has no articles, so there is no article game for it.');
  let nouns = myCards().filter(c => c.type === 'word' && c.article && !/\s/.test(c.article)).map(c => ({ a: c.article, n: c.front, en: c.back }));
  nouns = nouns.concat(P.nouns[lang()] || []);
  const seen = new Set(); nouns = nouns.filter(x => !seen.has(norm(x.n)) && seen.add(norm(x.n)));
  if (nouns.length < 12) {
    panel.innerHTML = `<div class="card"><p><span class="spinner"></span> Getting common nouns for your level…</p></div>`;
    try { await fetchNouns(); return gender(); } catch (e) { if (nouns.length < 4) return empty('❌ ' + e.message); }
  }
  const opts = [...new Set(nouns.map(x => x.a.toLowerCase()))].slice(0, 6);
  const k = lang() + ':gender', best = P.best[k] || 0;
  panel.innerHTML = `<div class="card flash"><p>Tap the right article as fast as you can. 60 seconds.</p><p class="muted small">${nouns.length} nouns · best ${best}</p>
    <button class="btn gold" id="gnGo">Start</button></div>`;
  $('#gnGo').onclick = () => {
    let score = 0, streak = 0, left = 60, q = null, lock = false;
    panel.innerHTML = `<div class="card flash">
        <div class="row" style="width:100%"><span class="tag"><span id="gnTime">60</span> s</span><span class="grow"></span><span class="small">Score <b id="gnScore">0</b> · Streak <b id="gnStreak">0</b></span></div>
        <div class="big" id="gnNoun" style="font-size:40px;margin:24px 0 4px"></div><div class="muted small" id="gnEn"></div><div id="gnFb" style="min-height:28px;margin:8px 0"></div>
        <div class="artbtns" id="gnBtns">${opts.map(a => `<button class="btn" data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>`;
    const next = () => { q = pick(nouns); lock = false; $('#gnNoun').textContent = q.n; $('#gnEn').textContent = q.en || ''; $('#gnFb').innerHTML = ''; };
    $('#gnBtns').onclick = e => {
      const b = e.target.closest('[data-a]'); if (!b || lock) return; lock = true;
      const ok = b.dataset.a === q.a.toLowerCase();
      if (ok) { score++; streak++; $('#gnFb').innerHTML = `<span class="w-ok">✓ ${esc(q.a)} ${esc(q.n)}</span>`; }
      else { streak = 0; $('#gnFb').innerHTML = `<span class="w-bad">✗ ${esc(q.a)} ${esc(q.n)}</span>`; }
      $('#gnScore').textContent = score; $('#gnStreak').textContent = streak;
      setTimeout(next, ok ? 350 : 1100);
    };
    next();
    timer = setInterval(() => {
      left--; const el = $('#gnTime'); if (el) el.textContent = left;
      if (left <= 0) {
        stopTimer(); const rec = score > (P.best[k] || 0); if (rec) { P.best[k] = score; saveP(); }
        panel.innerHTML = `<div class="card flash"><div class="score">${score}</div><p>${rec ? 'New best score! 🏆' : 'Best: ' + P.best[k]}</p><button class="btn gold" id="gnAgain">Play again</button></div>`;
        $('#gnAgain').onclick = gender;
      }
    }, 1000);
  };
}
const norm = s => String(s || '').toLowerCase().trim();

const MODES = { builder, conj, gap, dict, gender, pron: null };
offStat();
}
