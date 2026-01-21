/**
 * PDF Processing Functions
 * Uses PDF.js to extract images and text from PDFs
 */

// Set PDF.js worker path (will be set when PDF.js loads)
// This will be called after PDF.js is loaded
function initializePdfJs() {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
}

// Initialize when module loads (PDF.js should already be loaded)
if (typeof window !== 'undefined') {
    if (typeof pdfjsLib !== 'undefined') {
        initializePdfJs();
    } else {
        // Wait for PDF.js to load
        window.addEventListener('load', initializePdfJs);
    }
}

/**
 * Extract page images from PDF
 * Returns array of data URLs
 */
export async function extractPageImages(pdfFile, scale = 2.0) {
    try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        const imageDataUrls = [];
        const numPages = pdf.numPages;
        
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            
            // Create canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Render PDF page to canvas
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // Convert to data URL (use JPEG with compression for smaller size)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            imageDataUrls.push(dataUrl);
        }
        
        return imageDataUrls;
    } catch (error) {
        console.error('Error extracting page images:', error);
        throw error;
    }
}

/**
 * Extract text content from PDF
 */
export async function extractText(pdfFile) {
    try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        const textContent = [];
        const numPages = pdf.numPages;
        
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const text = await page.getTextContent();
            
            // Combine text items into a single string
            const pageText = text.items
                .map(item => item.str)
                .join(' ');
            
            textContent.push(pageText);
        }
        
        return textContent.join('\n\n');
    } catch (error) {
        console.error('Error extracting text:', error);
        throw error;
    }
}

/**
 * Convert extracted text to markdown
 * Simple conversion - preserves structure
 */
export function textToMarkdown(text) {
    if (!text) return '';
    
    // Split into paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    
    // Convert to markdown
    let markdown = '';
    
    paragraphs.forEach(paragraph => {
        const trimmed = paragraph.trim();
        if (!trimmed) return;
        
        // Check if it looks like a heading (short, all caps, or ends with colon)
        if (trimmed.length < 100 && (
            trimmed === trimmed.toUpperCase() ||
            trimmed.endsWith(':') ||
            /^[A-Z][^.!?]*$/.test(trimmed)
        )) {
            markdown += `## ${trimmed}\n\n`;
        } else {
            markdown += `${trimmed}\n\n`;
        }
    });
    
    return markdown.trim();
}

/**
 * Clean markdown text
 */
export function cleanMarkdown(text) {
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
 * Get image dimensions from data URL
 */
export function getImageDimensions(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            resolve({
                width: img.width,
                height: img.height
            });
        };
        img.onerror = function() {
            // Default dimensions if image fails to load
            resolve({
                width: 200,
                height: 280
            });
        };
        img.src = dataUrl;
    });
}

/**
 * Process a PDF file completely
 * Returns document data structure
 */
export async function processPdfFile(pdfFile, existingIds = [], existingNames = new Set()) {
    try {
        const fileName = pdfFile.name.replace(/\.pdf$/i, '');
        const baseName = fileName;
        const name = baseName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        // Check if document already exists
        if (existingNames.has(name)) {
            throw new Error(`Document "${name}" already exists`);
        }
        
        // Generate new ID
        const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
        const id = maxId + 1;
        
        // Generate label from filename
        const label = baseName
            .split(/[-_\s]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        
        // Extract images
        const imageDataUrls = await extractPageImages(pdfFile, 2.0);
        
        // Extract text and convert to markdown
        const text = await extractText(pdfFile);
        const markdown = cleanMarkdown(textToMarkdown(text));
        
        // Get dimensions from first page
        const dimensions = await getImageDimensions(imageDataUrls[0]);
        
        // Apply height cap (50vh as per user's change)
        const maxHeight = window.innerHeight * 0.5;
        let width = dimensions.width;
        let height = dimensions.height;
        
        if (height > maxHeight) {
            const scaleFactor = maxHeight / height;
            width = Math.round(width * scaleFactor);
            height = Math.round(maxHeight);
        }
        
        // Generate random position
        const baseX = Math.floor(Math.random() * 400) + 100;
        const baseY = Math.floor(Math.random() * 300) + 100;
        const scaleFactor = height / dimensions.height;
        const x = Math.round(baseX * scaleFactor);
        const y = Math.round(baseY * scaleFactor);
        
        return {
            id,
            name,
            label,
            pages: imageDataUrls,
            width,
            height,
            x,
            y,
            actions: ['Send to Ori', 'Send to Slack channel'],
            text: markdown || `# ${label}\n\n*Content extracted from PDF.*`
        };
    } catch (error) {
        console.error('Error processing PDF:', error);
        throw error;
    }
}
