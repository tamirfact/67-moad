#!/usr/bin/env node

/**
 * PDF Processing Script
 * Processes PDF files from a folder, extracts page images, converts to markdown,
 * and generates/updates data.json
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);
const pdf2md = require('@opendocsg/pdf2md');
import { pdf } from 'pdf-to-img';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = {
  pdfFolder: './pdfs',           // Input folder for PDFs
  outputDocsFolder: './docs',     // Output folder for page images
  outputJsonFile: './data.json',  // Output JSON file
  defaultWidth: 200,              // Default rectangle width
  defaultHeight: 280,              // Default rectangle height
  defaultActions: ['Send to Ori', 'Send to Slack channel'], // Default actions
  imageDPI: 150,                   // DPI for page images
  maxHeight: 900                    // Maximum height for documents (will scale proportionally)
};

/**
 * Extract page images from PDF using pdf-to-img
 */
async function extractPageImages(pdfPath, outputDir, baseName) {
  try {
    // Use pdf-to-img with high scale for quality text rendering
    const document = await pdf(pdfPath, { scale: 3.0 });
    
    const imagePaths = [];
    let pageNum = 1;
    
    // Iterate through all pages
    for await (const image of document) {
      // Save image as PNG
      const imagePath = path.join(outputDir, `${baseName}-${pageNum}.png`);
      await fs.writeFile(imagePath, image);
      
      // Return relative path from project root
      imagePaths.push(path.relative(__dirname, imagePath).replace(/\\/g, '/'));
      pageNum++;
    }
    
    return imagePaths;
  } catch (error) {
    console.error(`Error extracting images from ${pdfPath}:`, error.message);
    throw error;
  }
}

/**
 * Extract markdown from PDF
 */
async function extractMarkdown(pdfPath) {
  try {
    // @opendocsg/pdf2md requires a buffer
    const pdfBuffer = await fs.readFile(pdfPath);
    
    // pdf2md returns a Promise that resolves to a markdown string
    const markdown = await pdf2md(pdfBuffer);
    
    // Clean up markdown
    return cleanMarkdown(markdown);
  } catch (error) {
    console.warn(`Warning: Could not extract markdown from ${pdfPath}, using fallback:`, error.message);
    
    // Fallback: return a basic markdown structure
    return `# ${path.basename(pdfPath, '.pdf')}\n\n*Content extracted from PDF. Markdown conversion unavailable.*`;
  }
}

/**
 * Clean up markdown text
 */
function cleanMarkdown(text) {
  if (!text) return '';
  
  // Remove excessive whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  
  // Remove trailing whitespace from lines
  text = text.split('\n').map(line => line.trimEnd()).join('\n');
  
  // Fix common markdown issues
  text = text.replace(/\*\*\s+/g, '**');
  text = text.replace(/\s+\*\*/g, '**');
  
  return text.trim();
}

/**
 * Get image dimensions from first page
 */
