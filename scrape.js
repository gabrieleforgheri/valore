const scrape = require('website-scraper').default || require('website-scraper');
const PuppeteerPlugin = require('website-scraper-puppeteer').default;
const path = require('path');

const options = {
  urls: ['https://linktr.ee/rarestvalore'],
  directory: path.join(__dirname, 'public'),
  plugins: [
    new PuppeteerPlugin({
      launchOptions: { headless: 'new' },
      scrollToBottom: { timeout: 10000, viewportN: 10 },
    })
  ]
};

scrape(options).then((result) => {
  console.log("Scraping completed successfully.");
}).catch((err) => {
  console.error("Scraping failed:", err);
});
