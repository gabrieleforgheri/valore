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
| `YG_ADMIN_TOKEN` | vedi sotto | segreto condiviso col portale yG |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | quali proxy fidare per l'IP reale; `false` per disattivare |
| `PUBLIC_URL` | *(dedotto dalla richiesta)* | URL assoluto per `canonical` e Open Graph |

**L'admin non ha un proprio accesso.** Non c'è pagina di login, non c'è password e non
c'è sessione: `/admin` e `/preview` rispondono solo a chi presenta l'intestazione
`X-yG-Token`, ed è il portale [yG Hosting](https://yrb4g.com) a presentarla dopo aver
autenticato la persona con authentik e averne controllato il gruppo `svc-valore`.
L'amministrazione si apre da `yrb4g.com/account/valore`.

Il segreto sta in `secrets/admin-token` (modo `600`, non tracciato da git) oppure in
`YG_ADMIN_TOKEN`. **Se manca, l'admin è spento**, non aperto: un checkout nuovo non
espone niente.

A chi non ha il segreto la risposta è **404, non 403**: dal dominio pubblico quelle
rotte non risultano esistere, e `https://rarestvalore.com/admin` è indistinguibile da
un indirizzo sbagliato. Si è valutato di bloccarle anche in NPM: non è stato fatto
perché l'applicazione le chiude già da sé, e una regola scritta a mano in NPM sparisce
in silenzio al primo salvataggio di quell'host dall'interfaccia. Resta un'opzione se
un giorno si volesse che un segreto trapelato non basti da fuori casa.

## Cose da sapere prima di fare deploy

**`allowScripts` in `package.json` non è decorativo.** `better-sqlite3` si compila
all'installazione e senza quella voce l'installazione sul server salta lo script di
build. Era stata aggiunta **a mano sul server**, e il risultato è che ogni `git pull`
di `AUTO_UPDATE` si fermava su «Please commit your changes before you merge»: il
server è rimasto indietro per settimane senza che nulla lo dicesse. Ora sta nel repo,
dove appartiene. Se un giorno va cambiata, va cambiata **qui**.

**`data.json` non è in git.** Contiene il contenuto vivo della pagina — link, testi,
tema — e appartiene all'istanza in esecuzione, non al repository. Un checkout nuovo
lo crea da `data.default.json` al primo avvio.

> Finché `data.json` era tracciato, un `git pull` sul server sovrascriveva la pagina
> pubblicata con la copia del repo. Con `AUTO_UPDATE=1` sul server Pelican quel pull
> gira a ogni riavvio.

Stessa logica per `stats.db` e `secrets/`: stato dell'istanza, mai nel repo.

## CSS dell'admin

`views/admin.ejs` usa un foglio Tailwind precompilato. Dopo aver toccato le classi
in quel file:

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
views/admin.ejs       dashboard (Vue 3, monta su #app). Gli indirizzi si compongono
                      con `base`, il prefisso sotto cui il portale la monta: vuota,
                      la variabile lascia la pagina identica a com'era
data.json             contenuto vivo (non tracciato)
data.default.json     seme per un'installazione nuova
public/css/c6f65...   CSS della pagina pubblica
public/css/admin.css  generato da npm run build:css
scrape.js             utility una tantum, non serve in produzione
```

`puppeteer`, `cheerio`, `jimp`, `website-scraper*` e `typescript` servono solo a
`scrape.js` e stanno in `devDependencies`: in produzione basta `npm install --omit=dev`,
che evita di scaricare ~300 MB di Chromium a ogni installazione.
