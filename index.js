// require('dotenv').config()
// const email = process.env.EMAIL
// const password = process.env.PASSWORD

const readline = require('readline');
const {executablePath} = require('puppeteer')
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const spawn = require('child_process').spawn
const { Parser } = require('json2csv');
const { randomBytes } = require('node:crypto');
const archiver = require('archiver');
archiver.registerFormat('zip-encrypted', require("archiver-zip-encrypted"));

const { google } = require('googleapis');
const { promisify } = require('util');
const { readFile } = require('fs').promises;

const knex = require('knex')({
  client: 'pg',
  connection: {
    host: 'localhost',
    user: 'postgres',
    password: 'postgres',
    database: 'ytcampaign',
  },
});


// getting data
async function getUserInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function checkEnv() {
  // Check if .env file exists
  if (fs.existsSync('.env')) {
    require('dotenv').config();
    return;
  }

  // If .env file does not exist, prompt user for email and password
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const email = await new Promise((resolve) => {
    rl.question('Enter your email: ', (answer) => {
      resolve(answer);
    });
  });

  const password = await new Promise((resolve) => {
    rl.question('Enter your password: ', (answer) => {
      resolve(answer);
    });
  });

  rl.close();

  // Write email and password to .env file
  const envString = `EMAIL='${email}'\nPASSWORD='${password}'\n`;
  fs.writeFileSync('.env', envString);

  // Load environment variables from .env file
  require('dotenv').config();
}

async function checkLogin(page, url) {
  const profileElement = await page.$('.VfPpkd-Bz112c-LgbsSe > img');
  const attributeValue = await page.evaluate((el, attr) => el.getAttribute(attr), profileElement, 'src');
  
  if (attributeValue.includes('anonymous')) {
    console.log(`You are not logged in`);

    await checkEnv()

    await page.goto('https://accounts.google.com/Login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"]', process.env.EMAIL);
    await page.click('#identifierNext');
    await page.waitForSelector('input[type="password"]', { visible: true });
    await page.type('input[type="password"]', process.env.PASSWORD);
    await page.click('#passwordNext');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    await page.waitForSelector('text/Welcome', { visible: true });
    console.log('Welcome, you are now logged in')

    await page.goto(url);
    console.log(`Reopened page: ${url}\n`);

  } else {
    console.log(`You are logged in`);
  }
}

async function getFileSize(page) {
  const reviewBtn = await page.$$('text/arrow_forward');
  await reviewBtn[0].click();
  await new Promise(resolve => setTimeout(resolve, 1000));
  const downloadSizeText = await page.$eval('div.D1uV5e + div.G1zzid > div:nth-child(4) > div.reAt0', div => div.textContent.trim().split(' ')[0]);
  
  await page.evaluate(() => {
    const elements = document.querySelectorAll('.google-material-icons.VfPpkd-kBDsod');
    const clearElement = Array.from(elements).find(e => e.innerText === 'clear');
    clearElement.click();
  });

  return downloadSizeText
}

async function getTitle(page) {
  const invalidChars = /[\\/:*?"'<>|]/g;
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
  return thumbnailURL;
}

async function getAppImages(page) {
  return await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('div[role="listitem"] img'));
    return images.map(img => img.getAttribute('src').replace('w526-h296', 'w2560-h1440'));
  });
}

async function getComments(page) {
  const reviewBtn = await page.waitForSelector('text/See all reviews');
  await reviewBtn.click();
  await new Promise(resolve => setTimeout(resolve, 1000));

  const elements = await page.$$eval('.RHo1pe', elements => {
    return elements.filter(element => {
      const ariaLabel = element.querySelector('.Jx4nYe div').getAttribute('aria-label');
      return ariaLabel === 'Rated 5 stars out of five stars';
    }).map(element => element.querySelector('.h3YV2d').textContent.trim() + '\n');
  });

  await page.evaluate(() => {
    const elements = document.querySelectorAll('.google-material-icons.VfPpkd-kBDsod');
    const clearElement = Array.from(elements).find(e => e.innerText === 'clear');
    clearElement.click();
  });

  
  return elements
}

// store data to postgres
async function insertData(data) {
  
  // Check if the appTitle already exists in the database
  knex('apps')
    .select('apptitle')
    .where('apptitle', data['apptitle'])
    .then(rows => {
      if (rows.length === 0) {
        // If the appTitle doesn't exist, insert a new row
        return knex('apps')
        .insert(data)
        .then(() => console.log('Data inserted into database'))
        .catch((error) => console.error(error));
      }
    })
    .finally(() => {
      knex.destroy();
    });
  
}

