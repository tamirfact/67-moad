/**
 * Paste Handler
 * Handles clipboard paste events (CMD+V / CTRL+V)
 */

import { createTextDocument } from './text-processor.js';
import { processImageFile, getImageDimensionsFromDataUrl } from './ocr-processor.js';
import { getFirstLine } from './text-processor.js';

/**
 * Handle paste event
 */
export async function handlePaste(event, existingIds = [], existingNames = new Set(), onProgress = null) {
    const clipboardData = event.clipboardData || window.clipboardData;
    if (!clipboardData) {
        return null;
    }
    
    // Check for image first
    const items = Array.from(clipboardData.items);
    const imageItem = items.find(item => item.type.indexOf('image') !== -1);
    
    if (imageItem) {
        // Handle image paste
        const imageFile = imageItem.getAsFile();
        if (onProgress) onProgress('Processing image with OCR...');
        
        try {
            const { dataUrl, text } = await processImageFile(imageFile);
            
            if (onProgress) onProgress('Extracting image dimensions...');
            const dimensions = await getImageDimensionsFromDataUrl(dataUrl);
            
            // Apply height cap (50vh as per user's setting)
            const maxHeight = window.innerHeight * 0.5;
            let width = dimensions.width;
            let height = dimensions.height;
            
            if (height > maxHeight) {
                const scaleFactor = maxHeight / height;
                width = Math.round(width * scaleFactor);
                height = Math.round(maxHeight);
            }
            
            // Generate document
            const firstLine = getFirstLine(text) || 'Pasted Image';
            const name = firstLine
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-')
                .substring(0, 50) || 'pasted-image';
            
            // Ensure unique name
            let uniqueName = name;
            let counter = 1;
            while (existingNames.has(uniqueName)) {
                uniqueName = `${name}-${counter}`;
                counter++;
            }
            
            const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
            const id = maxId + 1;
            
            const x = Math.floor(Math.random() * 400) + 100;
            const y = Math.floor(Math.random() * 300) + 100;
            
            return {
                id,
                name: uniqueName,
                label: firstLine,
                type: 'pasted-image',
                pages: [dataUrl], // Store image as data URL
                width,
                height,
                x,
                y,
                text: text, // OCR extracted text for AI
                actions: ['Send to Ori', 'Send to Slack channel'],
                isPasted: true
            };
        } catch (error) {
            console.error('Error processing pasted image:', error);
            throw error;
        }
    }
    
    // Handle text paste
    const text = clipboardData.getData('text/plain');
    if (text && text.trim()) {
        if (onProgress) onProgress('Processing text...');
        return createTextDocument(text, existingIds, existingNames);
    }
    
    return null;
}

/**
 * Setup paste event listener on element
 */
export function setupPasteListener(element, callback, onProgress = null) {
    element.addEventListener('paste', async function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        try {
            // Get existing IDs and names from callback context
            // This will be provided by the caller
            const document = await handlePaste(event, [], new Set(), onProgress);
            
            if (document) {
                callback(document);
            }
        } catch (error) {
            console.error('Paste error:', error);
            if (onProgress) {
                onProgress(`Error: ${error.message}`);
            }
        }
    });
}
