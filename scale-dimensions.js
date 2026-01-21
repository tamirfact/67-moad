#!/usr/bin/env node

/**
 * Scale Dimensions Script
 * Scales all document dimensions so max height is 900px, maintaining proportions
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataJsonPath = './data.json';
const MAX_HEIGHT = 900;

/**
 * Main function
 */
async function main() {
  console.log('Scaling document dimensions...\n');
  console.log(`Target max height: ${MAX_HEIGHT}px\n`);
  
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
  
  console.log(`Found ${documents.length} document(s) to scale\n`);
  
  let updatedCount = 0;
  
  // Scale each document
  for (const doc of documents) {
    const currentHeight = doc.height || 280;
    const currentWidth = doc.width || 200;
    const currentX = doc.x || 0;
    const currentY = doc.y || 0;
    
    // Calculate scale factor (only scale down if height > MAX_HEIGHT)
    let scaleFactor = 1;
    if (currentHeight > MAX_HEIGHT) {
      scaleFactor = MAX_HEIGHT / currentHeight;
    }
    
    // Apply scaling
    const newHeight = Math.round(currentHeight * scaleFactor);
    const newWidth = Math.round(currentWidth * scaleFactor);
    const newX = Math.round(currentX * scaleFactor);
    const newY = Math.round(currentY * scaleFactor);
    
    // Update document
    doc.height = newHeight;
    doc.width = newWidth;
    doc.x = newX;
    doc.y = newY;
    
    if (scaleFactor !== 1) {
      console.log(`${doc.name}:`);
      console.log(`  Size: ${currentWidth}x${currentHeight} → ${newWidth}x${newHeight} (scale: ${scaleFactor.toFixed(3)})`);
      console.log(`  Position: (${currentX}, ${currentY}) → (${newX}, ${newY})`);
      updatedCount++;
    } else {
      console.log(`${doc.name}: Already within limits (${currentWidth}x${currentHeight})`);
    }
  }
  
  // Create backup
  const backupPath = dataJsonPath + '.backup';
  await fs.copy(dataJsonPath, backupPath);
  console.log(`\nBackup created: ${backupPath}`);
  
  // Write updated JSON
  await fs.writeJson(dataJsonPath, data, { spaces: 2 });
  console.log(`\n✓ Scaled ${updatedCount} document(s)`);
  console.log('✓ Processing complete!');
}

main().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
