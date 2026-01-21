// AI Chat Interface
// This file handles all AI-related functionality including chat, document chips, and mock server communication

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
    function createChatMessage(text, isUser) {
        const $message = $('<div>')
            .addClass('ai-chat-message')
            .addClass(isUser ? 'ai-message-user' : 'ai-message-assistant');
        
        const $bubble = $('<div>')
            .addClass('ai-chat-bubble')
            .text(text);
        
        $message.append($bubble);
        return $message;
    }

    // Add message to chat
    function addChatMessage(text, isUser) {
        const $container = $('#ai-chat-container');
        const $message = createChatMessage(text, isUser);
        
        $container.append($message);
        
        // Scroll to bottom
        $container.scrollTop($container[0].scrollHeight);
        
        // Animate message appearance
        setTimeout(function() {
            $message.addClass('ai-message-visible');
        }, 10);
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

    // Mock server - simulates AI response
    function sendToMockServer(message) {
        // Simulate network delay
        const delay = 1000 + Math.random() * 2000; // 1-3 seconds
        
        return new Promise(function(resolve) {
            setTimeout(function() {
                // Generate a mock response based on the message
                const responses = [
                    "I understand you're asking about: " + message + ". Based on the documents you have open, I can help you analyze the content.",
                    "That's an interesting question! Looking at your current documents, I can see several relevant points that might help.",
                    "Great question! From what I can see in your workspace, here's what I found: The documents contain valuable information that relates to your query.",
                    "Based on the documents you've shared, I can provide insights on: " + message.substring(0, 50) + "...",
                    "I've analyzed your question in context of the open documents. Here's what stands out: The information suggests several key points worth exploring further."
                ];
                
                const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                resolve(randomResponse);
            }, delay);
        });
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
        
        // Send to mock server
        sendToMockServer(message).then(function(response) {
            hideThinking();
            addChatMessage(response, false);
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
