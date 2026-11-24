/* Lingua: personal language tutor. Plain JavaScript, no build step.
   Sections: storage · languages · helpers · Gemini · voices · learn (video/article/text) · reader ·
   cards · find · review · speak · words · settings · navigation */
'use strict';
{
// ---------- storage ----------
const load = (k, d) => { try { const v = localStorage.getItem('lingua.' + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem('lingua.' + k, JSON.stringify(v)); return true; } catch { return false; } };

const S = Object.assign({ apiKey: '', model: 'gemini-3.6-flash', modelCustom: '', lang: 'es', langs: ['es', 'de'],
  level: {}, voice: {}, gvoice: {}, tts: 'device', clip: 600, rate: 0.9, retention: 0.9, newPerDay: 20, dayStart: 4 }, load('settings', {}));
let cards = load('cards', []);
const known = load('known', {});
let newLog = load('newlog', {});
let sources = load('sources', []);          // recent videos / articles / texts
const persist = () => {
  save('settings', S); save('cards', cards); save('known', known); save('newlog', newLog);
  while (!save('sources', sources) && sources.length) sources.pop();   // storage full: drop oldest
  updateBadge();
};

// ---------- languages ----------
// acc = [light-mode green, dark-mode green] from the Lingua palette
const CATALOG = {
  es: { name: 'Spanish', bcp: 'es-ES', yg: 'spanish', arts: '"el" or "la"', std: 'standard Castilian or neutral Latin American Spanish', acc: ['#33574f', '#6f9586'], test: '¡Hola! ¿Qué tal?' },
  de: { name: 'German', bcp: 'de-DE', yg: 'german', arts: '"der", "die" or "das"', std: 'Standard German (Hochdeutsch)', acc: ['#465030', '#8e9a62'], test: 'Hallo! Wie geht es dir?' },
  no: { name: 'Norwegian', bcp: 'nb-NO', yg: '', arts: '"en", "ei" or "et"', std: 'Standard Eastern Norwegian (Bokmål), including correct pitch accent (tonelag 1 and 2)', acc: ['#2f4a44', '#7fa39a'], test: 'Hei! Hvordan har du det?',
        extra: 'Use Bokmål spelling. Point out when something is dialect or Nynorsk.' },
  it: { name: 'Italian', bcp: 'it-IT', yg: 'italian', arts: '"il", "lo", "la", "l\'", "i", "gli" or "le"', std: 'standard Italian', acc: ['#53766a', '#8db3a5'], test: 'Ciao! Come stai?' },
  fr: { name: 'French', bcp: 'fr-FR', yg: 'french', arts: '"le", "la" or "l\'"', std: 'standard Metropolitan French', acc: ['#5c6252', '#a3aa96'], test: 'Salut ! Comment ça va ?' },
  pt: { name: 'Portuguese', bcp: 'pt-BR', yg: 'portuguese', arts: '"o" or "a"', std: 'Brazilian or European Portuguese', acc: ['#435230', '#8c9c6e'], test: 'Olá! Tudo bem?' },
  nl: { name: 'Dutch', bcp: 'nl-NL', yg: 'dutch', arts: '"de" or "het"', std: 'standard Dutch', acc: ['#474b4a', '#9aa3a1'], test: 'Hallo! Hoe gaat het?' },
  sv: { name: 'Swedish', bcp: 'sv-SE', yg: 'swedish', arts: '"en" or "ett"', std: 'standard Swedish, including pitch accent', acc: ['#4a5146', '#9aa58f'], test: 'Hej! Hur mår du?' },
  pl: { name: 'Polish', bcp: 'pl-PL', yg: 'polish', arts: 'nothing (Polish has no articles; put the gender in note)', std: 'standard Polish', acc: ['#645f45', '#b0a77c'], test: 'Cześć! Jak się masz?' }
};
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const L = () => CATALOG[S.lang];
const lvl = (l = S.lang) => S.level[l] || 'A2';
const K = (l = S.lang) => (known[l] = known[l] || []);

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400000, MIN = 60000;
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), Math.max(2200, msg.length * 70)); }
const norm = s => String(s || '').toLowerCase().trim();
const cardId = (lang, type, text) => lang + ':' + type + ':' + norm(text).slice(0, 140);
const isKnown = w => K().includes(norm(w));
const inDeck = id => cards.some(c => c.id === id);
const youglish = w => L().yg ? `https://youglish.com/pronounce/${encodeURIComponent(w)}/${L().yg}` : '';
const forvo = w => `https://forvo.com/word/${encodeURIComponent(w)}/#${L().bcp.slice(0, 2)}`;
const ytSearch = q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const ytAt = (url, t) => url && t != null && /youtube\.com\/watch/.test(url) ? url + '&t=' + Math.max(0, Math.floor(t) - 2) + 's' : '';
const fmtTime = t => { t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const safeUrl = u => /^https:\/\//.test(u || '') ? u : '';
function dayStartTs(now = Date.now()) { const d = new Date(now); d.setHours(S.dayStart, 0, 0, 0); if (now < d.getTime()) d.setDate(d.getDate() - 1); return d.getTime(); }
function dayKey(now = Date.now()) { const d = new Date(dayStartTs(now)); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function parseJSON(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? text.slice(a, b + 1) : text);
}

// ---------- Gemini ----------
const FALLBACKS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash'];
async function gemini(parts, onStatus, extra, opts) {
  if (!S.apiKey) throw new Error('Add your free Gemini API key in Settings first.');
  const first = S.model === 'custom' ? S.modelCustom.trim() : S.model;
  const models = [first, ...FALLBACKS.filter(m => m !== first)];
  let lastErr;
  for (const m of models) {
    try { return await callModel(m, parts, extra, opts); }
    catch (e) {
      lastErr = e;
      if (![429, 500, 503].includes(e.status)) throw e;
      if (onStatus) onStatus(`${m} is busy, trying another model…`);
    }
  }
  throw new Error('All models are busy right now. Please try again in a few minutes. (' + lastErr.message + ')');
}
async function callModel(model, parts, extra = {}, opts = {}) {
  const json = opts.json !== false;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 180000);
  const body = { contents: [{ role: 'user', parts }],
    generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.4, ...extra } : { temperature: 0.2, ...extra } };
  if (opts.tools) body.tools = opts.tools;
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': S.apiKey }, body: JSON.stringify(body) });
  } catch (e) {
    const err = new Error(e.name === 'AbortError' ? 'Gemini took longer than 3 minutes. Try a shorter video part (Settings → Video length) or a shorter text.'
      : 'Connection lost (' + e.message + '). Keep Lingua open on screen while it works, then try again.');
    err.status = 0; throw err;
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error.message; } catch {}
    if (res.status === 404) msg = 'Model not found. Pick another model in Settings. ' + msg;
    const err = new Error(msg); err.status = res.status;
    if (/high demand|overloaded/i.test(msg)) err.status = 503;
    throw err;
  }
  const j = await res.json();
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  if (!text) {
    if (cand?.finishReason === 'RECITATION') throw new Error('Google would not copy this page word for word. Open the article in Safari → aA → Show Reader → select all → copy, then paste it into the text box.');
    throw new Error('Empty answer' + (j.promptFeedback?.blockReason ? ': ' + j.promptFeedback.blockReason : cand?.finishReason ? ' (' + cand.finishReason + ')' : ''));
  }
  return json ? parseJSON(text) : text;
}

