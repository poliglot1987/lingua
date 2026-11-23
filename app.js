/* Lingua: personal Spanish/German tutor. Plain JavaScript, no build step. */
'use strict';
{
// ---------- storage ----------
const load = (k, d) => { try { const v = localStorage.getItem('lingua.' + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem('lingua.' + k, JSON.stringify(v)); } catch (e) { toast('Could not save: storage full?'); } };

const S = Object.assign({ apiKey: '', model: 'gemini-3.6-flash', modelCustom: '', lang: 'es',
  level: { es: 'A2', de: 'A2' }, voice: { es: '', de: '' }, rate: 0.9, retention: 0.9, newPerDay: 20 }, load('settings', {}));
let cards = load('cards', []);
const known = Object.assign({ es: [], de: [] }, load('known', {}));
let newLog = load('newlog', {});           // { 'es:2026-11-23': 5 }
const lastResult = {};                      // per language
const persist = () => { save('settings', S); save('cards', cards); save('known', known); save('newlog', newLog); updateBadge(); };

const LANGS = {
  es: { name: 'Spanish', bcp: 'es-ES', yg: 'spanish', art: 'el/la' },
  de: { name: 'German', bcp: 'de-DE', yg: 'german', art: 'der/die/das' }
};
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const L = () => LANGS[S.lang];
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
const cardId = (lang, type, text) => lang + ':' + type + ':' + String(text).toLowerCase().trim();
const isKnown = (lemma) => known[S.lang].includes(String(lemma).toLowerCase().trim());
const youglish = w => `https://youglish.com/pronounce/${encodeURIComponent(w)}/${L().yg}`;
const forvo = w => `https://forvo.com/word/${encodeURIComponent(w)}/#${S.lang}`;
const ytSearch = q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

// ---------- Gemini ----------
// If the chosen model is busy or out of free quota, try the others in turn.
const FALLBACKS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash'];
async function gemini(parts, onStatus) {
  if (!S.apiKey) throw new Error('Add your free Gemini API key in Settings first.');
  const first = S.model === 'custom' ? S.modelCustom.trim() : S.model;
  const models = [first, ...FALLBACKS.filter(m => m !== first)];
  let lastErr;
  for (const m of models) {
    try { return await callModel(m, parts); }
    catch (e) {
      lastErr = e;
      if (![429, 500, 503].includes(e.status)) throw e;   // only retry when busy / quota
      if (onStatus) onStatus(`${m} is busy, trying another model…`);
    }
  }
  throw new Error('All models are busy right now. Please try again in a few minutes. (' + lastErr.message + ')');
}
async function callModel(model, parts) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': S.apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } })
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error.message; } catch {}
    if (res.status === 404) msg = 'Model not found. Pick another model in Settings. ' + msg;
    const err = new Error(msg); err.status = res.status;
    if (/high demand|overloaded/i.test(msg)) err.status = 503;
    throw err;
  }
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  if (!text) throw new Error('Empty answer' + (j.promptFeedback?.blockReason ? ': ' + j.promptFeedback.blockReason : ''));
  return JSON.parse(text.replace(/^\s*```(?:json)?/, '').replace(/```\s*$/, ''));
}

function normalizeYouTube(u) {
  u = u.trim(); if (!u) return '';
  const m = u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/);
  return m ? 'https://www.youtube.com/watch?v=' + m[1] : null;
}

// ---------- speech (text-to-speech) ----------
let voices = [];
function loadVoices() {
  voices = (speechSynthesis.getVoices() || []);
  const sel = $('#voice'); if (!sel) return;
  const mine = voices.filter(v => v.lang.toLowerCase().startsWith(S.lang));
  mine.sort((a, b) => score(b) - score(a));
  function score(v) { return (/premium/i.test(v.name) ? 4 : /enhanced|erweitert|mejorad/i.test(v.name) ? 3 : 0) + (v.lang.replace('_', '-') === L().bcp ? 1 : 0); }
  sel.innerHTML = mine.length ? mine.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join('')
    : '<option value="">No ' + L().name + ' voice found</option>';
  if (S.voice[S.lang] && mine.some(v => v.voiceURI === S.voice[S.lang])) sel.value = S.voice[S.lang];
  else if (mine[0]) S.voice[S.lang] = mine[0].voiceURI;
}
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function speak(text, rate = S.rate) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = L().bcp; u.rate = rate;
  const v = voices.find(v => v.voiceURI === S.voice[S.lang]); if (v) u.voice = v;
  speechSynthesis.speak(u);
}

