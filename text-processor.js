/**
 * Text Processing Functions
 * Handles text pagination and document creation from text content
 */

const SHORT_TEXT_THRESHOLD = 500; // Characters
const LINES_PER_PAGE = 35; // Approximate lines per page
const CHARS_PER_LINE = 80; // Approximate characters per line

/**
 * Check if text is short or long
 */
export function isShortText(text) {
    return text.length < SHORT_TEXT_THRESHOLD;
}

/**
 * Split text into lines
 */
function splitIntoLines(text) {
    return text.split(/\r?\n/).filter(line => line.trim().length > 0);
}

/**
 * Split long text into pages by line count
 */
export function paginateText(text) {
    const lines = splitIntoLines(text);
    const pages = [];
    
    for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
        const pageLines = lines.slice(i, i + LINES_PER_PAGE);
        pages.push(pageLines.join('\n'));
    }
    
    return pages;
}

/**
 * Get first line of text (for title)
 */
export function getFirstLine(text, maxLength = 50) {
    const lines = text.split(/\r?\n/);
    const firstLine = lines[0] || text;
    return firstLine.length > maxLength 
        ? firstLine.substring(0, maxLength) + '...' 
        : firstLine;
}

/**
 * Calculate dimensions for text document
 */
export function calculateTextDimensions(text, isShort = false) {
    if (isShort) {
        // For short text, calculate based on content
        const lines = splitIntoLines(text);
        const maxLineLength = Math.max(...lines.map(l => l.length), 1);
        
        // Estimate dimensions with smaller font (12px) and padding (12px * 2 = 24px)
        // Account for padding in width calculation
        const padding = 24; // 12px on each side
        const charWidth = 7; // Approximate width per character at 12px font
        const lineHeight = 18; // 12px * 1.5 line-height
        
        const width = Math.min(Math.max(maxLineLength * charWidth + padding, 200), 600);
        const height = Math.max(lines.length * lineHeight + padding, 100);
        
        return { width, height };
    } else {
        // For long text (paginated), use standard page dimensions
        const pages = paginateText(text);
        const pageWidth = 600;
        const pageHeight = 800;
        
        return {
            width: pageWidth,
            height: pageHeight * pages.length + (pages.length - 1) * 20 // Add spacing between pages
        };
    }
}

/**
 * Create document data structure from text
 */
export function createTextDocument(text, existingIds = [], existingNames = new Set()) {
    const isShort = isShortText(text);
    const firstLine = getFirstLine(text);
    
    // Generate name from first line
    const name = firstLine
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .substring(0, 50) || 'pasted-text';
    
    // Ensure unique name
    let uniqueName = name;
    let counter = 1;
    while (existingNames.has(uniqueName)) {
        uniqueName = `${name}-${counter}`;
        counter++;
    }
    
    // Generate ID
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    const id = maxId + 1;
    
    // Calculate dimensions
    const dimensions = calculateTextDimensions(text, isShort);
    
    // Generate random position
    const x = Math.floor(Math.random() * 400) + 100;
    const y = Math.floor(Math.random() * 300) + 100;
    
    // Create pages array (empty for short text, paginated for long)
    const pages = isShort ? [] : paginateText(text);
    
    return {
        id,
        name: uniqueName,
        label: firstLine,
        type: 'pasted-text',
        pages,
        width: dimensions.width,
        height: dimensions.height,
        x,
        y,
        text: text, // Full text for AI
        actions: ['Send to Ori', 'Send to Slack channel'],
        isPasted: true,
        isShortText: isShort
    };
}
