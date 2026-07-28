const fs = require('fs');
let html = fs.readFileSync('views/admin.ejs', 'utf8');
html = html.replace(/<%.*?%>/g, '');
const lines = html.split('\n');

let openTags = [];
let openLineNumbers = [];
const regex = /<\/?([a-zA-Z0-9]+)(>|\s[^>]*>)/g;
const selfClosing = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'path', 'svg', 'source', 'rect']);

for (let i = 0; i < lines.length; i++) {
    let match;
    while ((match = regex.exec(lines[i])) !== null) {
        const isClosing = match[0].startsWith('</');
        const isSelfClosing = match[0].endsWith('/>') || match[0].includes('/>');
        const tagName = match[1].toLowerCase();

        if (selfClosing.has(tagName) || isSelfClosing) {
            continue;
        }

        if (isClosing) {
            if (openTags.length > 0 && openTags[openTags.length - 1] === tagName) {
                openTags.pop();
                openLineNumbers.pop();
            } else {
                const idx = openTags.lastIndexOf(tagName);
                if(idx !== -1) {
                    openTags.splice(idx);
                    openLineNumbers.splice(idx);
                }
            }
        } else {
            openTags.push(tagName);
            openLineNumbers.push(i + 1);
        }
    }
    
    if (i + 1 === 581) {
        console.log("Open divs at line 581:", openLineNumbers.map((line, idx) => openTags[idx] + " @ " + line));
    }
}
