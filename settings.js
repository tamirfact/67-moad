// Settings Panel Module
// Handles settings panel UI, API key management, and CMD+, keyboard shortcut

import $ from 'jquery';

let settingsState = {
    isOpen: false
};

// Initialize settings panel
export function initSettings() {
    const $overlay = $('#settings-overlay');
    const $input = $('#gemini-api-key');
    const $saveBtn = $('#settings-save');
    const $cancelBtn = $('#settings-cancel');
    const $closeBtn = $('#settings-close');
    const $savedMessage = $('#settings-saved-message');

    // Load existing API key from localStorage
    const existingKey = localStorage.getItem('gemini_api_key');
    if (existingKey) {
        $input.val(existingKey);
    }

    // Open settings panel
    function openSettings() {
        if (settingsState.isOpen) return;
        
        settingsState.isOpen = true;
        $overlay.addClass('active');
        
        // Focus input after animation
        setTimeout(() => {
            $input.focus();
            $input.select();
        }, 300);
    }

    // Close settings panel
    function closeSettings() {
        if (!settingsState.isOpen) return;
        
        settingsState.isOpen = false;
        $overlay.removeClass('active');
        $savedMessage.removeClass('show');
    }

    // Save API key
    function saveSettings() {
        const apiKey = $input.val().trim();
        
        if (!apiKey) {
            // Clear API key if empty
            localStorage.removeItem('gemini_api_key');
            showSavedMessage();
            setTimeout(closeSettings, 1000);
            return;
        }
        
        // Save to localStorage
        localStorage.setItem('gemini_api_key', apiKey);
        
        // Show success message
        showSavedMessage();
        
        // Close after a delay
        setTimeout(() => {
            closeSettings();
        }, 1500);
    }

    // Show saved message
    function showSavedMessage() {
        $savedMessage.addClass('show');
        setTimeout(() => {
            $savedMessage.removeClass('show');
        }, 2000);
    }

    // Event handlers
    $saveBtn.on('click', saveSettings);
    $cancelBtn.on('click', closeSettings);
    $closeBtn.on('click', closeSettings);
    
    // Close on overlay click
    $overlay.on('click', function(e) {
        if (e.target === this) {
            closeSettings();
        }
    });

    // Handle Enter key in input
    $input.on('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveSettings();
        }
    });

    // Handle ESC key
    $(document).on('keydown', function(e) {
        if (e.key === 'Escape' && settingsState.isOpen) {
            closeSettings();
        }
    });

    // Keyboard shortcut: CMD+, (Command + Comma) - common settings shortcut
    window.addEventListener('keydown', function(e) {
        // Check for CMD+, or CTRL+, (Windows/Linux)
        if (
            (e.key === ',' || e.key === 'Comma') &&
            (e.metaKey || e.ctrlKey) &&
            !e.shiftKey &&
            !e.altKey
        ) {
            // Only prevent default if not in an input field
            const $target = $(e.target);
            const isInput = $target.is('input') || $target.is('textarea') || $target.is('[contenteditable="true"]');
            
            if (!isInput) {
                e.preventDefault();
                e.stopPropagation();
                
                // Toggle settings panel
                if (settingsState.isOpen) {
                    closeSettings();
                } else {
                    openSettings();
                }
            }
        }
    });

    // Expose functions globally for external access
    window.openSettings = openSettings;
    window.closeSettings = closeSettings;
    window.getGeminiApiKey = function() {
        return localStorage.getItem('gemini_api_key');
    };
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettings);
} else {
    // DOM already loaded
    initSettings();
}