// ---------- LEARN: analyse ----------
function analysisPrompt(sourceDesc) {
  const kn = known[S.lang].slice(-400).join(', ');
  return `You are an expert ${L().name} teacher. The learner's native language is Hungarian but all explanations must be in clear English. Learner level: ${S.level[S.lang]} (CEFR).
Analyse ${sourceDesc}. Extract what is most useful for this learner: words at or slightly above their level, plus every idiomatic expression and notable grammar.
Skip these already-known words: ${kn || '(none yet)'}.
Return ONLY JSON with this shape:
{"title": string, "summary_en": string (2-3 sentences), "level_estimate": "A1".."C2",
 "vocabulary": [{"lemma": dictionary form, "article": ${S.lang === 'de' ? '"der"|"die"|"das" for nouns else ""' : '"el"|"la" for nouns else ""'}, "pos": "noun|verb|adj|adv|other", "meaning_en": short, "example": the exact sentence from the source using it, "example_en": translation, "cefr": "A1".."C2", "note": plural / irregular forms / false friend warning or ""}],
 "idioms": [{"expression": string, "meaning_en": string, "literal_en": word-for-word translation, "example": from the source, "example_en": string, "register": "neutral|colloquial|slang|formal"}],
 "grammar": [{"point": short name, "explanation_en": 2-3 sentences, "example": from the source, "example_en": string}]}
Up to 40 vocabulary items ordered by usefulness, all idioms you find, up to 6 grammar points. Quote examples exactly as written/spoken.`;
}

$('#analyze').onclick = async () => {
  const urlRaw = $('#yt').value, text = $('#txt').value.trim();
  const url = normalizeYouTube(urlRaw);
  const out = $('#results'), st = $('#analyzeStatus');
  if (url === null) { out.innerHTML = '<div class="err">That does not look like a YouTube link.</div>'; return; }
  if (!url && !text) { toast('Paste a YouTube link or some text'); return; }
  const btn = $('#analyze'); btn.disabled = true;
  st.innerHTML = '<span class="spinner"></span> ' + (url ? 'Watching the video… (can take ~30–60 s)' : 'Reading…');
  out.innerHTML = '';
  try {
    const parts = url
      ? [{ fileData: { fileUri: url } }, { text: analysisPrompt('this YouTube video (use what is spoken)') }]
      : [{ text: analysisPrompt('the following text') + '\n\nTEXT:\n' + text.slice(0, 60000) }];
    const r = await gemini(parts, msg => { st.innerHTML = '<span class="spinner"></span> ' + esc(msg); });
    r.source = url || 'text';
    lastResult[S.lang] = r;
    renderResults();
    st.textContent = '';
  } catch (e) {
    st.textContent = '';
    out.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  } finally { btn.disabled = false; }
};