// ---------- voices ----------
let voices = [];
function myVoices() {
  const pre = [L().bcp.slice(0, 2), S.lang];
  return (speechSynthesis.getVoices() || []).filter(v => pre.some(p => v.lang.toLowerCase().startsWith(p)));
}
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = myVoices();
  const score = v => (/premium/i.test(v.name) ? 4 : /enhanced|erweitert|mejorad/i.test(v.name) ? 3 : 0) + (v.lang.replace('_', '-') === L().bcp ? 1 : 0);
  voices.sort((a, b) => score(b) - score(a));
  const sel = $('#voice');
  sel.innerHTML = voices.length ? voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join('')
    : `<option value="">No ${L().name} voice on this iPad</option>`;
  if (S.voice[S.lang] && voices.some(v => v.voiceURI === S.voice[S.lang])) sel.value = S.voice[S.lang];
  else if (voices[0]) S.voice[S.lang] = voices[0].voiceURI;
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = loadVoices;

function speak(text, slow = false) {
  if (!text) return;
  if (S.tts === 'gemini' && S.apiKey) {
    geminiSpeak(text, slow).catch(e => {
      S.tts = 'device'; persist(); $('#engine').value = 'device'; showEngine();
      toast('AI voice failed: ' + (e.message || e) + '. Switched to iPad voice, tap again.');
    });
    return;
  }
  deviceSpeak(text, slow ? 0.6 : S.rate);
}
function deviceSpeak(text, rate = S.rate) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = L().bcp; u.rate = rate;
  const v = voices.find(v => v.voiceURI === S.voice[S.lang]); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
const TTS_MODELS = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
const ttsCache = new Map();
let actx = null, currentSrc = null;
async function geminiSpeak(text, slow) {
  const AC = window.AudioContext || window.webkitAudioContext;
  actx = actx || new AC();
  actx.resume();                                  // must happen inside the tap, before any await
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (currentSrc) { try { currentSrc.stop(); } catch {} }
  const voice = S.gvoice[S.lang] || 'Charon', key = voice + '|' + (slow ? 1 : 0) + '|' + text;
  let buf = ttsCache.get(key);
  if (!buf) {
    let lastErr, got;
    for (const m of TTS_MODELS) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': S.apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: (slow ? `Say slowly and clearly, in ${L().name}: ` : `Say in ${L().name}: `) + text }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }) });
        if (!res.ok) { let m2 = res.status; try { m2 = (await res.json()).error.message; } catch {} throw new Error(m2); }
        const j = await res.json(), part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
        if (!part) throw new Error('no audio returned');
        got = part.inlineData; break;
      } catch (e) { lastErr = e; }
    }
    if (!got) throw lastErr;
    const bin = atob(got.data), n = Math.floor(bin.length / 2), rate = +((got.mimeType || '').match(/rate=(\d+)/)?.[1] || 24000);
    buf = actx.createBuffer(1, n, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; ch[i] = v / 32768; }
    ttsCache.set(key, buf); if (ttsCache.size > 300) ttsCache.delete(ttsCache.keys().next().value);
  }
  const src = actx.createBufferSource(); src.buffer = buf; src.connect(actx.destination); src.start(); currentSrc = src;
}

// ---------- LEARN ----------
let current = null;      // the source on screen: {id, lang, kind, title, url, text, result, song, date}

function normalizeYouTube(u) {
  const m = String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? 'https://www.youtube.com/watch?v=' + m[1] : '';
}
const TS_LINE = /^[ \t]*(?:\d{1,2}:)?\d{1,2}:\d{2}[ \t]*$/gm;
const hasTimestamps = t => (t.match(TS_LINE) || []).length >= 3 || (t.match(/^[ \t]*(?:\d{1,2}:)?\d{1,2}:\d{2}[ \t]+\S/gm) || []).length >= 3;
const stripTimestamps = t => t.replace(/^[ \t]*(?:\d{1,2}:)?\d{1,2}:\d{2}[ \t]*/gm, '').replace(/\n{2,}/g, '\n');

function analysisPrompt(kind, song) {
  const c = L(), kn = K().slice(-400).join(', ');
  const fromText = kind !== 'video';
  return `You are an expert ${c.name} teacher. The learner's native language is Hungarian, but write every explanation in clear English. Learner level: ${lvl()} (CEFR).
${c.extra || ''}
Analyse ${kind === 'video' ? 'this YouTube video (use what is spoken)' : 'the text below'}. Extract what is most useful for this learner: words at or slightly above their level, every idiomatic expression, and the notable grammar.
${song ? 'This is a SONG: explain slang, shortened or poetic forms (e.g. dropped letters, contractions) and their everyday equivalents, and mention regional flavour. Treat each line as a sentence.' : ''}
Skip these already-known words: ${kn || '(none yet)'}.
Return ONLY JSON:
{"title": string, "summary_en": 2-3 sentences, "level_estimate": "A1".."C2",
 "vocabulary": [{"lemma": dictionary form, ${fromText ? '"form": the word exactly as it appears in the text (same spelling and case), ' : ''}"article": ${c.arts} for nouns, otherwise "", "pos": "noun|verb|adj|adv|other", "meaning_en": short, "example": the exact sentence from the source using it, "example_en": translation, "cefr": "A1".."C2", "note": plural / irregular forms / false-friend warning or ""${kind === 'video' ? ', "time": second in the video where the example is spoken (integer)' : ''}}],
 "idioms": [{"expression": dictionary form, ${fromText ? '"form": exactly as it appears in the text, ' : ''}"meaning_en": string, "literal_en": word-for-word translation, "example": from the source, "example_en": string, "register": "neutral|colloquial|slang|formal"${kind === 'video' ? ', "time": integer seconds' : ''}}],
 "grammar": [{"point": short name, "explanation_en": 2-3 sentences, "example": ${fromText ? 'one sentence copied EXACTLY from the text' : 'from the source'}, "example_en": string}]}
Up to 40 vocabulary items ordered by usefulness, all idioms you find, up to 6 grammar points. Quote examples exactly.`;
}

$('#analyze').onclick = async () => {
  const urlRaw = $('#yt').value.trim(), text = $('#txt').value.trim(), song = $('#songMode').checked;
  const yt = normalizeYouTube(urlRaw), isArticle = !yt && /^https?:\/\//i.test(urlRaw);
  if (urlRaw && !yt && !isArticle) return toast('That link does not look right');
  if (!urlRaw && !text) return toast('Paste a link or some text');
  const out = $('#results'), st = $('#analyzeStatus'), btn = $('#analyze');
  const status = m => { st.innerHTML = '<span class="spinner"></span> ' + esc(m); };
  btn.disabled = true; out.innerHTML = '';
  try {
    let src;
    if (text) {                                        // pasted text (maybe a transcript of the linked video)
      status('Reading…');
      const ts = hasTimestamps(text);
      const r = await gemini([{ text: analysisPrompt('text', song) + '\n\nTEXT:\n' + (ts ? stripTimestamps(text) : text).slice(0, 30000) }], status);
      src = { kind: yt ? 'transcript' : 'text', url: yt || (isArticle ? urlRaw : ''), text: text.slice(0, 60000), result: r };
    } else if (yt) {                                   // video only
      status('Watching the video… keep Lingua open on screen (30–90 s)');
      const prompt = { text: analysisPrompt('video', song) };
      const clip = +S.clip ? { videoMetadata: { startOffset: '0s', endOffset: S.clip + 's' } } : {};
      let r;
      try { r = await gemini([{ fileData: { fileUri: yt }, ...clip }, prompt], status, { mediaResolution: 'MEDIA_RESOLUTION_LOW' }); }
      catch (e) { if (e.status !== 400) throw e; status('Retrying in compatibility mode…'); r = await gemini([{ fileData: { fileUri: yt } }, prompt], status); }
      src = { kind: 'video', url: yt, result: r };
    } else {                                           // article link
      status('Opening the article…');
      const page = await gemini([{ text: `Use the URL context tool to open ${urlRaw}. Return ONLY the main article text exactly as written, in its original language: no translation, summary or commentary. First line: the headline. Then the body paragraphs separated by blank lines. Leave out menus, ads, captions and comments. If the page cannot be opened, return exactly CANNOT_ACCESS.` }],
        status, {}, { json: false, tools: [{ url_context: {} }] });
      if (/CANNOT_ACCESS/.test(page) || page.trim().length < 150)
        throw new Error('This site could not be opened (paywall or blocked). Open it in Safari → aA → Show Reader → select all → copy, and paste it into the text box.');
      const body = page.trim();
      status('Reading…');
      const r = await gemini([{ text: analysisPrompt('text', song) + '\n\nTEXT:\n' + body.slice(0, 30000) }], status);
      if (!r.title) r.title = body.split('\n')[0].slice(0, 120);
      src = { kind: 'article', url: urlRaw, text: body.slice(0, 60000), result: r };
    }
    src.id = 's' + Date.now(); src.lang = S.lang; src.song = song; src.date = Date.now(); src.title = src.result.title || 'Untitled';
    sources.unshift(src); sources = sources.slice(0, 15);
    current = src; persist(); renderCurrent(); renderRecent();
    st.textContent = '';
    if (src.text) { $('#yt').value = ''; $('#txt').value = ''; }
  } catch (e) {
    st.textContent = ''; out.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  } finally { btn.disabled = false; }
};

