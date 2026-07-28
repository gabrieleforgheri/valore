const ejs = require('ejs');
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

// Provide all required defaults that index.js provides
if (!data.theme) {
    data.theme = {
        bgType: 'gradient',
        gradientDirection: 'to bottom',
        bgColor1: '#0B152C',
        bgColor2: '#4E769B',
        bgGlow: 'rgba(234,115,230,0.80)',
        bgGlowEnd: 'rgba(234,115,230,0.00)',
        fontColor: '#fce7ff',
        btnBg: 'transparent',
        btnText: '#fce7ff',
        btnRadius: '0',
        fontFamily: 'IBM Plex Sans'
    };
}
if (!data.socials) {
    data.socials = [
        { id: "1", platform: "youtube", url: "https://www.youtube.com/@rarestValore" },
        { id: "2", platform: "tiktok", url: "https://tiktok.com/@rarestvalore" },
        { id: "3", platform: "spotify", url: "https://open.spotify.com/intl-it/artist/3vO9rAZ7FTlGRwMKXtAerh?si=7Fsg43CTSrmze-xSQ5jTag" }
    ];
}

ejs.renderFile('views/index.ejs', data, function(err, str) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    fs.writeFileSync('rendered.html', str);
    console.log("Rendered to rendered.html");
});
