# Lingua – your Spanish & German tutor (iPad app)

Free, private, runs in Safari and installs on your Home Screen. Explanations in English.

## What it does
- **Learn**: paste a YouTube link (or any text) → vocabulary with articles, idioms (with literal meaning), grammar points, all with examples from the video. Tap ＋ to add a card, "Known" to never see a word again.
- **Find something to watch**: type a topic → YouTube searches and channels at your level.
- **Review**: spaced-repetition flashcards using FSRS (the algorithm modern Anki uses).
- **Speak**: record yourself; the AI scores each word and gives tips for Hungarian speakers. Links to YouGlish and Forvo let you hear real native speakers.
- **Words**: browse or delete cards; Settings has backup/restore and export to Anki.

## Setup (about 10 minutes, all on the iPad)
1. **Get a free Gemini key:** go to aistudio.google.com/apikey, sign in with Google and tap *Create API key*. Copy it.
2. **Host the app for free on GitHub Pages:**
   1. Create a free account at github.com.
   2. Tap *New repository*, name it `lingua`, make it **Public**, then tap *Create*.
   3. Tap *uploading an existing file*, unzip `lingua.zip` in the Files app, and upload **all 10 files**. Tap *Commit*.
   4. Go to *Settings → Pages*, set Source to *Deploy from a branch*, Branch to `main` / `(root)`, and tap *Save*.
   5. After about 1 minute your app is live at `https://YOUR-USERNAME.github.io/lingua/`.
3. **Install it:** open that link in **Safari**, tap Share → *Add to Home Screen*.
4. Open Lingua, paste your key in Settings and pick your levels.
5. **Optional, for better voices:** iPad Settings → Accessibility → Spoken Content → Voices → Spanish / German, download an *Enhanced* or *Premium* voice.

## Costs
- Hosting on GitHub Pages: free.
- Gemini API free tier: free, with daily limits. If you hit them, switch to the *Lite* model in Settings or wait. Note: Google may use free-tier data to improve its products.
- Optional: turning on billing in Google AI Studio for heavier use typically costs a few euros a month, well under €20.

## Notes
- Your API key and deck are stored only on this iPad. Back up regularly (Settings → Backup) to Files / iCloud Drive.
- YouTube analysis works with public videos.
- Editing: the code is plain HTML, CSS and JavaScript (`index.html`, `styles.css`, `app.js`, `fsrs.js`). Change a file on GitHub and the app updates on the next launch.
