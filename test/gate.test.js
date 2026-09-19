const test = require('node:test');
const assert = require('node:assert');
const { tokenValido, prefissoValido, sitoValido } = require('../admin-gate');

test('senza segreto atteso non entra nessuno', () => {
    // Il caso del checkout nuovo: se il file manca, l'admin e' spento, non
    // aperto. Anche una stringa vuota da entrambe le parti deve fallire.
    assert.equal(tokenValido('qualsiasi', null), false);
    assert.equal(tokenValido('qualsiasi', ''), false);
    assert.equal(tokenValido('', ''), false);
    assert.equal(tokenValido(null, 'segreto'), false);
});

test('il segreto giusto entra, uno sbagliato no', () => {
    assert.equal(tokenValido('abc123', 'abc123'), true);
    assert.equal(tokenValido('abc124', 'abc123'), false);
    // Lunghezza diversa: il confronto a tempo costante pretende due buffer
    // uguali, quindi questo caso deve uscire prima e non sollevare.
    assert.equal(tokenValido('abc', 'abc123'), false);
    assert.equal(tokenValido('abc123456', 'abc123'), false);
});

test('il prefisso resta un percorso', () => {
    assert.equal(prefissoValido('/account/valore/app'), '/account/valore/app');
    assert.equal(prefissoValido('/account/valore/app/'), '/account/valore/app');
    assert.equal(prefissoValido(''), '');
    assert.equal(prefissoValido(undefined), '');
});

test('tutto cio che non e un percorso diventa nessun prefisso', () => {
    // Protocol-relative: dentro un src porterebbe il browser su un altro host.
    assert.equal(prefissoValido('//evil.example'), '');
    assert.equal(prefissoValido('https://evil.example'), '');
    assert.equal(prefissoValido('javascript:alert(1)'), '');
    // Chiudere l'attributo e aprirne un altro.
    assert.equal(prefissoValido('/a"><script>'), '');
    assert.equal(prefissoValido("/a'"), '');
    // Senza sbarra iniziale non e' un percorso assoluto.
    assert.equal(prefissoValido('account/valore'), '');
    assert.equal(prefissoValido('/a b'), '');
});

test("l'indirizzo pubblico deve essere un'origine https", () => {
    assert.equal(sitoValido('https://rarestvalore.com'), 'https://rarestvalore.com');
    // Niente percorso, niente porta, niente virgolette: finisce in un href.
    assert.equal(sitoValido('https://evil.example/"><script>'), '');
    assert.equal(sitoValido('http://rarestvalore.com'), '');
    assert.equal(sitoValido('javascript:alert(1)'), '');
    assert.equal(sitoValido(''), '');
    assert.equal(sitoValido(undefined), '');
});
