const fs = require('fs');
const html = fs.readFileSync('rendered.html', 'utf8');

let openTags = [];
const regex = /<\/?([a-zA-Z0-9]+)(>|\s[^>]*>)/g;
const selfClosing = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'path', 'svg', 'source', 'rect']);

let match;
while ((match = regex.exec(html)) !== null) {
    const isClosing = match[0].startsWith('</');
    const isSelfClosing = match[0].endsWith('/>');
    const tagName = match[1].toLowerCase();

    if (selfClosing.has(tagName) || isSelfClosing) {
        continue;
    }

    if (isClosing) {
        if (openTags.length > 0 && openTags[openTags.length - 1] === tagName) {
            openTags.pop();
        } else {
            console.log(`Mismatched closing tag: </${tagName}> at index ${match.index}. Last opened: <${openTags[openTags.length - 1]}>`);
            // Attempt to recover by removing until we match or ignoring
            const idx = openTags.lastIndexOf(tagName);
            if(idx !== -1) {
                openTags.splice(idx);
            }
        }
    } else {
        openTags.push(tagName);
    }
}
console.log("Unclosed tags remaining:", openTags);