async function getImageDimensions(imagePath) {
  try {
    const fullPath = path.join(__dirname, imagePath);
    if (await fs.pathExists(fullPath)) {
      // Use image-size for reading dimensions
      const imageSize = require('image-size');
      const dimensions = imageSize(fullPath);
      if (dimensions && dimensions.width && dimensions.height) {
        return {
          width: dimensions.width,
          height: dimensions.height
        };
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not read dimensions from ${imagePath}, using defaults`);
  }
  return {
    width: config.defaultWidth,
    height: config.defaultHeight
  };
}

/**
 * Generate document entry for data.json
 */
async function generateDocumentEntry(pdfInfo, images, markdown, existingIds, existingNames) {
  const baseName = pdfInfo.baseName;
  const name = baseName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  // Check if document already exists
  if (existingNames.has(name)) {
    console.log(`Document "${name}" already exists, skipping...`);
    return null;
  }
  
  // Generate new ID
  const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
  const id = maxId + 1;
  
  // Generate label from filename (capitalize words)
  const label = baseName
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  // Get actual image dimensions from first page
  const originalDimensions = images.length > 0 
    ? await getImageDimensions(images[0])
    : { width: config.defaultWidth, height: config.defaultHeight };
  
  // Scale dimensions if height exceeds maxHeight
  let dimensions = { ...originalDimensions };
  let scaleFactor = 1;
  if (dimensions.height > config.maxHeight) {
    scaleFactor = config.maxHeight / dimensions.height;
    dimensions = {
      width: Math.round(dimensions.width * scaleFactor),
      height: config.maxHeight
    };
  }
  
  // Generate random position (or could use grid layout)
  // Scale positions proportionally if document was scaled
  const baseX = Math.floor(Math.random() * 400) + 100;
  const baseY = Math.floor(Math.random() * 300) + 100;
  const x = Math.round(baseX * scaleFactor);
  const y = Math.round(baseY * scaleFactor);
  
  return {
    id,
    name,
    label,
    pages: images,
    width: dimensions.width,
    height: dimensions.height,
    x,
    y,
    actions: [...config.defaultActions],
    text: markdown
  };
}

/**
 * Read existing data.json
 */
async function readExistingData() {
  try {
    if (await fs.pathExists(config.outputJsonFile)) {
      const data = await fs.readJson(config.outputJsonFile);
      return data.rectangles || [];
    }
  } catch (error) {
    console.warn(`Warning: Could not read existing ${config.outputJsonFile}:`, error.message);
  }
  return [];
}

/**
 * Update data.json with new documents
 */
async function updateDataJson(newDocuments) {
  const existingDocuments = await readExistingData();
  
  // Get existing IDs and names
  const existingIds = existingDocuments.map(doc => doc.id);
  const existingNames = new Set(existingDocuments.map(doc => doc.name));
  
  // Filter out null entries (duplicates)
  const validNewDocuments = newDocuments.filter(doc => doc !== null);
  
  // Merge documents
  const allDocuments = [...existingDocuments, ...validNewDocuments];
  
  // Write updated JSON
  const output = {
    rectangles: allDocuments
  };
  
  // Create backup if file exists
  if (await fs.pathExists(config.outputJsonFile)) {
    const backupPath = config.outputJsonFile + '.backup';
    await fs.copy(config.outputJsonFile, backupPath);
    console.log(`Backup created: ${backupPath}`);
  }
  
  await fs.writeJson(config.outputJsonFile, output, { spaces: 2 });
  console.log(`\n✓ Updated ${config.outputJsonFile} with ${validNewDocuments.length} new document(s)`);
}

/**
 * Process a single PDF file
 */
async function processPdfFile(pdfPath) {
  const fileName = path.basename(pdfPath, '.pdf');
  const baseName = fileName;
  
  console.log(`\nProcessing: ${fileName}...`);
  
  try {
    // Extract images
    console.log('  Extracting page images...');
    const images = await extractPageImages(pdfPath, config.outputDocsFolder, baseName);
    console.log(`  ✓ Extracted ${images.length} page image(s)`);
    
    // Extract markdown
    console.log('  Extracting markdown...');
    const markdown = await extractMarkdown(pdfPath);
    console.log(`  ✓ Extracted markdown (${markdown.length} characters)`);
    
    return {
      baseName,
      images,
      markdown
    };
  } catch (error) {
    console.error(`  ✗ Error processing ${fileName}:`, error.message);
    throw error;
  }
}

/**
 * Main processing function
 */
async function main() {
  console.log('PDF Processing Script');
  console.log('====================\n');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  let pdfFolder = config.pdfFolder;
  
  if (args.includes('--folder') || args.includes('-f')) {
    const folderIndex = args.indexOf('--folder') !== -1 
      ? args.indexOf('--folder') 
      : args.indexOf('-f');
    if (args[folderIndex + 1]) {
      pdfFolder = args[folderIndex + 1];
    }
  }
  
  // Ensure output directories exist
  await fs.ensureDir(config.outputDocsFolder);
  
  // Check if PDF folder exists
  if (!await fs.pathExists(pdfFolder)) {
    console.log(`PDF folder "${pdfFolder}" does not exist. Creating it...`);
    await fs.ensureDir(pdfFolder);
    console.log(`\nPlease add PDF files to "${pdfFolder}" and run the script again.`);
    return;
  }
  
  // Find all PDF files
  const files = await fs.readdir(pdfFolder);
  const pdfFiles = files
    .filter(file => file.toLowerCase().endsWith('.pdf'))
    .map(file => path.join(pdfFolder, file));
  
  if (pdfFiles.length === 0) {
    console.log(`No PDF files found in "${pdfFolder}"`);
    return;
  }
  
  console.log(`Found ${pdfFiles.length} PDF file(s) to process\n`);
  
  // Read existing data
  const existingDocuments = await readExistingData();
  const existingIds = existingDocuments.map(doc => doc.id);
  const existingNames = new Set(existingDocuments.map(doc => doc.name));
  
  // Process each PDF
  const processedDocuments = [];
  const errors = [];
  
  for (const pdfFile of pdfFiles) {
    try {
      const pdfInfo = await processPdfFile(pdfFile);
      const document = await generateDocumentEntry(pdfInfo, pdfInfo.images, pdfInfo.markdown, existingIds, existingNames);
      
      if (document) {
        processedDocuments.push(document);
        existingIds.push(document.id);
        existingNames.add(document.name);
      }
    } catch (error) {
      errors.push({ file: pdfFile, error: error.message });
    }
  }
  
  // Update data.json
  if (processedDocuments.length > 0) {
    await updateDataJson(processedDocuments);
  } else {
    console.log('\nNo new documents to add.');
  }
  
  // Report errors
  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach(({ file, error }) => {
      console.log(`  ✗ ${path.basename(file)}: ${error}`);
    });
  }
  
  console.log('\n✓ Processing complete!');
}

// Run the script
main().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