function renderRecent() {
  const list = sources.filter(s => s.lang === S.lang), box = $('#recent');
  const kindName = { video: 'Video', article: 'Article', text: 'Text', transcript: 'Transcript' };
  box.innerHTML = list.length ? list.map(s => `<div class="item"><div>
      <a href="#" data-open="${s.id}"><b>${esc(s.title)}</b></a>
      <div class="muted small">${kindName[s.kind] || ''}${s.song ? ' · song' : ''} · ${new Date(s.date).toLocaleDateString()}</div></div>
      <div class="acts"><button class="ic" data-delsrc="${s.id}" aria-label="Remove">✕</button></div></div>`).join('')
    : '<p class="muted">Nothing yet. Analyse a video, article or text above.</p>';
}
$('#recent').addEventListener('click', e => {
  const a = e.target.closest('[data-open]'), d = e.target.closest('[data-delsrc]');
  if (a) { e.preventDefault(); current = sources.find(s => s.id === a.dataset.open); renderCurrent(); window.scrollTo(0, 0); }
  if (d) { sources = sources.filter(s => s.id !== d.dataset.delsrc); if (current && current.id === d.dataset.delsrc) { current = null; renderCurrent(); } persist(); renderRecent(); }
});

// ---------- results: reader (text) or list (video) ----------
let tokens = [], refs = [];     // reader tokens and what each word token points to
function renderCurrent() {
  const out = $('#results');
  if (!current || current.lang !== S.lang) { out.innerHTML = ''; return; }
  const r = current.result || {};
  const head = `<div class="card"><h3 style="margin-top:0">${esc(r.title || current.title)} <span class="tag">${esc(r.level_estimate || '')}</span></h3>
    <p>${esc(r.summary_en || '')}</p>${safeUrl(current.url) ? `<a class="small" href="${esc(current.url)}" target="_blank" rel="noopener">Open ${current.kind === 'article' ? 'article' : 'video'} ↗</a>` : ''}</div>`;
  if (current.text) {
    out.innerHTML = head + `<div class="card"><div class="legend"><span class="reader"><span class="t nw" style="font:inherit;font-size:13px;padding:0 4px">new word</span></span>
        <span style="background:var(--idiom)">idiom</span><span style="text-decoration:underline dotted var(--accent) 2px;text-underline-offset:4px">grammar</span>
        <span style="color:var(--deck);font-weight:600">in your deck</span><span class="muted">Tap a word, or select words or a sentence to add it</span></div>
      <div class="reader" id="reader">${buildReader(current)}</div></div>` + listsHtml(r, true);
  } else {
    out.innerHTML = head + listsHtml(r, false);
  }
  const addAll = $('#addAll');
  if (addAll) addAll.onclick = () => {
    let n = 0;
    (r.vocabulary || []).forEach(v => { if (!isKnown(v.lemma) && addFromItem('word', v)) n++; });
    (r.idioms || []).forEach(v => { if (addFromItem('idiom', v)) n++; });
    persist(); renderCurrent(); toast(n + ' cards added');
  };
}

