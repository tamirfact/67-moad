#!/usr/bin/env node

/**
 * Update Dimensions Script
 * Updates width and height in data.json to match actual image dimensions
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataJsonPath = './data.json';

/**
 * Get image dimensions
 */
async function getImageDimensions(imagePath) {
  try {
    const fullPath = path.join(__dirname, imagePath);
    if (await fs.pathExists(fullPath)) {
      // Use image-size library for reading dimensions
      const imageSize = require('image-size');
      const dimensions = imageSize(fullPath);
      if (dimensions && dimensions.width && dimensions.height) {
        return {
          width: dimensions.width,
          height: dimensions.height
        };
      }
    } else {
      console.warn(`  Warning: Image not found: ${imagePath}`);
    }
  } catch (error) {
    console.warn(`  Warning: Could not read dimensions from ${imagePath}:`, error.message);
  }
  return null;
}

/**
 * Main function
 */
async function main() {
  console.log('Updating document dimensions...\n');
  
  // Read data.json
  if (!await fs.pathExists(dataJsonPath)) {
    console.error(`Error: ${dataJsonPath} not found`);
    process.exit(1);
  }
  
  const data = await fs.readJson(dataJsonPath);
  const documents = data.rectangles || [];
  
  if (documents.length === 0) {
    console.log('No documents found in data.json');
    return;
  }
  
  console.log(`Found ${documents.length} document(s) to update\n`);
  
  let updatedCount = 0;
  
  // Update each document
  for (const doc of documents) {
    if (doc.pages && doc.pages.length > 0) {
      const firstPage = doc.pages[0];
      console.log(`Updating ${doc.name}...`);
      
      const dimensions = await getImageDimensions(firstPage);
      
      if (dimensions) {
        const oldWidth = doc.width;
        const oldHeight = doc.height;
        doc.width = dimensions.width;
        doc.height = dimensions.height;
        
        if (oldWidth !== dimensions.width || oldHeight !== dimensions.height) {
          console.log(`  ✓ Updated: ${oldWidth}x${oldHeight} → ${dimensions.width}x${dimensions.height}`);
          updatedCount++;
        } else {
          console.log(`  - Already correct: ${dimensions.width}x${dimensions.height}`);
        }
      }
    }
  }
  
  // Create backup
  const backupPath = dataJsonPath + '.backup';
  await fs.copy(dataJsonPath, backupPath);
  console.log(`\nBackup created: ${backupPath}`);
  
  // Write updated JSON
  await fs.writeJson(dataJsonPath, data, { spaces: 2 });
  console.log(`\n✓ Updated ${updatedCount} document(s)`);
  console.log('✓ Processing complete!');
}

main().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