async function viewData() {
  knex('apps')
  .select()
  .then(rows => {
    console.log(`Total app entries: ${rows.length}`);
  })
  .finally(() => {
    knex.destroy();
  });
}

async function exportData() {
  knex.select('*')
  .from('apps')
  .then(rows => {
    const json2csvParser = new Parser({ header: true });
    let csvData = '';
    if (rows.length > 0) {
      csvData = json2csvParser.parse(rows);
    }

    fs.writeFile('data.csv', csvData, (err) => {
      if (err) throw err;
      console.log('Data exported to CSV file successfully');
    });
  })
  .catch(err => console.log(err))
  .finally(() => knex.destroy());
}


// creating files
async function downloadFile(url, path) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      let downloadedImageBuffer = [];
      response.on('data', (chunk) => {
        downloadedImageBuffer.push(chunk);
      });
      response.on('end', () => {
        downloadedImageBuffer = Buffer.concat(downloadedImageBuffer);
        sharp(downloadedImageBuffer)
          .resize(1920, 1080, {
            kernel: sharp.kernel.lanczos3,
            fit: 'contain',
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

async function downloadAppImages(imageList, appTitle) {
  const directory = path.join('apps', appTitle);
  let i = 0;

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {recursive: true});
    console.log(`Created directory: ${directory}`);
  }

  for (const imageUrl of imageList) {
    const imagePath = path.join(directory, `${i++}.webp`);
    await downloadFile(imageUrl, imagePath);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function overlayImages(appTitle) {
  // Read files from input folder
  const inputFolder = path.join('apps', appTitle);
  const inputFiles = fs.readdirSync(inputFolder);
  console.log(`\nFound ${inputFiles.length} files in ${inputFolder}`);

  // Read files from overlay folder
  const overlayFolder = 'overlays/PNG'
  const overlayFiles = fs.readdirSync(overlayFolder);
  console.log(`Found ${overlayFiles.length} files in ${overlayFolder}`);

  // Create output folder if it doesn't exist
  const outputFolder = path.join(inputFolder, 'output');
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
    console.log(`Created directory: ${outputFolder}`);
  }

  for (let i = 0; i < inputFiles.length; i++) {
    const inputFile = inputFiles[i];
    const inputPath = path.join(inputFolder, inputFile);

    // Check if the file is an image
    if (inputFile.match(/\.(jpg|jpeg|png|webp)$/i)) {

      // Choose a random overlay file
      const overlayFile = overlayFiles[Math.floor(Math.random() * overlayFiles.length)];
      const overlayPath = path.join(overlayFolder, overlayFile);

      // Load both images using Sharp
      const inputImage = sharp(inputPath);
      const overlayImage = sharp(overlayPath);

      // Overlay the images
      const topRand = Math.floor(Math.random() * 780)
      const leftRand = Math.floor(Math.random() * 1000)
      const outputImage = await inputImage
        .composite([{ input: await overlayImage.toBuffer()}])
        .toBuffer();

      // Save the output image to the output folder
      const outputPath = path.join(outputFolder, inputFile);
      await sharp(outputImage).toFile(outputPath);
      console.log(`Saved file: ${outputPath}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function createVideoFromImages(appTitle) {
  const imageDirectory = path.join('apps', appTitle, 'output');
  const outputVideoPath = path.join('apps', appTitle, 'video');

  if (!fs.existsSync(outputVideoPath)) {
    fs.mkdirSync(outputVideoPath);
    console.log(`Created directory: ${outputVideoPath}`);
  }

  const imageFiles = fs.readdirSync(imageDirectory).filter(file => file.endsWith('.webp'));

  for (let i = 0; i < imageFiles.length; i++) {
    let index = i + 1
    const file = imageFiles[i];
    const inputFilePath = path.join(imageDirectory, file);
    const outputFilePath = path.join(outputVideoPath, `vid${index.toString().padStart(2, '0')}.mp4`);
    const randDuration = Math.floor(Math.random() * 3) + 3;

    // Create FFmpeg command to create the video from images
    const ffmpeg = spawn('ffmpeg', [
      '-y', // overwrite existing file
      '-loop', '1', // loop the input image
      '-i', `${inputFilePath}`, // input file
      '-c:v', 'libx264', // video codec
      '-t', `${randDuration}`, // video duration
      '-pix_fmt', 'yuv420p', // pixel format
      '-crf', '18', // Constant Rate Factor (lower is higher quality, 18-28 is a good range)
      '-preset', 'veryslow', // slower encoding for better compression
      '-s', '1920x1080', // resize videos
      outputFilePath // output file path
    ]);

    // Print FFmpeg output to console
    ffmpeg.stdout.on('data', data => console.log(data.toString()));
    ffmpeg.stderr.on('data', data => console.error(data.toString()));

    // Wait for FFmpeg to finish
    await new Promise((resolve, reject) => {
      ffmpeg.on('exit', (code) => {
        if (code === 0) {
          console.log(`Video created: ${outputFilePath}`);
          resolve();
        } else {
          reject(new Error(`FFmpeg error: exit code ${code}`));
        }
      });
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await new Promise((resolve, reject) => {
    fs.readdir(imageDirectory, (err, files) => {
      if (err) {
        reject(err);
      } else {
        files.forEach(file => {
          fs.unlinkSync(`${imageDirectory}/${file}`);
        });
        console.log(`All files in ${imageDirectory} have been deleted.`);
        resolve();
      }
    });
  });

}

async function concatVideos(appTitle) {
  const videoPath = path.join('apps', appTitle, 'video');
  const outputFilePath = path.join('apps', appTitle, 'output.mp4');
  const musicPath = path.join('music');

  // Get all music files
  const musicFiles = await fs.promises.readdir(musicPath);
  const randomMusicFile = musicFiles[Math.floor(Math.random() * musicFiles.length)];
  const chosenMusic = path.join(musicPath, randomMusicFile)

  
  // Create videos.txt
  fs.promises.readdir(videoPath)
    .then(files => {
      const outputVideoTxt = path.join('apps', appTitle, 'videos.txt')
      const videoPaths = files
        .filter(file => file.endsWith('.mp4'))
        .map(file => `file '${path.join('video', file)}'`)
        .join('\n');
      
      return fs.promises.writeFile(outputVideoTxt, videoPaths);

    })
    .then(() => console.log('videos.txt file created successfully!'))
    .catch(error => console.error(`Error creating videos.txt: ${error}`));

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create FFmpeg command to concatenate input files
  const txtFilePath = path.join('apps', appTitle, 'videos.txt');
  const ffmpeg = spawn('ffmpeg', [
    '-y', // overwrite output file if it exists
    '-f', 'concat', // format
    '-safe', '0', // allow any file name
    '-i', `${txtFilePath}`, // input files
    '-stream_loop', '-1', //loop music
    '-i', `${chosenMusic}`, // music01.mp3
    // '-filter_complex', '[1:a]volume=0.3[a1];[0:a][a1]amerge=inputs=2[a]', // adjust volume of audio to 50%
    '-shortest', // end loop music as video ends
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy', // copy codec
    outputFilePath // output file path
  ]);

  // Print FFmpeg output to console
  ffmpeg.stdout.on('data', data => console.log(data.toString()));
  ffmpeg.stderr.on('data', data => console.error(data.toString()));

  // Wait for FFmpeg to finish
  await new Promise((resolve, reject) => {
    ffmpeg.on('exit', (code) => {
      if (code === 0) {
        console.log(`Video created: ${outputFilePath}`);
        resolve();
      } else {
        reject(new Error(`FFmpeg error: exit code ${code}`));
      }
    });
  });


  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await new Promise((resolve, reject) => {
    fs.readdir(videoPath, (err, files) => {
      if (err) {
        reject(err);
      } else {
        files.forEach(file => {
          fs.unlinkSync(`${videoPath}/${file}`);
        });
        console.log(`All files in ${videoPath} have been deleted.`);
        resolve();
      }
    });
  });

}

async function createDummyFile(appTitle, data) {
  const fileName = `${appTitle} Full Version Unlocked`;
  const fileFolder = path.join('apps', appTitle, 'file', fileName);
  const sizeInBytes = parseInt(data['filesize']) * 1048576;

  if (!fs.existsSync(fileFolder)) {
    fs.mkdirSync(fileFolder, {recursive: true});
    console.log(`Created directory: ${fileFolder}`);
  }

  const filePath = path.join(fileFolder, `${data['apkname']}.apk`);

  const buffer = randomBytes(sizeInBytes);
  await fs.promises.writeFile(filePath, buffer);
  console.log(`Dummy file created successfully!`);

  const password = 'V9R7Abj9!aq#';
  const zipPath = path.join(fileFolder, `[MOD] ${data['apkname']}.zip`);
  const output = fs.createWriteStream(zipPath);

  const archive = archiver.create(
    'zip-encrypted',
    {zlib: {level: 8},
    encryptionMethod: 'aes256',
    password: password});

  archive.pipe(output);
  archive.file(filePath, {name: `${data['apkname']}.apk`});
  await archive.finalize();

  console.log(`Encrypted zip file created successfully!`);

  fs.unlinkSync(filePath);
  console.log(`Original file deleted successfully!`);

  const textPath = path.join(fileFolder, 'Instructions.txt');
  const textContent = 'Instructions:\n\nTo extract the contents of this zip file, you will need a password.\nThe password is inside a text file named "Password.txt".\n\nYou can download "Password.txt" from here: https://filestrue.com/1313942';

  fs.writeFileSync(textPath, textContent);
  console.log(`Instruction file created successfully!`);
}

async function createZipFile(appTitle) {
  const fileName = `${appTitle} Full Version Unlocked`
  const fileFolder = path.join('apps', appTitle, 'file', fileName)
  const zipName = fileFolder + '.zip'

  // create a write stream for the output file
  const output = fs.createWriteStream(zipName);

  // create a new zip file
  const archive = archiver.create(
    'zip',
    {zlib: {level: 8},
    encryptionMethod: 'aes256',
    password: 'V9R7Abj9!aq#'});

  // pipe the archive to the output file
  archive.pipe(output);

  // add the folder to the archive
  archive.directory(fileFolder, false);

  // finalize the archive
  archive.finalize();

  // listen for the 'close' event on the output file stream
  output.on('close', function() {
    console.log(archive.pointer() + ' total bytes');
    console.log('Archiver has been finalized and the output file descriptor has closed.');

    fs.rmSync(fileFolder, { recursive: true, force: true }, (err) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log('File folder deleted successfully!');
    });

  })
}


// GOOGLE DRIVE
async function uploadFileToDrive(appTitle) {
  // Load the credentials JSON file
  const credentials = await readFile('yt-campaign-eeeb3d9fe81a.json', 'utf8');

  // Authenticate with the Google Drive API using a service account
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentials),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  // Create a new Drive instance
  const drive = google.drive({ version: 'v3', auth });

  try {
    // Get the ID of the 'premiumunlockedapk' folder
    const folderName = 'premiumunlockedapk';
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    const folderResponse = await drive.files.list({
      resource: fileMetadata,
      fields: 'id',
    });
    const folderId = folderResponse.data.id;

    console.log(folderId)

  } catch (error) {
    console.error(error);
  }
}


(async () => {

  const searchTerm = await getUserInput('Enter app name (ex. com.microsoft.office.excel): ');
  const data = {}
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(searchTerm.trim())}`;
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--window-size=375,667`],
    defaultViewport: {
      width:375,
      height:667
    },
    slowMo: 1000,
    devtools: true,
    executablePath: executablePath(),
    userDataDir: "./user_data"
  });
  const page = await browser.newPage();



  // console.log(`Testing the stealth plugin..`)
  // await page.goto('https://bot.sannysoft.com')
  // await page.waitForTimeout(5000)
  // await page.screenshot({ path: 'stealth.png', fullPage: true })

  await page.goto(url);
  console.log(`Opening page: ${url}\n`);

  // await uploadFileToDrive('Wolfoo Making Crafts -Handmade')

  await checkLogin(page, url)

  await getComments(page)

  const fileSize = await getFileSize(page)
  data['filesize'] = fileSize
  console.log(`Extracted file size: ${fileSize}`);

  const apkName = searchTerm.trim()
  data['apkname'] = apkName
  console.log(`Extracted apkName: ${apkName}`);

  const appTitle = await getTitle(page)
  data['apptitle'] = appTitle
  console.log(`Extracted title: ${appTitle}`);

  let imageList = []
  const thumbURL = await getThumbnail(page)
  imageList.push(thumbURL)
  console.log(`Extracted thumbnail: ${imageList.length}`);

  const appImages = await getAppImages(page)
  imageList = imageList.concat(appImages)
  data['images'] = imageList
  console.log(`Extracted appImages: ${appImages.length}`);

  const description = await getDescription(page)
  data['appdesc'] = description
  console.log(`Extracted description: ${description.length}`);

  const comments = await getComments(page)
  data['comments'] = comments
  console.log(`Extracted comments: ${comments.length}`);

  console.log(data, '\n')

  downloadAppImages(imageList, appTitle)
  .then(() => overlayImages(appTitle))
  .then(() => createVideoFromImages(appTitle))
  .then(() => concatVideos(appTitle))
  // .then(() => insertData(data))
  // .then(() => exportData())
  .then(() => createDummyFile(appTitle, data))
  .then(() => createZipFile(appTitle))
  .then(() => {
    console.log('All done!');
  })
  .catch((err) => {
    console.error('Error:', err);
  });
  

  await browser.close();
})();