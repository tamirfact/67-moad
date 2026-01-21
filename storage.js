/**
 * LocalStorage wrapper for document persistence
 */

const STORAGE_KEY = 'spatial-documents';

/**
 * Save all documents to localStorage
 */
export function saveDocuments(documents) {
    try {
        const data = {
            rectangles: documents,
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Error saving documents to localStorage:', error);
        // Handle quota exceeded error
        if (error.name === 'QuotaExceededError') {
            console.warn('LocalStorage quota exceeded. Consider using IndexedDB for larger documents.');
            return false;
        }
        return false;
    }
}

/**
 * Load documents from localStorage
 */
export function loadDocuments() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return null;
        }
        const data = JSON.parse(stored);
        return data.rectangles || [];
    } catch (error) {
        console.error('Error loading documents from localStorage:', error);
        return null;
    }
}

/**
 * Add a single document and save all documents
 */
export function addDocument(document, existingDocuments = []) {
    const allDocuments = [...existingDocuments, document];
    const success = saveDocuments(allDocuments);
    return success ? allDocuments : existingDocuments;
}

/**
 * Update a document by ID and save
 */
export function updateDocument(documentId, updates, existingDocuments = []) {
    const documents = existingDocuments.map(doc => 
        doc.id === documentId ? { ...doc, ...updates } : doc
    );
    const success = saveDocuments(documents);
    return success ? documents : existingDocuments;
}

/**
 * Delete a document by ID and save
 */
export function deleteDocument(documentId, existingDocuments = []) {
    const documents = existingDocuments.filter(doc => doc.id !== documentId);
    const success = saveDocuments(documents);
    return success ? documents : existingDocuments;
}

/**
 * Clear all documents from localStorage
 */
export function clearDocuments() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        return true;
    } catch (error) {
        console.error('Error clearing documents from localStorage:', error);
        return false;
    }
}

/**
 * Get storage size estimate (approximate)
 */
export function getStorageSize() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return 0;
        return new Blob([stored]).size;
    } catch (error) {
        return 0;
    }
}
