const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const spawn = require('child_process').spawn
const { Parser } = require('json2csv');
const { randomBytes } = require('crypto');
const archiver = require('archiver');
archiver.registerFormat('zip-encrypted', require("archiver-zip-encrypted"));

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
  const fileName = `${appTitle} Full Version Unlocked`
  const fileFolder = path.join('apps', appTitle, 'file', fileName);
  const sizeInBytes = 1048576

  if (!fs.existsSync(fileFolder)) {
    fs.mkdirSync(fileFolder, {recursive: true});
    console.log(`Created directory: ${fileFolder}`);
  }

  const filePath = path.join(fileFolder, `${data['apkname']}.apk`)

  const buffer = randomBytes(sizeInBytes);
  await fs.promises.writeFile(filePath, buffer);
  console.log(`Dummy file created successfully!`);


  const textPath = path.join(fileFolder, 'Instructions.txt');
  const textContent = 'Instructions:\n\nTo extract the contents of this zip file, you will need a password.\nThe password is inside a text file named "Password.txt".\n\nYou can download "Password.txt" from here: https://filestrue.com/1313942';
  
  fs.writeFileSync(textPath, textContent);
  console.log(`Instruction file created successfully!`);

}


async function createZipFile(appTitle, data) {
  const fileName = `${appTitle} Full Version Unlocked`
  const fileFolder = path.join('apps', appTitle, 'file', fileName)
  const zipName = fileFolder + '.zip'

  // create a write stream for the output file
  const output = fs.createWriteStream(zipName);

  // create a new zip file
  const archive = archiver.create(
    'zip-encrypted',
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


(async () => {
  const data = {}
  const searchTerm = process.argv[2];
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(searchTerm.trim())}`;
  const browser = await puppeteer.launch({
    headless: true,
    slowMo: 250,
    devtools: true
  });
  const page = await browser.newPage();
  let imageList = []

  await page.goto(url);
  console.log(`Opened page: ${url}\n`);


  const apkName = searchTerm.trim()
  data['apkname'] = apkName
  console.log(`Extracted apkName: ${apkName}`);

  const appTitle = await getTitle(page)
  data['apptitle'] = appTitle
  console.log(`Extracted title: ${appTitle}`);

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

  // console.log(data, '\n')
  
  downloadAppImages(imageList, appTitle)
  .then(() => overlayImages(appTitle))
  .then(() => createVideoFromImages(appTitle))
  .then(() => concatVideos(appTitle))
  .then(() => insertData(data))
  .then(() => exportData())
  .then(() => createDummyFile(appTitle, data))
  .then(() => createZipFile(appTitle, data))
  .then(() => {
    console.log('All done!');
  })
  .catch((err) => {
    console.error('Error:', err);
  });
  

  await browser.close();
})();