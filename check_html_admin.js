const fs = require('fs');
let html = fs.readFileSync('views/admin.ejs', 'utf8');

// Strip EJS tags for safe HTML parsing (there's only one <%= ... %> or <%- ... %> in admin.ejs actually, mostly Vue)
html = html.replace(/<%.*?%>/g, '');

let openTags = [];
let openLineNumbers = [];
const regex = /<\/?([a-zA-Z0-9]+)(>|\s[^>]*>)/g;
const selfClosing = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'path', 'svg', 'source', 'rect']);

let match;
while ((match = regex.exec(html)) !== null) {
    const isClosing = match[0].startsWith('</');
    const isSelfClosing = match[0].endsWith('/>') || match[0].includes('/>');
    const tagName = match[1].toLowerCase();

    // calculate line number
    const lineNum = html.substring(0, match.index).split('\n').length;

    if (selfClosing.has(tagName) || isSelfClosing) {
        continue;
    }

    if (tagName === 'body' && isClosing) {
        console.log("Open tags right before </body>:");
        for(let i=0; i<openTags.length; i++){
            console.log(openTags[i] + " at line " + openLineNumbers[i]);
        }
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
        openLineNumbers.push(lineNum);
    }
}
