// Il muro davanti all'admin, in un file suo perche' abbia una prova che gira.
//
// Due funzioni pure, entrambe su un confine di fiducia: una decide se una
// richiesta e' del portale, l'altra ripulisce un valore che arriva da
// un'intestazione e finisce dentro gli `src` di una pagina.

const crypto = require('crypto');

// Confronto a tempo costante. Le lunghezze diverse escono subito: e' la
// lunghezza a trapelare, non il contenuto, e timingSafeEqual pretende
// comunque due buffer della stessa misura.
function tokenValido(presentato, atteso) {
    if (!presentato || !atteso) return false;
    const a = Buffer.from(String(presentato));
    const b = Buffer.from(String(atteso));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// Il prefisso sotto cui il portale monta l'admin (/account/valore/app).
// Deve restare un PERCORSO: niente schema, niente host, niente virgolette.
// `//evil.example` e' un indirizzo assoluto protocol-relative, e in un `src`
// porterebbe il browser altrove — per questo la doppia sbarra iniziale cade
// insieme a tutto il resto. Quello che non convince diventa stringa vuota,
// cioe' "nessun prefisso", che e' il modo in cui questo server ha sempre
// funzionato da solo.
function prefissoValido(grezzo) {
    const v = String(grezzo || '');
    if (!v) return '';
    if (v.startsWith('//')) return '';
    if (!/^\/[A-Za-z0-9._~\-\/]*$/.test(v)) return '';
    return v.replace(/\/+$/, '');
}

// L'indirizzo pubblico del sito, che il portale dichiara perche' da dentro il
// suo tramite non e' deducibile: il server vede arrivare la richiesta su
// 192.168.1.202:3011, e un "Vedi Sito" che punta la' e' un link rotto — oltre
// a mettere un indirizzo interno dentro una pagina. Vale solo per chi ha gia'
// presentato il segreto. Deve restare un'origine https, nient'altro.
function sitoValido(grezzo) {
    const v = String(grezzo || '');
    if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(v)) return '';
    return v;
}

module.exports = { tokenValido, prefissoValido, sitoValido };