function renderResults() {
  const r = lastResult[S.lang], out = $('#results');
  if (!r) { out.innerHTML = ''; return; }
  const vocab = (r.vocabulary || []).filter(v => !isKnown(v.lemma));
  const inDeck = id => cards.some(c => c.id === id);
  const vItem = (v, i) => {
    const id = cardId(S.lang, 'word', v.lemma);
    return `<div class="item"><div>
      <div class="w"><span class="art">${esc(v.article)}</span>${esc(v.lemma)}<span class="tag">${esc(v.cefr || '')}</span></div>
      <div>${esc(v.meaning_en)} <span class="muted small">· ${esc(v.pos)}</span></div>
      ${v.note ? `<div class="muted small">${esc(v.note)}</div>` : ''}
      <div class="ex">${esc(v.example)}</div><div class="muted small">${esc(v.example_en)}</div>
      <div class="links"><a href="${youglish(v.lemma)}" target="_blank" rel="noopener">YouGlish</a><a href="${forvo(v.lemma)}" target="_blank" rel="noopener">Forvo</a></div>
    </div><div class="acts">
      <button class="ic" data-say="${esc(((v.article ? v.article + ' ' : '') + v.lemma))}" aria-label="Listen">🔊</button>
      <button class="ic ${inDeck(id) ? 'added' : ''}" data-add="v${i}" aria-label="Add to deck">${inDeck(id) ? '✓' : '＋'}</button>
      <button class="ic" data-known="${esc(v.lemma)}" aria-label="I know this">Known</button>
    </div></div>`;
  };
  const iItem = (v, i) => {
    const id = cardId(S.lang, 'idiom', v.expression);
    return `<div class="item"><div>
      <div class="w">${esc(v.expression)}<span class="tag">${esc(v.register || '')}</span></div>
      <div>${esc(v.meaning_en)}</div><div class="muted small">Literally: ${esc(v.literal_en)}</div>
      <div class="ex">${esc(v.example)}</div><div class="muted small">${esc(v.example_en)}</div>
    </div><div class="acts">
      <button class="ic" data-say="${esc(v.expression)}" aria-label="Listen">🔊</button>
      <button class="ic ${inDeck(id) ? 'added' : ''}" data-add="i${i}" aria-label="Add to deck">${inDeck(id) ? '✓' : '＋'}</button>
    </div></div>`;
  };
  out.innerHTML = `
    <div class="card"><h3 style="margin-top:0">${esc(r.title || 'Results')} <span class="tag">${esc(r.level_estimate || '')}</span></h3>
      <p>${esc(r.summary_en)}</p>
      ${r.source !== 'text' ? `<a class="small" href="${esc(r.source)}" target="_blank" rel="noopener">Open video ↗</a>` : ''}
    </div>
    <div class="row"><h3 class="grow">Vocabulary (${vocab.length})</h3><button class="btn ghost" id="addAll">＋ Add all</button></div>
    <div class="card">${vocab.length ? (r.vocabulary || []).map((v, i) => isKnown(v.lemma) ? '' : vItem(v, i)).join('') : '<p class="muted">Nothing new. Nice!</p>'}</div>
    <h3>Idioms &amp; expressions (${(r.idioms || []).length})</h3>
    <div class="card">${(r.idioms || []).map(iItem).join('') || '<p class="muted">None found.</p>'}</div>
    <h3>Grammar</h3>
    ${(r.grammar || []).map(g => `<div class="card"><b>${esc(g.point)}</b><p>${esc(g.explanation_en)}</p>
      <div class="row"><div class="grow"><div class="ex"><i>${esc(g.example)}</i></div><div class="muted small">${esc(g.example_en)}</div></div>
      <button class="ic" data-say="${esc(g.example)}">🔊</button></div></div>`).join('')}`;
  const addAll = $('#addAll'); if (addAll) addAll.onclick = () => {
    let n = 0; (r.vocabulary || []).forEach(v => { if (!isKnown(v.lemma) && addWord(v)) n++; });
    (r.idioms || []).forEach(v => { if (addIdiom(v)) n++; });
    persist(); renderResults(); toast(n + ' cards added');
  };
}

function addWord(v) {
  const id = cardId(S.lang, 'word', v.lemma);
  if (cards.some(c => c.id === id)) return false;
  cards.push({ id, lang: S.lang, type: 'word', front: v.lemma, article: v.article || '', back: v.meaning_en,
    example: v.example, exampleEn: v.example_en, note: v.note || '', pos: v.pos || '', due: 0, reps: 0, added: Date.now() });
  return true;
}
function addIdiom(v) {
  const id = cardId(S.lang, 'idiom', v.expression);
  if (cards.some(c => c.id === id)) return false;
  cards.push({ id, lang: S.lang, type: 'idiom', front: v.expression, article: '', back: v.meaning_en,
    example: v.example, exampleEn: v.example_en, note: 'Literally: ' + (v.literal_en || ''), due: 0, reps: 0, added: Date.now() });
  return true;
}

