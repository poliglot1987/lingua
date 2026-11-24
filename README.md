# Lingua – your personal language tutor (iPad app)

Free, private, runs in Safari and installs on your Home Screen. Explanations in English.
Theme: black, forest greens, greys, white and a touch of gold.

## What it does
- **Learn from videos:** paste a YouTube link → vocabulary (with articles), idioms, grammar, and "▶ hear it in context" links to the moment each word is spoken. Only the first 10 minutes are analysed by default (Settings → Video length).
- **Read mode for articles and transcripts:** paste an article link or any text → the full text with highlights:
  - gold = new words for your level · grey-blue = idioms · dotted underline = grammar · green = already in your deck
  - **tap** a word to see its meaning and add it, or **select** any word or sentence → "＋ Add selection" → Lingua explains it in context and makes a card.
  - Paste a YouTube link **and** its transcript (with timestamps) together, and every card links back to the video at the right second.
- **Song mode:** tick "It's a song" for slang and shortened forms (pa' = para).
- **Review like Anki:** spaced repetition with FSRS. A new day starts at 04:00 (adjustable). When you're done: review tomorrow's cards early, +10 new cards, or practice any set without changing the schedule.
- **Speak:** record yourself; the AI scores each word and gives tips for Hungarian speakers.
- **Languages:** Spanish, German, Norwegian, Italian, French, Portuguese, Dutch, Swedish, Polish. Turn them on in Settings → My languages.
- **Export:** CSV (Numbers/Excel), Anki, and full JSON backup.

## Updating the app on GitHub
Upload **all 10 files** from the zip (Add file → Upload files → Commit). Then open the app's link once in a Safari tab and reload, and reopen the Home Screen app.
To get the new icon, delete the Home Screen icon and add it again from Safari (Share → Add to Home Screen). Your words are not lost: they're stored in Safari, not in the icon.

## Notes
- Your API key and deck are stored only on this iPad. Back up regularly (Settings → Backup).
- Article links: works on many sites, but not on paywalled ones, and Google sometimes refuses to copy a whole article. Then use Safari → aA → Show Reader → select all → copy → paste.
- The code is plain HTML, CSS and JavaScript: `index.html`, `styles.css`, `app.js`, `fsrs.js`.
