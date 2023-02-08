const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const puppeteer = require('puppeteer');
const https = require('https');
const gm = require('gm').subClass({imageMagick: true});
const fs = require('fs');
const path = require('path');

const data = {}

rl.question('Enter appID (ex. com.originatorkids.EndlessAlphabet): ', async (searchTerm) => {
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(searchTerm.trim())}`;

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(url);
  console.log(`Opened page: ${url}\n`);

  const spanElement = await page.$('h1 > span');
  const spanTitle = await page.evaluate(element => element.textContent, spanElement);
  const appTitle = spanTitle.trim()
  data['title'] = appTitle
  console.log(`Extracted title: ${appTitle}`);


  const element = await page.$('.l8YSdd > img');
  const attributeValue = await page.evaluate((el, attr) => el.getAttribute(attr), element, 'src');
  const thumbnailURL = attributeValue.replace('s48', 's512')
  const directory = appTitle;
  const webpPath = path.join(directory, 'app-thumbnail.webp');

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {recursive: true});
  }

  https.get(thumbnailURL, (response) => {
    response.pipe(fs.createWriteStream(webpPath));
  });

  data['thumbnailURL'] = thumbnailURL
  console.log(`Extracted thumbnail: ${thumbnailURL}`);

  await browser.close();
  rl.close();
});
