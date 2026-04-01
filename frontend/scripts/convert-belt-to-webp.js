/**
 * Script to convert belt PNG frames to WebP format with compression
 * Run with: node scripts/convert-belt-to-webp.js
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_DIR = path.join(__dirname, '../public/belt');
const OUTPUT_DIR = path.join(__dirname, '../public/compressedbeltimages');
const MAX_SIZE_KB = 70;
const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Get all PNG files sorted by frame number
const files = fs.readdirSync(INPUT_DIR)
  .filter(f => f.endsWith('.png'))
  .sort((a, b) => {
    const numA = parseInt(a.match(/frame_(\d+)\.png/)[1], 10);
    const numB = parseInt(b.match(/frame_(\d+)\.png/)[1], 10);
    return numA - numB;
  });

console.log(`Found ${files.length} PNG files to convert`);

async function convertFile(filename) {
  const inputPath = path.join(INPUT_DIR, filename);
  const outputFilename = filename.replace('.png', '.webp');
  const outputPath = path.join(OUTPUT_DIR, outputFilename);

  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Start with quality 80 and reduce until under size limit
    let quality = 80;
    let webpBuffer;

    do {
      webpBuffer = await image
        .resize(metadata.width, metadata.height, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();

      if (webpBuffer.length <= MAX_SIZE_BYTES) {
        break;
      }
      quality -= 5;
    } while (quality > 20);

    // If still too large, try reducing dimensions
    if (webpBuffer.length > MAX_SIZE_BYTES) {
      let scale = 0.9;
      while (webpBuffer.length > MAX_SIZE_BYTES && scale > 0.5) {
        webpBuffer = await sharp(inputPath)
          .resize(Math.floor(metadata.width * scale), Math.floor(metadata.height * scale), { fit: 'inside' })
          .webp({ quality: Math.min(quality, 70) })
          .toBuffer();
        scale -= 0.1;
      }
    }

    fs.writeFileSync(outputPath, webpBuffer);

    const originalSize = fs.statSync(inputPath).size;
    const newSize = webpBuffer.length;
    const savings = ((originalSize - newSize) / originalSize * 100).toFixed(1);

    return { filename, originalSize, newSize, savings, success: true };
  } catch (error) {
    console.error(`Error converting ${filename}:`, error.message);
    return { filename, error: error.message, success: false };
  }
}

async function convertAll() {
  console.log('Starting conversion...\n');
  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const result = await convertFile(file);
    results.push(result);

    if (result.success) {
      successCount++;
      console.log(`[${successCount}/${files.length}] ${file}: ${(result.newSize / 1024).toFixed(1)}KB (saved ${result.savings}%)`);
    } else {
      failCount++;
      console.log(`[FAIL] ${file}: ${result.error}`);
    }
  }

  console.log(`\nConversion complete!`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  // List output files
  const outputFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.webp'));
  const totalSize = outputFiles.reduce((sum, f) => sum + fs.statSync(path.join(OUTPUT_DIR, f)).size, 0);
  console.log(`\nOutput: ${outputFiles.length} WebP files, total ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
}

convertAll().catch(console.error);