document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.say) speak(b.dataset.say);
  if (b.dataset.add) {
    const r = lastResult[S.lang]; const k = b.dataset.add;
    const ok = k[0] === 'v' ? addWord(r.vocabulary[+k.slice(1)]) : addIdiom(r.idioms[+k.slice(1)]);
    if (ok) { b.classList.add('added'); b.textContent = '✓'; persist(); toast('Added'); }
  }
  if (b.dataset.known) {
    const w = b.dataset.known.toLowerCase().trim();
    if (!known[S.lang].includes(w)) known[S.lang].push(w);
    persist(); renderResults(); toast('Marked as known, it will be skipped from now on');
  }
});

// ---------- LEARN: find content ----------
$('#findBtn').onclick = async () => {
  const topic = $('#topic').value.trim() || 'everyday life';
  const out = $('#findOut'); out.innerHTML = '<p><span class="spinner"></span> Thinking…</p>';
  try {
    const r = await gemini([{ text: `Suggest YouTube content for a ${S.level[S.lang]} learner of ${L().name} interested in "${topic}". Explanations in English.
Return ONLY JSON: {"queries":[{"query": a YouTube search query written in ${L().name}, "why": short}], "channels":[{"name": a real, well-known ${L().name}-language or learner YouTube channel, "why": short}]}. 5 queries, 4 channels. Prefer comprehensible input, native speakers and subtitled content.` }]);
    out.innerHTML = `<h3>Searches</h3>${(r.queries || []).map(q => `<div class="item"><div><a href="${ytSearch(q.query)}" target="_blank" rel="noopener"><b>${esc(q.query)}</b></a><div class="muted small">${esc(q.why)}</div></div></div>`).join('')}
      <h3>Channels</h3>${(r.channels || []).map(c => `<div class="item"><div><a href="${ytSearch(c.name)}" target="_blank" rel="noopener"><b>${esc(c.name)}</b></a><div class="muted small">${esc(c.why)}</div></div></div>`).join('')}
      <p class="muted small">Found a good video? Share → Copy link, then paste it above and tap Analyse.</p>`;
  } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};

