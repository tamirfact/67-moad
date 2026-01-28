// AI Chat Interface
// This file handles all AI-related functionality including chat, document chips, and Gemini API communication

import $ from 'jquery';
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';

$(document).ready(function() {
    // AI State
    const aiState = {
        isOpen: false,
        messages: [],
        thinking: false
    };

    // Get documents currently on canvas
    function getDocumentsOnCanvas() {
        const documents = [];
        const rectangles = document.querySelectorAll('.rectangle');
        
        rectangles.forEach(function(rect) {
            const docName = rect.getAttribute('data-name');
            const docId = rect.getAttribute('data-id');
            
            // Get document data from the global documentDataMap
            if (typeof window.documentDataMap !== 'undefined' && window.documentDataMap.has(rect)) {
                const docData = window.documentDataMap.get(rect);
                documents.push({
                    name: docName,
                    id: docId,
                    label: docData.label || docData.name || docName,
                    text: docData.text || '', // Include markdown text
                    element: rect
                });
            }
        });
        
        return documents;
    }

    // Create document chip
    function createDocumentChip(doc) {
        const $chip = $('<div>')
            .addClass('ai-chip')
            .attr('data-doc-name', doc.name)
            .attr('data-doc-id', doc.id);
        
        const $label = $('<span>')
            .addClass('ai-chip-label')
            .text(doc.label);
        
        const $close = $('<button>')
            .addClass('ai-chip-close')
            .html('<span class="material-icons">close</span>')
            .on('click', function(e) {
                e.stopPropagation();
                dismissDocument(doc);
            });
        
        $chip.append($label).append($close);
        return $chip;
    }

    // Update document chips display
    function updateDocumentChips() {
        const $container = $('#ai-chips-container');
        $container.empty();
        
        const documents = getDocumentsOnCanvas();
        
        if (documents.length === 0) {
            $container.hide();
            return;
        }
        
        $container.show();
        documents.forEach(function(doc) {
            const $chip = createDocumentChip(doc);
            $container.append($chip);
        });
    }

    // Dismiss document (fade back to library)
    function dismissDocument(doc) {
        const element = doc.element;
        if (!element) return;
        
        const $element = $(element);
        const docName = doc.name;
        
        // Animate document fading out and moving to left
        const rect = element.getBoundingClientRect();
        const targetX = -rect.width;
        const targetY = rect.top;
        
        $element.css({
            transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: 0,
            transform: `translate(${targetX}px, ${targetY}px) scale(0.3)`
        });
        
        // Remove from canvas after animation
        setTimeout(function() {
            // Remove from tracking
            if (typeof window.documentsOnCanvas !== 'undefined') {
                window.documentsOnCanvas.delete(docName);
            }
            if (typeof window.documentDataMap !== 'undefined') {
                window.documentDataMap.delete(element);
            }
            
            // Remove element
            $element.remove();
            
            // Remove tooltip if exists
            const docId = element.getAttribute('data-id');
            $(`.rectangle-tooltip[data-rect-id="${docId}"]`).remove();
            
            // Update sidebar item state
            if (typeof window.updateDocumentListItemState !== 'undefined') {
                const $listItem = $(`.document-list-item[data-doc-name="${docName}"]`);
                window.updateDocumentListItemState($listItem, docName);
            }
            
            // Update chips
            updateDocumentChips();
        }, 600);
    }

    // Create chat message bubble
    function createChatMessage(text, isUser, isStreaming = false) {
        const $message = $('<div>')
            .addClass('ai-chat-message')
            .addClass(isUser ? 'ai-message-user' : 'ai-message-assistant');
        
        const $bubble = $('<div>')
            .addClass('ai-chat-bubble');
        
        if (isUser) {
            // User messages are plain text
            $bubble.text(text);
        } else {
            // Assistant messages are markdown
            $bubble.addClass('ai-markdown-content');
            if (isStreaming) {
                $bubble.html(marked.parse(text));
            } else {
                $bubble.html(marked.parse(text));
            }
        }
        
        $message.append($bubble);
        return $message;
    }

    // Add message to chat
    function addChatMessage(text, isUser, isStreaming = false) {
        const $container = $('#ai-chat-container');
        const $message = createChatMessage(text, isUser, isStreaming);
        
        $container.append($message);
        
        // Scroll to bottom
        $container.scrollTop($container[0].scrollHeight);
        
        // Animate message appearance
        setTimeout(function() {
            $message.addClass('ai-message-visible');
        }, 10);
        
        return $message;
    }

    // Update streaming message
    function updateStreamingMessage($message, text) {
        const $bubble = $message.find('.ai-chat-bubble');
        $bubble.html(marked.parse(text));
        
        // Scroll to bottom
        const $container = $('#ai-chat-container');
        $container.scrollTop($container[0].scrollHeight);
    }

    // Show thinking animation
    function showThinking() {
        if (aiState.thinking) return;
        
        aiState.thinking = true;
        const $container = $('#ai-chat-container');
        
        const $thinking = $('<div>')
            .addClass('ai-chat-message ai-message-assistant')
            .attr('id', 'ai-thinking-message');
        
        const $bubble = $('<div>')
            .addClass('ai-chat-bubble ai-thinking-bubble');
        
        // Create animated dots
        for (let i = 0; i < 3; i++) {
            const $dot = $('<span>')
                .addClass('ai-thinking-dot');
            $bubble.append($dot);
        }
        
        $thinking.append($bubble);
        $container.append($thinking);
        $container.scrollTop($container[0].scrollHeight);
        
        setTimeout(function() {
            $thinking.addClass('ai-message-visible');
        }, 10);
    }

    // Hide thinking animation
    function hideThinking() {
        aiState.thinking = false;
        $('#ai-thinking-message').fadeOut(200, function() {
            $(this).remove();
        });
    }

    // Get Gemini API client
    function getGeminiClient() {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            throw new Error('API key not set. Please configure your Gemini API key in settings (CMD+,).');
        }
        return new GoogleGenAI({ apiKey });
    }

    // Send message to Gemini API with streaming
    async function sendToGemini(message, onStreamChunk) {
        try {
            const ai = getGeminiClient();
            
            // Get context about documents on canvas
            const documents = getDocumentsOnCanvas();
            let contextMessage = message;
            
            if (documents.length > 0) {
                // Build context with document names and their text content
                const docContexts = documents.map(doc => {
                    let docContext = `Document: "${doc.label || doc.name}"`;
                    if (doc.text && doc.text.trim()) {
                        docContext += `\n\nContent:\n${doc.text}`;
                    }
                    return docContext;
                }).join('\n\n---\n\n');
                
                contextMessage = `The user has these documents open:\n\n${docContexts}\n\nUser question: ${message}`;
            }
            
            // Get selected model from settings (default to gemini-3-flash-preview)
            const selectedModel = window.getGeminiModel ? window.getGeminiModel() : 'gemini-3-flash-preview';
            
            // Use streaming for better UX
            let fullText = '';
            const stream = await ai.models.generateContentStream({
                model: selectedModel,
                contents: contextMessage
            });
            
            // Process stream chunks
            for await (const chunk of stream) {
                const chunkText = chunk.text || '';
                fullText += chunkText;
                
                // Call callback for each chunk if provided
                if (onStreamChunk) {
                    onStreamChunk(fullText);
                }
            }
            
            return fullText;
        } catch (error) {
            console.error('Gemini API error:', error);
            
            // Provide user-friendly error messages
            if (error.message && error.message.includes('API key')) {
                throw new Error('API key not configured. Press CMD+, to open settings and add your Gemini API key.');
            } else if (error.message && error.message.includes('quota')) {
                throw new Error('API quota exceeded. Please check your Google Cloud billing.');
            } else if (error.message && error.message.includes('safety')) {
                throw new Error('Your message was blocked by safety filters. Please try rephrasing.');
            } else {
                throw new Error('Failed to get response from Gemini. Please check your API key and try again.');
            }
        }
    }

    // Handle message send
    function sendMessage() {
        const $input = $('#ai-input');
        const message = $input.val().trim();
        
        if (!message || aiState.thinking) return;
        
        // Add user message
        addChatMessage(message, true);
        $input.val('');
        
        // Show thinking animation
        showThinking();
        
        // Create streaming message container
        let $streamingMessage = null;
        let streamingText = '';
        
        // Send to Gemini API with streaming
        sendToGemini(message, function(chunkText) {
            // Hide thinking animation on first chunk
            if (aiState.thinking) {
                hideThinking();
            }
            
            // Create or update streaming message
            if (!$streamingMessage) {
                streamingText = chunkText;
                $streamingMessage = addChatMessage(streamingText, false, true);
            } else {
                streamingText = chunkText;
                updateStreamingMessage($streamingMessage, streamingText);
            }
        })
            .then(function(finalText) {
                // Ensure final message is displayed
                if ($streamingMessage) {
                    updateStreamingMessage($streamingMessage, finalText);
                } else {
                    hideThinking();
                    addChatMessage(finalText, false);
                }
            })
            .catch(function(error) {
                hideThinking();
                // Show error message to user
                const errorMessage = error.message || 'An error occurred while processing your request.';
                addChatMessage('Error: ' + errorMessage, false);
            });
    }

    // Open AI input overlay
    function openAIInput() {
        if (aiState.isOpen || (typeof viewerState !== 'undefined' && viewerState.isOpen)) {
            return;
        }
        
        aiState.isOpen = true;
        const $overlay = $('#ai-input-overlay');
        const $input = $('#ai-input');
        
        // Update document chips
        updateDocumentChips();
        
        $overlay.addClass('active');
        
        // Focus input after overlay fades in
        setTimeout(function() {
            $input.focus();
        }, 300);
    }

    // Close AI input overlay
    function closeAIInput() {
        if (!aiState.isOpen) return;
        
        aiState.isOpen = false;
        const $overlay = $('#ai-input-overlay');
        const $input = $('#ai-input');
        
        $overlay.removeClass('active');
        $input.val('');
        $input.blur();
        
        // Clear chat messages
        $('#ai-chat-container').empty();
        aiState.messages = [];
    }

    // Handle spacebar keydown
    $(document).on('keydown', function(e) {
        // Only trigger on spacebar if not typing in an input/textarea
        if (e.key === ' ' || e.key === 'Spacebar') {
            const $target = $(e.target);
            const isInput = $target.is('input') || $target.is('textarea') || $target.is('[contenteditable="true"]');
            
            if (!isInput && !aiState.isOpen && (typeof viewerState === 'undefined' || !viewerState.isOpen)) {
                e.preventDefault();
                openAIInput();
            }
        }
    });

    // Handle ESC key to close AI input
    $(document).on('keydown', function(e) {
        if (e.key === 'Escape') {
            if (typeof viewerState !== 'undefined' && viewerState.isOpen) {
                // Let viewer handle ESC first
                return;
            } else if (aiState.isOpen) {
                closeAIInput();
            }
        }
    });

    // Handle Enter key in AI input
    $('#ai-input').on('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Expose functions globally for script.js
    window.openAIInput = openAIInput;
    window.closeAIInput = closeAIInput;
});