function listsHtml(r, collapsed) {
  const vocab = (r.vocabulary || []).map((v, i) => [v, i]).filter(([v]) => !isKnown(v.lemma));
  const ctx = t => { const u = ytAt(current.url, t); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">▶ ${fmtTime(t)}</a>` : ''; };
  const vItem = ([v, i]) => {
    const id = cardId(S.lang, 'word', v.lemma), added = inDeck(id);
    return `<div class="item"><div>
      <div class="w"><span class="art">${esc(v.article)}</span>${esc(v.lemma)}<span class="tag">${esc(v.cefr || '')}</span></div>
      <div>${esc(v.meaning_en)} <span class="muted small">· ${esc(v.pos)}</span></div>
      ${v.note ? `<div class="muted small">${esc(v.note)}</div>` : ''}
      <div class="ex">${esc(v.example)}</div><div class="muted small">${esc(v.example_en)}</div>
      <div class="links">${youglish(v.lemma) ? `<a href="${youglish(v.lemma)}" target="_blank" rel="noopener">YouGlish</a>` : ''}<a href="${forvo(v.lemma)}" target="_blank" rel="noopener">Forvo</a>${ctx(v.time)}</div>
    </div><div class="acts">
      <button class="ic" data-say="${esc((v.article ? v.article + ' ' : '') + v.lemma)}" aria-label="Listen">🔊</button>
      <button class="ic ${added ? 'added' : ''}" data-add="v${i}" aria-label="Add">${added ? '✓' : '＋'}</button>
      <button class="ic" data-known="${esc(v.lemma)}">Known</button></div></div>`;
  };
  const iItem = (v, i) => {
    const added = inDeck(cardId(S.lang, 'idiom', v.expression));
    return `<div class="item"><div>
      <div class="w">${esc(v.expression)}<span class="tag">${esc(v.register || '')}</span></div>
      <div>${esc(v.meaning_en)}</div><div class="muted small">Literally: ${esc(v.literal_en)}</div>
      <div class="ex">${esc(v.example)}</div><div class="muted small">${esc(v.example_en)}</div>
      <div class="links">${ctx(v.time)}</div>
    </div><div class="acts"><button class="ic" data-say="${esc(v.expression)}">🔊</button>
      <button class="ic ${added ? 'added' : ''}" data-add="i${i}">${added ? '✓' : '＋'}</button></div></div>`;
  };
  const lists = `<div class="row"><h3 class="grow">Vocabulary (${vocab.length})</h3><button class="btn ghost" id="addAll">＋ Add all</button></div>
    <div class="card">${vocab.map(vItem).join('') || '<p class="muted">Nothing new. Nice!</p>'}</div>
    <h3>Idioms &amp; expressions (${(r.idioms || []).length})</h3>
    <div class="card">${(r.idioms || []).map(iItem).join('') || '<p class="muted">None found.</p>'}</div>`;
  const grammar = `<h3>Grammar</h3>` + ((r.grammar || []).map(g => `<div class="card"><b>${esc(g.point)}</b><p>${esc(g.explanation_en)}</p>
    <div class="row"><div class="grow"><div class="ex">${esc(g.example)}</div><div class="muted small">${esc(g.example_en)}</div></div>
    <button class="ic" data-say="${esc(g.example)}">🔊</button></div></div>`).join('') || '<p class="muted">None.</p>');
  return collapsed ? `<details class="card"><summary><b>All words &amp; idioms as a list</b></summary>${lists}</details>${grammar}` : lists + grammar;
}

// ---------- reader ----------
function buildReader(src) {
  const text = src.text, ts = hasTimestamps(text), r = src.result || {};
  tokens = []; refs = [];
  const re = /(^[ \t]*(?:\d{1,2}:)?\d{1,2}:\d{2}(?=\s|$))|(\p{L}[\p{L}\p{M}'’\-]*)|([\s\S])/gmu;
  let m, time = null;
  while ((m = re.exec(text))) {
    if (m[1] && ts) { const p = m[1].trim().split(':').map(Number); time = p.reduce((a, b) => a * 60 + b, 0); tokens.push({ s: m[1], o: m.index, ts: time }); }
    else tokens.push({ s: m[0], o: m.index, w: !!m[2], t: time });
  }
  const cls = tokens.map(() => '');
  const mark = (start, end, c, ref) => {
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i]; if (tk.o >= end) break;
      if (tk.w && tk.o >= start) { if (!cls[i].includes(c)) cls[i] += ' ' + c; if (ref && (!refs[i] || ref.type === 'i')) refs[i] = ref; }
    }
  };
  const find = (phrase, all) => {
    if (!phrase) return [];
    const pat = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const rx = new RegExp(`(?<![\\p{L}\\p{M}])${pat}(?![\\p{L}\\p{M}])`, 'giu'), hits = [];
    let h; while ((h = rx.exec(text))) { hits.push([h.index, h.index + h[0].length]); if (!all) break; }
    return hits;
  };
  (r.grammar || []).forEach(g => find(g.example, false).forEach(([a, b]) => mark(a, b, 'gr')));
  (r.vocabulary || []).forEach((v, k) => { if (!isKnown(v.lemma)) find(v.form || v.lemma, true).forEach(([a, b]) => mark(a, b, 'nw', { type: 'v', k })); });
  (r.idioms || []).forEach((v, k) => find(v.form || v.expression, true).forEach(([a, b]) => mark(a, b, 'id', { type: 'i', k })));
  const deckForms = new Set(cards.filter(c => c.lang === S.lang && c.type === 'word').flatMap(c => [norm(c.front), norm(c.form)]));
  tokens.forEach((tk, i) => { if (tk.w && !/nw|id/.test(cls[i]) && deckForms.has(norm(tk.s))) cls[i] += ' dk'; });
  const title = src.kind === 'article' ? '' : '';
  return title + tokens.map((tk, i) => tk.ts != null ? `<span class="ts" data-ts="${tk.ts}">${esc(tk.s)}</span>`
    : tk.w ? `<span class="t${cls[i]}" data-i="${i}">${esc(tk.s)}</span>` : esc(tk.s)).join('');
}
function sentenceAt(off) {
  const text = current.text;
  let s = off; while (s > 0 && !/[.!?¡¿\n]/.test(text[s - 1])) s--;
  let e = off; while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
  if (e < text.length && /[.!?]/.test(text[e])) e++;
  return text.slice(s, e).replace(/^[ \t]*(?:\d{1,2}:)?\d{1,2}:\d{2}[ \t]*/gm, '').trim();
}

// tap a word in the reader
$('#results').addEventListener('click', e => {
  const tsEl = e.target.closest('.ts');
  if (tsEl && current?.url) { const u = ytAt(current.url, +tsEl.dataset.ts); if (u) window.open(u, '_blank'); return; }
  const el = e.target.closest('.reader .t'); if (!el) return;
  const sel = getSelection(); if (sel && !sel.isCollapsed) return;
  const i = +el.dataset.i, tk = tokens[i], ref = refs[i], r = current.result;
  document.querySelectorAll('.reader .tap').forEach(x => x.classList.remove('tap')); el.classList.add('tap');
  if (ref) openItemSheet(ref.type === 'v' ? 'word' : 'idiom', ref.type === 'v' ? r.vocabulary[ref.k] : r.idioms[ref.k], tk.t);
  else openLookupSheet(tk.s, sentenceAt(tk.o), tk.t);
});

// select text in the reader → floating "Add selection"
let selInfo = null, selT;
document.addEventListener('selectionchange', () => {
  clearTimeout(selT);
  selT = setTimeout(() => {
    const sel = getSelection(), reader = $('#reader'), bar = $('#selbar');
    if (!reader || !sel || sel.isCollapsed || !reader.contains(sel.anchorNode) || !reader.contains(sel.focusNode)) { bar.hidden = true; return; }
    const text = sel.toString().replace(/\s+/g, ' ').replace(/^[ \t]*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*/g, '').trim();
    if (text.length < 2 || text.length > 400) { bar.hidden = true; return; }
    const node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const tEl = node.closest('.t') || node.querySelector?.('.t');
    const i = tEl ? +tEl.dataset.i : 0;
    selInfo = { text, off: tokens[i]?.o || 0, t: tokens[i]?.t };
    bar.hidden = false;
  }, 150);
});
$('#selAdd').addEventListener('pointerdown', e => e.preventDefault());   // keep the selection alive
$('#selAdd').onclick = () => { if (!selInfo) return; $('#selbar').hidden = true; openLookupSheet(selInfo.text, sentenceAt(selInfo.off), selInfo.t, true); };

// ---------- bottom sheet ----------
function showSheet(html) { $('#sheet').innerHTML = html; $('#sheet').hidden = false; $('#sheetBg').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; $('#sheetBg').hidden = true; document.querySelectorAll('.reader .tap').forEach(x => x.classList.remove('tap')); }
$('#sheetBg').onclick = closeSheet;

function itemHtml(kind, v, t) {
  const front = kind === 'idiom' ? v.expression : v.lemma, art = kind === 'word' ? v.article : '';
  const id = cardId(S.lang, kind, front), u = ytAt(current?.url, t ?? v.time);
  return `<div class="row"><div class="grow"><div class="w"><span class="art">${esc(art)}</span>${esc(front)}<span class="tag">${esc(v.cefr || v.register || '')}</span></div>
      <div>${esc(v.meaning_en)}${v.pos ? ` <span class="muted small">· ${esc(v.pos)}</span>` : ''}</div></div>
      <button class="ic" data-say="${esc((art ? art + ' ' : '') + front)}">🔊</button></div>
    ${v.literal_en ? `<p class="muted small">Literally: ${esc(v.literal_en)}</p>` : ''}
    ${v.note ? `<p class="muted small">${esc(v.note)}</p>` : ''}
    <p class="ex">${esc(v.example)} <button class="ic" data-say="${esc(v.example)}">🔊</button></p><p class="muted small">${esc(v.example_en)}</p>
    <div class="links">${kind === 'word' && youglish(front) ? `<a href="${youglish(front)}" target="_blank" rel="noopener">YouGlish</a>` : ''}<a href="${forvo(front)}" target="_blank" rel="noopener">Forvo</a>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">▶ Hear it in context</a>` : ''}</div>
    <div class="row" style="margin-top:14px">${inDeck(id) ? '<button class="btn" disabled>✓ In your deck</button>' : '<button class="btn" id="shAdd">＋ Add to deck</button>'}
      ${kind === 'word' ? `<button class="btn ghost" id="shKnown">I know this</button>` : ''}<button class="btn ghost" id="shClose">Close</button></div>`;
}
function openItemSheet(kind, v, t) {
  showSheet(itemHtml(kind, v, t));
  $('#shClose').onclick = closeSheet;
  const add = $('#shAdd'); if (add) add.onclick = () => { addFromItem(kind, v, t); persist(); toast('Added'); closeSheet(); refreshReader(); };
  const kn = $('#shKnown'); if (kn) kn.onclick = () => { markKnown(v.lemma); closeSheet(); refreshReader(); };
}
function openLookupSheet(sel, sentence, t, fromSelection) {
  showSheet(`<div class="w">${esc(sel)}</div><p class="muted small">${esc(sentence)}</p>
    <div class="row"><button class="btn" id="shExplain">Explain &amp; add</button><button class="ic" data-say="${esc(sel)}">🔊</button>
    ${!fromSelection ? `<button class="btn ghost" id="shKnown">I know this</button>` : ''}<button class="btn ghost" id="shClose">Close</button></div><div id="shOut"></div>`);
  $('#shClose').onclick = closeSheet;
  const kn = $('#shKnown'); if (kn) kn.onclick = () => { markKnown(sel); closeSheet(); refreshReader(); };
  $('#shExplain').onclick = async () => {
    const out = $('#shOut'); out.innerHTML = '<p><span class="spinner"></span> Explaining…</p>';
    try {
      const x = await gemini([{ text: `${L().name} text: "${sentence}"
The learner (level ${lvl()}, native Hungarian, wants English explanations) selected: "${sel}".
Explain the selection as used in this context. Return ONLY JSON:
{"kind": "word" | "phrase" | "sentence" (sentence if it is a whole clause or sentence), "lemma": dictionary form (for a sentence: the selection itself, cleaned up), "article": ${L().arts} if it is a noun else "", "pos": string, "meaning_en": meaning in this context, "translation_en": English translation of the selection, "sentence_en": English translation of the whole sentence, "literal_en": word-for-word if idiomatic else "", "note": short grammar or usage note in English, "cefr": "A1".."C2"}` }]);
      const kind = x.kind === 'sentence' ? 'sentence' : x.kind === 'phrase' ? 'idiom' : 'word';
      const item = kind === 'sentence'
        ? { lemma: x.lemma || sel, meaning_en: x.translation_en, note: x.note, example: sentence, example_en: x.sentence_en, cefr: x.cefr }
        : { lemma: x.lemma, expression: x.lemma, article: x.article, pos: x.pos, meaning_en: x.meaning_en, literal_en: x.literal_en, note: x.note,
            example: sentence, example_en: x.sentence_en, cefr: x.cefr, form: sel };
      if (kind === 'sentence') {
        out.innerHTML = `<p><b>${esc(x.translation_en)}</b></p>${x.note ? `<p class="muted small">${esc(x.note)}</p>` : ''}
          <button class="btn" id="shAdd2">＋ Add sentence to deck</button>`;
        $('#shAdd2').onclick = () => { addFromItem('sentence', item, t); persist(); toast('Sentence added'); closeSheet(); };
      } else {
        showSheet(itemHtml(kind, item, t));
        $('#shClose').onclick = closeSheet;
        const add = $('#shAdd'); if (add) add.onclick = () => { addFromItem(kind, item, t); persist(); toast('Added'); closeSheet(); refreshReader(); };
        const k2 = $('#shKnown'); if (k2) k2.onclick = () => { markKnown(item.lemma); closeSheet(); refreshReader(); };
      }
    } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
function refreshReader() { if (current?.text) { const y = window.scrollY; renderCurrent(); window.scrollTo(0, y); } }

// ---------- cards ----------
function addFromItem(kind, v, t) {
  const front = kind === 'idiom' ? (v.expression || v.lemma) : v.lemma;
  if (!front) return false;
  const id = cardId(S.lang, kind, front);
  if (inDeck(id)) return false;
  cards.push({ id, lang: S.lang, type: kind, front, article: kind === 'word' ? (v.article || '') : '', back: v.meaning_en || '',
    example: kind === 'sentence' ? '' : (v.example || ''), exampleEn: kind === 'sentence' ? '' : (v.example_en || ''),
    note: [v.literal_en ? 'Literally: ' + v.literal_en : '', v.note || ''].filter(Boolean).join(' · '),
    pos: v.pos || '', form: v.form || '', due: 0, reps: 0, added: Date.now(),
    srcId: current?.id || '', srcTitle: current?.title || '', srcUrl: current?.url || '', t: t ?? v.time ?? null });
  return true;
}
function markKnown(w) { const k = norm(w); if (!K().includes(k)) K().push(k); persist(); toast('Marked as known, it will be skipped from now on'); }

document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.say) speak(b.dataset.say);
  if (b.dataset.add && current) {
    const r = current.result, k = b.dataset.add;
    const ok = k[0] === 'v' ? addFromItem('word', r.vocabulary[+k.slice(1)]) : addFromItem('idiom', r.idioms[+k.slice(1)]);
    if (ok) { b.classList.add('added'); b.textContent = '✓'; persist(); toast('Added'); }
  }
  if (b.dataset.known) { markKnown(b.dataset.known); renderCurrent(); }
});

// ---------- find content ----------
$('#findBtn').onclick = async () => {
  const topic = $('#topic').value.trim() || 'everyday life', out = $('#findOut');
  out.innerHTML = '<p><span class="spinner"></span> Thinking…</p>';
  try {
    const r = await gemini([{ text: `Suggest content for a ${lvl()} learner of ${L().name} interested in "${topic}". Explanations in English.
Return ONLY JSON: {"queries":[{"query": a YouTube search written in ${L().name}, "why": short}], "channels":[{"name": a real, well-known ${L().name}-language or learner YouTube channel, "why": short}], "sites":[{"name": a real, well-known ${L().name}-language website with articles (news, magazine or easy-news for learners), "url": its https homepage, "why": short}]}
5 queries, 4 channels, 4 sites. Prefer comprehensible input and native speakers.` }]);
    const it = (href, name, why) => `<div class="item"><div><a href="${esc(href)}" target="_blank" rel="noopener"><b>${esc(name)}</b></a><div class="muted small">${esc(why)}</div></div></div>`;
    out.innerHTML = `<h3>YouTube searches</h3>${(r.queries || []).map(q => it(ytSearch(q.query), q.query, q.why)).join('')}
      <h3>Channels</h3>${(r.channels || []).map(c => it(ytSearch(c.name), c.name, c.why)).join('')}
      <h3>Websites to read</h3>${(r.sites || []).filter(s => safeUrl(s.url)).map(s => it(s.url, s.name, s.why)).join('')}
      <p class="muted small">Found something good? Copy its link (Share → Copy), paste it above and tap Analyse.</p>`;
  } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};

// ---------- REVIEW ----------
let session = { mode: 'normal' }, rev = null, revealed = false;
function buckets(now = Date.now()) {
  const mine = cards.filter(c => c.lang === S.lang && !c.suspended), endToday = dayStartTs(now) + DAY;
  const learning = mine.filter(c => c.reps && !c.ivl).sort((a, b) => a.due - b.due);
  const reviews = mine.filter(c => c.reps && c.ivl && c.due < endToday).sort((a, b) => a.due - b.due);
  const done = newLog[S.lang + ':' + dayKey(now)] || 0;
  const unseen = mine.filter(c => !c.reps).sort((a, b) => a.added - b.added);
  const fresh = unseen.slice(0, Math.max(0, S.newPerDay - done));
  return { mine, learning, reviews, fresh, unseen, endToday };
}
function updateBadge() {
  const { learning, reviews, fresh } = buckets(), n = learning.length + reviews.length + fresh.length, b = $('#dueBadge');
  b.hidden = !n; b.textContent = n;
}
function renderReview() {
  if (session.mode === 'practice') return renderPractice();
  const now = Date.now(), B = buckets(now);
  $('#stDue').textContent = B.learning.length + B.reviews.length; $('#stNew').textContent = B.fresh.length; $('#stAll').textContent = B.mine.length;
  $('#reviewTitle').textContent = session.mode === 'ahead' ? `Reviewing ahead (${session.days} day${session.days > 1 ? 's' : ''})` : 'Review';
  if (session.mode === 'ahead') {
    const until = B.endToday + session.days * DAY;
    rev = B.mine.filter(c => c.reps && c.ivl && c.due < until).sort((a, b) => a.due - b.due)[0] || B.learning[0] || null;
  } else {
    rev = B.learning.find(c => c.due <= now + 20 * MIN) || B.reviews[0] || B.fresh[0] || B.learning[0] || null;  // learn ahead when nothing else
  }
  revealed = false;
  const box = $('#reviewBox');
  if (!rev) { session = { mode: 'normal' }; return renderDone(B); }
  showCard(rev, session.mode === 'ahead' ? '<button class="btn ghost" id="stopAhead">Stop reviewing ahead</button>' : '');
  const s = $('#stopAhead'); if (s) s.onclick = () => { session = { mode: 'normal' }; renderReview(); };
}
function cardFace(c) {
  const long = c.front.length > 28;
  const u = ytAt(c.srcUrl, c.t);
  return `<div class="card flash">
    <div class="muted small">${c.type === 'idiom' ? 'Idiom' : c.type === 'sentence' ? 'Sentence' : esc(c.pos)}${c.reps ? '' : ' · new'}</div>
    <div class="front${long ? ' long' : ''}">${c.article ? `<span class="art">${esc(c.article)} </span>` : ''}${esc(c.front)}</div>
    <div class="back" id="back" hidden>
      <div><b>${esc(c.back)}</b></div>
      ${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ''}
      ${c.example ? `<p class="ex">${esc(c.example)} <button class="ic" data-say="${esc(c.example)}">🔊</button></p><div class="muted small">${esc(c.exampleEn)}</div>` : ''}
      <div class="links" style="margin-top:8px">${c.type !== 'sentence' && youglish(c.front) ? `<a href="${youglish(c.front)}" target="_blank" rel="noopener">YouGlish</a>` : ''}
        ${c.type !== 'sentence' ? `<a href="${forvo(c.front)}" target="_blank" rel="noopener">Forvo</a>` : ''}
        ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">▶ Hear it in context</a>` : ''}</div>
      ${c.srcTitle ? `<div class="muted small">From: ${esc(c.srcTitle)}</div>` : ''}
    </div></div>`;
}
function showCard(c, extra = '') {
  $('#reviewBox').innerHTML = cardFace(c) + `<div id="revCtl"><button class="btn" style="width:100%" id="showBtn">Show answer</button></div><div class="modebar">${extra}</div>`;
  $('#showBtn').onclick = reveal;
}
function reveal() {
  if (!rev || revealed) return; revealed = true;
  $('#back').hidden = false;
  speak((rev.article ? rev.article + ' ' : '') + rev.front);
  if (session.mode === 'practice') {
    $('#revCtl').innerHTML = `<div class="grades two"><button class="g1" data-p="again">Again<small>see it later</small></button><button class="g3" data-p="ok">Got it<small>next card</small></button></div>`;
    $('#revCtl').querySelectorAll('[data-p]').forEach(b => b.onclick = () => practiceGrade(b.dataset.p));
    return;
  }
  const lab = g => { const n = FSRS.next(rev, g, S.retention); if (!n.ivl) return '10 min'; const d = n.ivl; return d < 31 ? d + ' d' : d < 365 ? Math.round(d / 30) + ' mo' : (d / 365).toFixed(1) + ' y'; };
  $('#revCtl').innerHTML = `<div class="grades">
    <button class="g1" data-g="1">Again<small>${lab(1)}</small></button><button class="g2" data-g="2">Hard<small>${lab(2)}</small></button>
    <button class="g3" data-g="3">Good<small>${lab(3)}</small></button><button class="g4" data-g="4">Easy<small>${lab(4)}</small></button></div>`;
  $('#revCtl').querySelectorAll('[data-g]').forEach(b => b.onclick = () => grade(+b.dataset.g));
}
function grade(g) {
  const now = Date.now(), wasNew = !rev.reps, i = cards.findIndex(c => c.id === rev.id);
  const n = FSRS.next(rev, g, S.retention, now);
  if (n.ivl) n.due = dayStartTs(now) + n.ivl * DAY;          // due from the start of that day, like Anki
  cards[i] = n;
  if (wasNew) { const k = S.lang + ':' + dayKey(now); newLog[k] = (newLog[k] || 0) + 1; }
  persist(); renderReview();
}
function renderDone(B) {
  const next = B.mine.filter(c => c.reps).sort((a, b) => a.due - b.due)[0];
  const ahead = d => B.mine.filter(c => c.reps && c.ivl && c.due < B.endToday + d * DAY).length;
  const more = B.unseen.length - B.fresh.length;
  $('#reviewBox').innerHTML = `<div class="card flash"><div class="front" style="color:var(--gold)">✓</div><p>All done for today.</p>
      ${next ? `<p class="muted small">Next card: ${next.due < B.endToday + DAY ? (next.ivl ? 'tomorrow' : new Date(next.due).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : new Date(next.due).toLocaleDateString()}</p>`
        : '<p class="muted small">Add words from the Learn tab to start.</p>'}</div>
    <div class="card"><b>Want more?</b>
      <div class="modebar">
        <button class="btn ghost" data-ahead="1">Review tomorrow's (${ahead(1)})</button>
        <button class="btn ghost" data-ahead="3">Next 3 days (${ahead(3)})</button>
        <button class="btn ghost" data-ahead="7">Next 7 days (${ahead(7)})</button>
        ${more > 0 ? `<button class="btn ghost" id="moreNew">＋10 new cards (${more} waiting)</button>` : ''}
        <button class="btn gold" id="practiceBtn">Practice without scheduling</button>
      </div></div>`;
  $('#reviewBox').querySelectorAll('[data-ahead]').forEach(b => b.onclick = () => { session = { mode: 'ahead', days: +b.dataset.ahead }; renderReview(); });
  const mn = $('#moreNew'); if (mn) mn.onclick = () => { const k = S.lang + ':' + dayKey(); newLog[k] = (newLog[k] || 0) - 10; persist(); renderReview(); };
  $('#practiceBtn').onclick = openPracticeChooser;
}
function openPracticeChooser() {
  const mine = cards.filter(c => c.lang === S.lang);
  const today = dayStartTs();
  const srcs = [...new Map(mine.filter(c => c.srcId).map(c => [c.srcId, c.srcTitle])).entries()].slice(0, 12);
  const opt = (k, label, n) => n ? `<button class="btn ghost" data-set="${esc(k)}">${esc(label)} (${n})</button>` : '';
  showSheet(`<div class="w">Practice</div><p class="muted small">Go through cards without changing their schedule. Good before a conversation or exam.</p>
    <div class="modebar">${opt('today', "Added today", mine.filter(c => c.added >= today).length)}
      ${opt('hard', 'Most difficult', mine.filter(c => c.lapses || c.d > 6).length)}
      ${opt('sentences', 'Sentences', mine.filter(c => c.type === 'sentence').length)}
      ${opt('all', 'Everything', mine.length)}</div>
    ${srcs.length ? '<label>From a video or article</label><div class="modebar">' + srcs.map(([id, t]) => opt('src:' + id, t, mine.filter(c => c.srcId === id).length)).join('') + '</div>' : ''}
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="shClose">Close</button></div>`);
  $('#shClose').onclick = closeSheet;
  $('#sheet').querySelectorAll('[data-set]').forEach(b => b.onclick = () => {
    const k = b.dataset.set;
    const pick = mine.filter(c => k === 'all' || (k === 'today' && c.added >= today) || (k === 'hard' && (c.lapses || c.d > 6)) ||
      (k === 'sentences' && c.type === 'sentence') || (k.startsWith('src:') && c.srcId === k.slice(4)));
    const q = pick.map(c => c.id).sort(() => Math.random() - 0.5).slice(0, 60);
    session = { mode: 'practice', queue: q, total: q.length };
    closeSheet(); show('review');
  });
}
function renderPractice() {
  $('#reviewTitle').textContent = `Practice · ${session.queue.length} left`;
  rev = cards.find(c => c.id === session.queue[0]); revealed = false;
  if (!rev) {
    session = { mode: 'normal' };
    $('#reviewBox').innerHTML = `<div class="card flash"><div class="front" style="color:var(--gold)">✓</div><p>Practice finished.</p></div>
      <button class="btn" id="backRev">Back to review</button>`;
    $('#backRev').onclick = renderReview; $('#reviewTitle').textContent = 'Practice';
    return;
  }
  showCard(rev, '<button class="btn ghost" id="stopPr">End practice</button>');
  $('#stopPr').onclick = () => { session = { mode: 'normal' }; renderReview(); };
}
function practiceGrade(p) {
  const id = session.queue.shift();
  if (p === 'again') session.queue.splice(Math.min(3, session.queue.length), 0, id);
  renderPractice();
}
document.addEventListener('keydown', e => {
  if (!$('#v-review').classList.contains('on') || e.target.matches('input,textarea')) return;
  if (e.key === ' ' && !revealed && rev) { e.preventDefault(); reveal(); }
  else if (revealed && session.mode !== 'practice' && '1234'.includes(e.key)) grade(+e.key);
});

// ---------- SPEAK ----------
const sayText = $('#sayText');
function setSayLinks() {
  const a = $('#sayYouglish'), w = sayText.value.trim().split(/\s+/).slice(0, 4).join(' ');
  a.hidden = !L().yg; if (L().yg) a.href = youglish(w || L().test);
}
sayText.oninput = setSayLinks;
$('#sayRandom').onclick = () => {
  const pool = cards.filter(c => c.lang === S.lang && (c.example || c.type === 'sentence'));
  if (!pool.length) return toast('Add some words first');
  const c = pool[Math.floor(Math.random() * pool.length)];
  sayText.value = c.type === 'sentence' ? c.front : c.example; setSayLinks();
};
$('#sayListen').onclick = () => speak(sayText.value);
$('#saySlow').onclick = () => speak(sayText.value, true);

let rec = null, chunks = [], stream = null;
$('#recBtn').onclick = async () => {
  const btn = $('#recBtn'), st = $('#recStatus');
  if (rec && rec.state === 'recording') { rec.stop(); return; }
  if (!sayText.value.trim()) return toast('Type or pick a sentence first');
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { st.textContent = 'Microphone access was blocked. Allow it in iPad Settings → Safari → Microphone.'; return; }
  chunks = []; rec = new MediaRecorder(stream);
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    btn.classList.remove('on'); btn.textContent = 'Record';
    st.innerHTML = '<span class="spinner"></span> Listening to you…';
    try {
      const wav = await toWavBase64(new Blob(chunks, { type: rec.mimeType })), target = sayText.value.trim();
      const r = await gemini([{ inlineData: { mimeType: 'audio/wav', data: wav } }, { text:
        `You are a strict but kind ${L().name} pronunciation coach (target: ${L().std}). The learner (native Hungarian) tried to say: "${target}".
Listen to the audio. Return ONLY JSON: {"heard": what you actually heard, "score": 0-100 overall native-likeness, "words":[{"word": each word of the target in order, "ok": true|false, "tip": if not ok, a short English tip (tongue position, vowel length, stress${S.lang === 'no' || S.lang === 'sv' ? ', pitch accent' : ''})}], "overall_en": 2-3 sentences with the most important advice, mentioning typical Hungarian-speaker issues if relevant}` }]);
      $('#speakOut').innerHTML = `<div style="text-align:center"><div class="score">${esc(r.score)}</div><div class="muted small">native-likeness</div></div>
        <p style="font-size:20px">${(r.words || []).map(w => `<span class="${w.ok ? 'wok' : 'wbad'}">${esc(w.word)}</span>`).join(' ')}</p>
        <p class="muted small">Heard: “${esc(r.heard)}”</p>
        ${(r.words || []).filter(w => !w.ok && w.tip).map(w => `<p><b>${esc(w.word)}</b>: ${esc(w.tip)}</p>`).join('')}<p>${esc(r.overall_en)}</p>`;
      st.textContent = 'Tap to try again.';
    } catch (e) { st.textContent = ''; $('#speakOut').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  rec.start(); btn.classList.add('on'); btn.textContent = 'Stop';
  st.textContent = 'Recording… speak now.'; $('#speakOut').innerHTML = '';
};
async function toWavBase64(blob) {
  const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC(), ab = await blob.arrayBuffer();
  const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
  try { ctx.close(); } catch {}
  const rate = 16000, src = buf.getChannelData(0), ratio = buf.sampleRate / rate, n = Math.floor(src.length / ratio);
  const dv = new DataView(new ArrayBuffer(44 + n * 2)), str = (o, s) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, src[Math.floor(i * ratio)])); dv.setInt16(44 + i * 2, s * 0x7fff, true); }
  const bytes = new Uint8Array(dv.buffer); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------- WORDS ----------
let deckFilter = 'all';
$('#deckFilter').onclick = e => { const b = e.target.closest('button'); if (!b) return; deckFilter = b.dataset.f;
  $('#deckFilter').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderDeck(); };
$('#deckSearch').oninput = () => renderDeck();
function renderDeck() {
  const q = norm($('#deckSearch').value), box = $('#deckList');
  if (deckFilter === 'known') {
    const list = K().filter(w => w.includes(q));
    box.innerHTML = list.map(w => `<div class="item"><div class="w">${esc(w)}</div><div class="acts"><button class="ic" data-unknown="${esc(w)}">Unmark</button></div></div>`).join('') || '<p class="muted">No known words yet.</p>';
    return;
  }
  const list = cards.filter(c => c.lang === S.lang && (deckFilter === 'all' || c.type === deckFilter) && (!q || norm(c.front + ' ' + c.back).includes(q)))
    .sort((a, b) => b.added - a.added);
  box.innerHTML = list.map(c => { const u = ytAt(c.srcUrl, c.t); return `<div class="item"><div>
      <div class="w" style="${c.type === 'sentence' ? 'font:600 18px/1.4 var(--read)' : ''}"><span class="art">${esc(c.article)}</span>${esc(c.front)}</div><div>${esc(c.back)}</div>
      <div class="muted small">${c.reps ? (c.ivl ? 'Next: ' + new Date(c.due).toLocaleDateString() : 'Learning') + ' · reviewed ' + c.reps + '×' : 'New'}${c.srcTitle ? ' · ' + esc(c.srcTitle) : ''}
        ${u ? ` · <a href="${esc(u)}" target="_blank" rel="noopener">▶ in context</a>` : ''}</div>
    </div><div class="acts"><button class="ic" data-say="${esc((c.article ? c.article + ' ' : '') + c.front)}">🔊</button>
      <button class="ic" data-del="${esc(c.id)}" aria-label="Delete">🗑</button></div></div>`; }).join('') || '<p class="muted">No cards yet.</p>';
}
$('#deckList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.del) {
    if (b.dataset.armed) { cards = cards.filter(c => c.id !== b.dataset.del); persist(); renderDeck(); toast('Deleted'); }
    else { b.dataset.armed = 1; b.textContent = 'Sure?'; }
  }
  if (b.dataset.unknown) { known[S.lang] = K().filter(w => w !== b.dataset.unknown); persist(); renderDeck(); }
});

// ---------- export ----------
async function saveFile(name, text, mime) {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const today = () => new Date().toISOString().slice(0, 10);
function exportCsv() {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const head = ['language', 'type', 'article', 'word', 'meaning', 'example', 'example_en', 'note', 'source', 'added', 'next_review'];
  const rows = cards.map(c => [CATALOG[c.lang]?.name || c.lang, c.type, c.article, c.front, c.back, c.example, c.exampleEn, c.note, c.srcTitle,
    new Date(c.added).toISOString().slice(0, 10), c.reps ? new Date(c.due).toISOString().slice(0, 10) : ''].map(q).join(','));
  saveFile(`lingua-words-${today()}.csv`, '﻿' + [head.join(','), ...rows].join('\n'), 'text/csv');
}
$('#exportCsv').onclick = exportCsv; $('#deckCsv').onclick = exportCsv;
$('#exportJson').onclick = () => saveFile(`lingua-backup-${today()}.json`, JSON.stringify({ v: 2, settings: { ...S, apiKey: '' }, cards, known, sources }), 'application/json');
$('#exportAnki').onclick = () => {
  const clean = s => String(s || '').replace(/[\t\n\r]/g, ' ');
  const rows = cards.filter(c => c.lang === S.lang).map(c => [clean((c.article ? c.article + ' ' : '') + c.front),
    clean(c.back) + (c.example ? '<br><i>' + clean(c.example) + '</i><br>' + clean(c.exampleEn) : '') + (c.note ? '<br><small>' + clean(c.note) + '</small>' : ''),
    'lingua ' + S.lang + ' ' + c.type].join('\t'));
  saveFile(`lingua-${S.lang}-anki.txt`, '#separator:tab\n#html:true\n#tags column:3\n' + rows.join('\n'), 'text/plain');
};
$('#importJson').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); let n = 0;
    (d.cards || []).forEach(c => { const i = cards.findIndex(x => x.id === c.id); if (i < 0) { cards.push(c); n++; } else if ((c.last || 0) > (cards[i].last || 0)) cards[i] = c; });
    Object.keys(d.known || {}).forEach(l => (d.known[l] || []).forEach(w => K(l).includes(w) || K(l).push(w)));
    (d.sources || []).forEach(s => sources.some(x => x.id === s.id) || sources.push(s));
    persist(); toast(`Restored. ${n} new cards`); renderDeck(); renderRecent();
  } catch { toast('That file could not be read'); }
  e.target.value = '';
};

// ---------- SETTINGS ----------
function showEngine() { $('#gVoiceBox').style.display = S.tts === 'gemini' ? 'block' : 'none'; $('#dVoiceBox').style.display = S.tts === 'gemini' ? 'none' : 'block'; }
function renderLangSettings() {
  $('#langPick').innerHTML = Object.entries(CATALOG).map(([k, c]) => `<button data-lp="${k}" class="${S.langs.includes(k) ? 'on' : ''}">${c.name}</button>`).join('');
  $('#levels').innerHTML = S.langs.map(l => `<div class="lvrow"><span>${CATALOG[l].name}</span><div class="seg" data-lvl="${l}">${LEVELS.map(x =>
    `<button data-lv="${x}" class="${lvl(l) === x ? 'on' : ''}">${x}</button>`).join('')}</div></div>`).join('');
}
$('#langPick').onclick = e => {
  const b = e.target.closest('button'); if (!b) return; const k = b.dataset.lp;
  if (S.langs.includes(k)) { if (S.langs.length === 1) return toast('Keep at least one language'); S.langs = S.langs.filter(x => x !== k); if (S.lang === k) S.lang = S.langs[0]; }
  else S.langs.push(k);
  persist(); renderLangSettings(); setLang(S.lang);
};
$('#levels').onclick = e => {
  const b = e.target.closest('button[data-lv]'); if (!b) return;
  S.level[b.parentElement.dataset.lvl] = b.dataset.lv; persist(); renderLangSettings();
};
function initSettings() {
  $('#apiKey').value = S.apiKey;
  $('#apiKey').onchange = e => { S.apiKey = e.target.value.trim(); persist(); toast('Key saved'); };
  const opts = [...$('#model').options].map(o => o.value);
  $('#model').value = opts.includes(S.model) ? S.model : 'custom';
  $('#modelCustom').value = S.modelCustom; $('#modelCustom').style.display = $('#model').value === 'custom' ? 'block' : 'none';
  $('#model').onchange = e => { S.model = e.target.value; $('#modelCustom').style.display = S.model === 'custom' ? 'block' : 'none'; persist(); };
  $('#modelCustom').onchange = e => { S.modelCustom = e.target.value; persist(); };
  $('#clip').value = String(S.clip); $('#clip').onchange = e => { S.clip = +e.target.value; persist(); };
  $('#testBtn').onclick = async () => {
    const out = $('#testOut'); out.innerHTML = '<span class="spinner"></span> Testing…';
    try { const r = await gemini([{ text: `Return ONLY JSON: {"word": a common ${L().name} word}` }], m => { out.textContent = m; }); out.textContent = '✅ Connected. Gemini says: ' + (r.word || 'ok'); }
    catch (e) { out.textContent = '❌ ' + e.message; }
  };
  $('#dayStart').innerHTML = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(h => `<option value="${h}">${String(h).padStart(2, '0')}:00${h === 4 ? ' (like Anki)' : ''}</option>`).join('');
  $('#dayStart').value = String(S.dayStart); $('#dayStart').onchange = e => { S.dayStart = +e.target.value; persist(); };
  $('#newPerDay').innerHTML = [5, 10, 15, 20, 30, 50].map(n => `<option value="${n}">${n}</option>`).join('');
  $('#newPerDay').value = String(S.newPerDay); $('#newPerDay').onchange = e => { S.newPerDay = +e.target.value; persist(); };
  const ret = $('#retention'); ret.value = S.retention; $('#retVal').textContent = Math.round(S.retention * 100) + '%';
  ret.oninput = () => { S.retention = +ret.value; $('#retVal').textContent = Math.round(S.retention * 100) + '%'; }; ret.onchange = persist;
  const rate = $('#rate'); rate.value = S.rate; $('#rateVal').textContent = S.rate + '×';
  rate.oninput = () => { S.rate = +rate.value; $('#rateVal').textContent = S.rate + '×'; }; rate.onchange = persist;
  $('#engine').value = S.tts; showEngine();
  $('#engine').onchange = e => { S.tts = e.target.value; persist(); showEngine(); speak(L().test); };
  $('#gvoice').onchange = e => { S.gvoice[S.lang] = e.target.value; persist(); speak(L().test); };
  $('#voice').onchange = e => { S.voice[S.lang] = e.target.value; persist(); deviceSpeak(L().test); };
  renderLangSettings();
}

// ---------- navigation & language ----------
function show(v) {
  closeSheet(); $('#selbar').hidden = true;
  document.querySelectorAll('section.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'review') renderReview();
  if (v === 'deck') renderDeck();
  window.scrollTo(0, 0);
}
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.v); };
function setLang(l) {
  if (!S.langs.includes(l)) l = S.langs[0];
  S.lang = l; const c = L();
  document.documentElement.style.setProperty('--acc-l', c.acc[0]); document.documentElement.style.setProperty('--acc-d', c.acc[1]);
  $('#langswitch').innerHTML = S.langs.map(k => `<button data-l="${k}" class="${k === l ? 'on' : ''}">${k.toUpperCase()}</button>`).join('');
  $('#gvoice').value = S.gvoice[l] || 'Charon';
  if (current && current.lang !== l) current = sources.find(s => s.lang === l) || null;
  session = { mode: 'normal' };
  loadVoices(); renderCurrent(); renderRecent(); setSayLinks(); persist();
  const v = document.querySelector('#tabs button.on').dataset.v; if (v === 'review') renderReview(); if (v === 'deck') renderDeck();
}
$('#langswitch').onclick = e => { const b = e.target.closest('button'); if (b) setLang(b.dataset.l); };

initSettings(); setLang(S.lang); updateBadge();
current = sources.find(s => s.lang === S.lang) || null; renderCurrent();
if (!S.apiKey) show('settings');
setInterval(updateBadge, 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