// ---------- REVIEW ----------
let current = null, revealed = false;
function queue() {
  const now = Date.now(), mine = cards.filter(c => c.lang === S.lang && !c.suspended);
  const due = mine.filter(c => c.reps && c.due <= now).sort((a, b) => a.due - b.due);
  const newDone = newLog[S.lang + ':' + today()] || 0;
  const fresh = mine.filter(c => !c.reps).sort((a, b) => a.added - b.added).slice(0, Math.max(0, S.newPerDay - newDone));
  return { due, fresh, mine };
}
function updateBadge() {
  const { due, fresh } = queue(); const n = due.length + fresh.length, b = $('#dueBadge');
  b.hidden = !n; b.textContent = n;
}
function renderReview() {
  const { due, fresh, mine } = queue();
  $('#stDue').textContent = due.length; $('#stNew').textContent = fresh.length; $('#stAll').textContent = mine.length;
  current = due[0] || fresh[0] || null; revealed = false;
  const box = $('#reviewBox');
  if (!current) {
    const nextDue = mine.filter(c => c.reps).sort((a, b) => a.due - b.due)[0];
    box.innerHTML = `<div class="card flash"><div class="front">🎉</div><p>All done for now.</p>
      ${nextDue ? `<p class="muted small">Next review: ${new Date(nextDue.due).toLocaleString()}</p>` : '<p class="muted small">Add words from the Learn tab to start.</p>'}</div>`;
    return;
  }
  const c = current;
  box.innerHTML = `<div class="card flash" id="flash">
      <div class="muted small">${c.type === 'idiom' ? 'Idiom' : esc(c.pos)} ${c.reps ? '' : '· new'}</div>
      <div class="front">${c.article ? `<span class="art" style="color:var(--accent)">${esc(c.article)} </span>` : ''}${esc(c.front)}</div>
      <div class="back" id="back" hidden>
        <div><b>${esc(c.back)}</b></div>
        ${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ''}
        <p class="ex"><i>${esc(c.example)}</i> <button class="ic" data-say="${esc(c.example)}">🔊</button></p>
        <div class="muted small">${esc(c.exampleEn)}</div>
        <div class="links" style="margin-top:8px"><a href="${youglish(c.front)}" target="_blank" rel="noopener">YouGlish</a><a href="${forvo(c.front)}" target="_blank" rel="noopener">Forvo</a></div>
      </div>
    </div>
    <div id="revCtl"><button class="btn" style="width:100%" id="showBtn">Show answer</button></div>`;
  $('#showBtn').onclick = reveal;
}
function reveal() {
  if (!current || revealed) return; revealed = true;
  $('#back').hidden = false;
  speak((current.article ? current.article + ' ' : '') + current.front);
  const lab = g => FSRS.label(current, g, S.retention);
  $('#revCtl').innerHTML = `<div class="grades">
    <button class="g1" data-g="1">Again<small>${lab(1)}</small></button>
    <button class="g2" data-g="2">Hard<small>${lab(2)}</small></button>
    <button class="g3" data-g="3">Good<small>${lab(3)}</small></button>
    <button class="g4" data-g="4">Easy<small>${lab(4)}</small></button></div>`;
  $('#revCtl').querySelectorAll('[data-g]').forEach(b => b.onclick = () => grade(+b.dataset.g));
}
function grade(g) {
  const wasNew = !current.reps;
  const i = cards.findIndex(c => c.id === current.id);
  cards[i] = FSRS.next(current, g, S.retention);
  if (wasNew) { const k = S.lang + ':' + today(); newLog[k] = (newLog[k] || 0) + 1; }
  persist(); renderReview();
}
document.addEventListener('keydown', e => {
  if (!$('#v-review').classList.contains('on') || e.target.matches('input,textarea')) return;
  if (e.key === ' ' && !revealed) { e.preventDefault(); reveal(); }
  else if (revealed && '1234'.includes(e.key)) grade(+e.key);
});

// ---------- SPEAK ----------
const sayText = $('#sayText');
function setSayLinks() { $('#sayYouglish').href = youglish(sayText.value.trim().split(/\s+/).slice(0, 4).join(' ') || 'hola'); }
sayText.oninput = setSayLinks;
$('#sayRandom').onclick = () => {
  const pool = cards.filter(c => c.lang === S.lang && c.example);
  if (!pool.length) return toast('Add some words first');
  sayText.value = pool[Math.floor(Math.random() * pool.length)].example; setSayLinks();
};
$('#sayListen').onclick = () => speak(sayText.value);
$('#saySlow').onclick = () => speak(sayText.value, 0.6);

