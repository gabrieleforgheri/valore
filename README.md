# valore

Pagina "link in bio" self-hosted, in stile Linktree, con dashboard di amministrazione.
Express + EJS + SQLite. Gira nel CT 202 come server Pelican, porta `3011`.

## Avvio

```
npm install
npm start              # SERVER_PORT / PORT, default 3000
```

## Configurazione

| Variabile | Default | A cosa serve |
|---|---|---|
| `SERVER_PORT` / `PORT` | `3000` | porta di ascolto (Pelican imposta `SERVER_PORT`) |
| `ADMIN_PASSWORD` | vedi sotto | password di `/admin` |
| `SESSION_SECRET` | vedi sotto | firma del cookie di sessione |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | quali proxy fidare per l'IP reale; `false` per disattivare |
| `SECURE_COOKIES` | *(off)* | `1` quando il sito è servito solo in HTTPS |
| `PUBLIC_URL` | *(dedotto dalla richiesta)* | URL assoluto per `canonical` e Open Graph |

**Non esiste una password di default.** Se `ADMIN_PASSWORD` non è impostata, all'avvio
viene generata una password casuale in `secrets/admin-password.txt` (modo `600`) e
riusata a ogni riavvio. La cartella `secrets/` non è tracciata da git.

## Cose da sapere prima di fare deploy

**`data.json` non è in git.** Contiene il contenuto vivo della pagina — link, testi,
tema — e appartiene all'istanza in esecuzione, non al repository. Un checkout nuovo
lo crea da `data.default.json` al primo avvio.

> Finché `data.json` era tracciato, un `git pull` sul server sovrascriveva la pagina
> pubblicata con la copia del repo. Con `AUTO_UPDATE=1` sul server Pelican quel pull
> gira a ogni riavvio.

Stessa logica per `stats.db` e `secrets/`: stato dell'istanza, mai nel repo.

## CSS dell'admin

`views/admin.ejs` e `views/login.ejs` usano un foglio Tailwind precompilato. Dopo aver
toccato le classi in quei due file:

```
npm run build:css      # rigenera public/css/admin.css
```

Il file va committato. Non c'è nessuna CDN: le librerie dell'admin (Vue, SortableJS,
Chart.js) sono in `public/vendor/`, i font in `public/fonts/`. La pagina pubblica non
fa **nessuna** richiesta a terze parti.

## Struttura

```
index.js              server Express, API di tracciamento, route admin
views/index.ejs       pagina pubblica
views/admin.ejs       dashboard (Vue 3, monta su #app)
views/login.ejs       login
data.json             contenuto vivo (non tracciato)
data.default.json     seme per un'installazione nuova
public/css/c6f65...   CSS della pagina pubblica
public/css/admin.css  generato da npm run build:css
scrape.js             utility una tantum, non serve in produzione
```

`puppeteer`, `cheerio`, `jimp`, `website-scraper*` e `typescript` servono solo a
`scrape.js` e stanno in `devDependencies`: in produzione basta `npm install --omit=dev`,
che evita di scaricare ~300 MB di Chromium a ogni installazione.
