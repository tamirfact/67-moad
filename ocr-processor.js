/**
 * OCR Processing Functions
 * Uses Tesseract.js to extract text from images
 */

/**
 * Extract text from image using Tesseract.js OCR
 */
export async function extractTextFromImage(imageFile) {
    try {
        // Check if Tesseract is available
        if (typeof Tesseract === 'undefined') {
            throw new Error('Tesseract.js is not loaded. Please check the library inclusion.');
        }
        
        // Show progress callback
        const progressCallback = (progress) => {
            if (progress.status === 'recognizing text') {
                const percent = Math.round(progress.progress * 100);
                // Progress will be handled by the caller
                console.log(`OCR Progress: ${percent}%`);
            }
        };
        
        // Run OCR
        const result = await Tesseract.recognize(
            imageFile,
            'eng', // Language: English
            {
                logger: progressCallback
            }
        );
        
        return result.data.text;
    } catch (error) {
        console.error('OCR Error:', error);
        throw new Error(`Failed to extract text from image: ${error.message}`);
    }
}

/**
 * Convert image file to data URL
 */
export function imageFileToDataUrl(imageFile) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
    });
}

/**
 * Process image file: extract text and convert to data URL
 */
export async function processImageFile(imageFile) {
    try {
        // Convert to data URL for storage
        const dataUrl = await imageFileToDataUrl(imageFile);
        
        // Extract text using OCR
        const extractedText = await extractTextFromImage(imageFile);
        
        return {
            dataUrl,
            text: extractedText.trim()
        };
    } catch (error) {
        console.error('Error processing image:', error);
        throw error;
    }
}

/**
 * Get image dimensions from data URL
 */
export function getImageDimensionsFromDataUrl(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            resolve({
                width: img.width,
                height: img.height
            });
        };
        img.onerror = function() {
            resolve({
                width: 400,
                height: 300
            });
        };
        img.src = dataUrl;
    });
}