let rec = null, chunks = [], stream = null;
$('#recBtn').onclick = async () => {
  const btn = $('#recBtn'), st = $('#recStatus');
  if (rec && rec.state === 'recording') { rec.stop(); return; }
  if (!sayText.value.trim()) return toast('Type or pick a sentence first');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch { st.textContent = 'Microphone access was blocked. Allow it in Settings → Safari → Microphone.'; return; }
  chunks = [];
  rec = new MediaRecorder(stream);
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    btn.classList.remove('on'); btn.textContent = '● Record';
    st.innerHTML = '<span class="spinner"></span> Listening to you…';
    try {
      const wav = await toWavBase64(new Blob(chunks, { type: rec.mimeType }));
      const target = sayText.value.trim();
      const r = await gemini([{ inlineData: { mimeType: 'audio/wav', data: wav } }, { text:
        `You are a strict but kind ${L().name} pronunciation coach (standard ${S.lang === 'es' ? 'Castilian or Latin American' : 'Hochdeutsch'} pronunciation). The learner (native Hungarian) tried to say: "${target}".
Listen to the audio. Return ONLY JSON: {"heard": what you actually heard, "score": 0-100 overall native-likeness, "words":[{"word": each word of the target sentence in order, "ok": true|false, "tip": if not ok, a short English tip on the sound, e.g. tongue position, vowel length, stress}], "overall_en": 2-3 sentences of the most important advice, mentioning typical Hungarian-speaker issues if relevant}` }]);
      $('#speakOut').innerHTML = `<div style="text-align:center"><div class="score">${esc(r.score)}</div><div class="muted small">native-likeness</div></div>
        <p style="font-size:20px">${(r.words || []).map(w => `<span class="${w.ok ? 'wok' : 'wbad'}">${esc(w.word)}</span>`).join(' ')}</p>
        <p class="muted small">Heard: “${esc(r.heard)}”</p>
        ${(r.words || []).filter(w => !w.ok && w.tip).map(w => `<p><b>${esc(w.word)}</b>: ${esc(w.tip)}</p>`).join('')}
        <p>${esc(r.overall_en)}</p>`;
      st.textContent = 'Tap to try again.';
    } catch (e) { st.textContent = ''; $('#speakOut').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  rec.start(); btn.classList.add('on'); btn.textContent = '■ Stop';
  st.textContent = 'Recording… speak now.'; $('#speakOut').innerHTML = '';
};

async function toWavBase64(blob) {
  const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
  const ab = await blob.arrayBuffer();
  const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
  try { ctx.close(); } catch {}
  const rate = 16000, src = buf.getChannelData(0), ratio = buf.sampleRate / rate, n = Math.floor(src.length / ratio);
  const dv = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o, s) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, src[Math.floor(i * ratio)])); dv.setInt16(44 + i * 2, s * 0x7fff, true); }
  const bytes = new Uint8Array(dv.buffer); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------- DECK ----------
let deckFilter = 'all';
$('#deckFilter').onclick = e => { const b = e.target.closest('button'); if (!b) return; deckFilter = b.dataset.f;
  $('#deckFilter').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderDeck(); };
$('#deckSearch').oninput = () => renderDeck();
function renderDeck() {
  const q = $('#deckSearch').value.toLowerCase().trim(), box = $('#deckList');
  if (deckFilter === 'known') {
    const list = known[S.lang].filter(w => w.includes(q));
    box.innerHTML = list.map(w => `<div class="item"><div class="w">${esc(w)}</div><div class="acts"><button class="ic" data-unknown="${esc(w)}">Unmark</button></div></div>`).join('') || '<p class="muted">No known words yet.</p>';
    return;
  }
  const list = cards.filter(c => c.lang === S.lang && (deckFilter === 'all' || c.type === deckFilter) &&
    (!q || (c.front + ' ' + c.back).toLowerCase().includes(q))).sort((a, b) => b.added - a.added);
  box.innerHTML = list.map(c => `<div class="item"><div>
      <div class="w"><span class="art">${esc(c.article)}</span>${esc(c.front)}</div><div>${esc(c.back)}</div>
      <div class="muted small">${c.reps ? 'Next: ' + new Date(c.due).toLocaleDateString() + ' · reviewed ' + c.reps + '×' : 'New'}</div>
    </div><div class="acts"><button class="ic" data-say="${esc((c.article ? c.article + ' ' : '') + c.front)}">🔊</button>
      <button class="ic" data-del="${esc(c.id)}" aria-label="Delete">🗑</button></div></div>`).join('') || '<p class="muted">No cards yet.</p>';
}
$('#deckList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.del) {
    if (b.dataset.armed) { cards = cards.filter(c => c.id !== b.dataset.del); persist(); renderDeck(); toast('Deleted'); }
    else { b.dataset.armed = 1; b.textContent = 'Sure?'; }
  }
  if (b.dataset.unknown) { known[S.lang] = known[S.lang].filter(w => w !== b.dataset.unknown); persist(); renderDeck(); }
});

