const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const puppeteer = require('puppeteer');

rl.question('Enter appID (ex. com.originatorkids.EndlessAlphabet): ', async (searchTerm) => {
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(searchTerm)}`;

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(url);
  console.log(`Opened page: ${url}`);

  const spanElement = await page.$('h1 > span');
  const spanTitle = await page.evaluate(element => element.textContent, spanElement);
  console.log(`Extracted title: ${spanTitle}`);

  await browser.close();
  rl.close();
});
