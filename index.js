const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');


async function getTitle(page) {
  const invalidChars = /[\\/:*?"<>|]/g;
  const spanElement = await page.$('h1 > span');
  const spanTitle = await page.evaluate(element => element.textContent, spanElement);
  const appTitle = spanTitle.trim().replace(invalidChars, "");
  return appTitle;
}

async function getDescription(page) {
  const descElement = await page.$('div[data-g-id="description"]');
  const description = await page.evaluate(element => element.innerHTML , descElement);
  return description;
}

async function getThumbnail(page) {
  const thumbnailElement = await page.$('.l8YSdd > img');
  const attributeValue = await page.evaluate((el, attr) => el.getAttribute(attr), thumbnailElement, 'src');
  const thumbnailURL = attributeValue.replace('s48', 's512');
  return [thumbnailURL];
}


async function getAppImages(page) {
  return await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('div[role="listitem"] img'));
    return images.map(img => img.getAttribute('src').replace('w526-h296', 'w2560-h1440'));
  });
}


async function downloadFile(url, path) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let downloadedImageBuffer = [];
      response.on('data', (chunk) => {
        downloadedImageBuffer.push(chunk);
      });
      response.on('end', () => {
        downloadedImageBuffer = Buffer.concat(downloadedImageBuffer);
        sharp(downloadedImageBuffer)
          .resize(1920, 1080, {
            kernel: sharp.kernel.lanczos3,
            fit: 'outside',
          })
          .webp()
          .toFile(path, (err, info) => {
            if (err) {
              console.error(err);
            } else {
              console.log(`Image converted and saved to: ${path}`);
            }
          })
        resolve()
      });
      response.on('error', reject);
    });
  });
}


async function downloadAppImages(imageList, appTitle, isThumbnail) {
  const directory = 'apps/' + appTitle;
  let i = 1;

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {recursive: true});
  }

  for (const imageUrl of imageList) {
    if (isThumbnail) {
      fileName = "app-thumbnail.webp"
    } else {
      fileName = `${i++}.webp`
    }
    const imagePath = path.join(directory, fileName);
    await downloadFile(imageUrl, imagePath);
  }
}

(async () => {
  const data = {}
  const searchTerm = process.argv[2];
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(searchTerm.trim())}`;
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(url);
  console.log(`Opened page: ${url}\n`);

  const appTitle = await getTitle(page)
  data['appTitle'] = appTitle
  console.log(`Extracted title: ${appTitle}`);

  const thumbURL = await getThumbnail(page)
  data['thumbURL'] = thumbURL
  console.log(`Extracted thumbnail: ${thumbURL.length}`);

  const appImages = await getAppImages(page)
  data['appImages'] = appImages
  console.log(`Extracted appImages: ${appImages.length}\n`);

  const description = await getDescription(page)
  data['appDesc'] = description
  console.log(`Extracted description: ${description.length}\n`);

  console.log(data, '\n')

  await downloadAppImages(thumbURL, appTitle, true)
  await downloadAppImages(appImages, appTitle, false)



  await browser.close();
})();