// ---------- SETTINGS ----------
function initSettings() {
  $('#apiKey').value = S.apiKey;
  $('#apiKey').onchange = e => { S.apiKey = e.target.value.trim(); persist(); toast('Key saved'); };
  const opts = [...$('#model').options].map(o => o.value);
  $('#model').value = opts.includes(S.model) ? S.model : 'custom';
  $('#modelCustom').value = S.modelCustom; $('#modelCustom').style.display = $('#model').value === 'custom' ? 'block' : 'none';
  $('#model').onchange = e => { S.model = e.target.value; $('#modelCustom').style.display = S.model === 'custom' ? 'block' : 'none'; persist(); };
  $('#modelCustom').onchange = e => { S.modelCustom = e.target.value; persist(); };
  ['es', 'de'].forEach(l => {
    const seg = $('#lvl-' + l);
    seg.innerHTML = LEVELS.map(x => `<button data-lv="${x}" class="${S.level[l] === x ? 'on' : ''}">${x}</button>`).join('');
    seg.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.level[l] = b.dataset.lv; persist();
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  });
  $('#voice').onchange = e => { S.voice[S.lang] = e.target.value; persist(); speak(S.lang === 'es' ? '¡Hola! ¿Qué tal?' : 'Hallo! Wie geht es dir?'); };
  const rate = $('#rate'), ret = $('#retention');
  rate.value = S.rate; $('#rateVal').textContent = S.rate + '×';
  rate.oninput = () => { S.rate = +rate.value; $('#rateVal').textContent = S.rate + '×'; }; rate.onchange = persist;
  ret.value = S.retention; $('#retVal').textContent = Math.round(S.retention * 100) + '%';
  ret.oninput = () => { S.retention = +ret.value; $('#retVal').textContent = Math.round(S.retention * 100) + '%'; }; ret.onchange = persist;
}
async function saveFile(name, text, mime) {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
$('#exportJson').onclick = () => saveFile(`lingua-backup-${today()}.json`, JSON.stringify({ v: 1, settings: { ...S, apiKey: '' }, cards, known }), 'application/json');
$('#exportAnki').onclick = () => {
  const clean = s => String(s || '').replace(/[\t\n\r]/g, ' ');
  const rows = cards.filter(c => c.lang === S.lang).map(c => [
    clean((c.article ? c.article + ' ' : '') + c.front),
    clean(c.back) + '<br><i>' + clean(c.example) + '</i><br>' + clean(c.exampleEn) + (c.note ? '<br><small>' + clean(c.note) + '</small>' : ''),
    'lingua ' + S.lang + ' ' + c.type].join('\t'));
  saveFile(`lingua-${S.lang}-anki.txt`, '#separator:tab\n#html:true\n#tags column:3\n' + rows.join('\n'), 'text/plain');
};
$('#importJson').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); let n = 0;
    (d.cards || []).forEach(c => { const i = cards.findIndex(x => x.id === c.id); if (i < 0) { cards.push(c); n++; } else if ((c.last || 0) > (cards[i].last || 0)) cards[i] = c; });
    ['es', 'de'].forEach(l => (d.known?.[l] || []).forEach(w => known[l].includes(w) || known[l].push(w)));
    persist(); toast(`Restored. ${n} new cards`); renderDeck();
  } catch { toast('That file could not be read'); }
  e.target.value = '';
};

// ---------- navigation & language ----------
function show(v) {
  document.querySelectorAll('section.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'review') renderReview();
  if (v === 'deck') renderDeck();
  window.scrollTo(0, 0);
}
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.v); };
function setLang(l) {
  S.lang = l; document.body.dataset.lang = l;
  $('#langswitch').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.l === l));
  loadVoices(); renderResults(); persist();
  const v = document.querySelector('#tabs button.on').dataset.v; if (v === 'review') renderReview(); if (v === 'deck') renderDeck();
}
$('#langswitch').onclick = e => { const b = e.target.closest('button'); if (b) setLang(b.dataset.l); };

initSettings(); setLang(S.lang); setSayLinks(); updateBadge();
if (!S.apiKey) show('settings');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
