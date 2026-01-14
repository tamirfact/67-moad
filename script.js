$(document).ready(function() {
    const ICON_WIDTH = 80; // Fixed icon width
    const TRANSITION_ZONE = 200; // Distance from edge where scaling starts
    
    // Non-linear easing function (ease-in-out cubic) - faster change near edges
    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    // Calculate scale based on element Y position
    // Returns scale from icon size (0.4) to large size at center (2.0)
    function calculateScaleFromY(y, baseWidth = 200) {
        const viewportHeight = window.innerHeight;
        const center = viewportHeight / 2;
        
        // Distance from center (0 to viewportHeight/2)
        const distanceFromCenter = Math.abs(y - center);
        
        // Normalize to 0-1 (0 = center, 1 = at edge)
        const normalizedDistance = Math.min(distanceFromCenter / (viewportHeight / 2), 1);
        
        // Apply non-linear easing - faster change near edges
        const eased = easeInOutCubic(normalizedDistance);
        
        // Scale from 2.0 (center - much larger) to 0.4 (icon size at edges)
        const iconScale = ICON_WIDTH / baseWidth; // 0.4
        const maxScale = 2.0; // Much larger at center
        const scale = maxScale - (eased * (maxScale - iconScale));
        
        return scale;
    }
    
    // Get element dimensions from data attributes
    function getElementSize(element) {
        return {
            width: parseFloat(element.getAttribute('data-width')) || 200,
            height: parseFloat(element.getAttribute('data-height')) || 280
        };
    }
    
    // Update element scale based on its position
    function updateElementScale(element) {
        const x = parseFloat(element.getAttribute('data-x')) || 0;
        const y = parseFloat(element.getAttribute('data-y')) || 0;
        const size = getElementSize(element);
        
        // Get the base top position (before transform)
        const baseTop = parseFloat(element.style.top) || 0;
        
        // Calculate actual center Y: base top + transform Y + half height
        const centerY = baseTop + y + size.height / 2;
        
        const scale = calculateScaleFromY(centerY, size.width);
        element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
    
    // Move document to edge (top or bottom) as icon
    function moveToEdgeAsIcon(element, snapToTop) {
        const size = getElementSize(element);
        const baseLeft = parseFloat(element.style.left) || 0;
        const iconScale = ICON_WIDTH / size.width;
        const iconHeight = size.height * iconScale;
        
        // Get current X position or use current center X
        const currentX = parseFloat(element.getAttribute('data-x')) || 0;
        const currentCenterX = baseLeft + currentX + size.width / 2;
        
        let x, y;
        
        if (snapToTop) {
            // Snap to top edge - half icon outside screen (above)
            // Icon center should be at iconHeight/2 so top edge is at 0 and half extends above
            element.style.top = '0px';
            element.style.bottom = 'auto';
            y = -iconHeight;
            x = currentCenterX - baseLeft - size.width / 2;
        } else {
            // Snap to bottom edge - half icon outside screen (below)
            // With bottom: 0px, element bottom is at viewport bottom
            // We want icon center at viewportHeight - iconHeight/2
            // So translate up by iconHeight/2
            element.style.top = 'auto';
            element.style.bottom = '0px';
            y = iconHeight+iconHeight/2;
            x = currentCenterX - baseLeft - size.width / 2;
        }
        
        element.setAttribute('data-x', x);
        element.setAttribute('data-y', y);
        element.style.transform = `translate(${x}px, ${y}px) scale(${iconScale})`;
        element.style.transition = 'transform 0.5s ease-out, top 0.5s ease-out, bottom 0.5s ease-out';
        
        // Remove transition after animation
        setTimeout(() => {
            element.style.transition = '';
        }, 500);
    }
    
    // Center document and scale to large size
    function centerDocument(element) {
        const size = getElementSize(element);
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const maxScale = 2.0;
        
        // Center position
        const centerX = (viewportWidth - size.width) / 2;
        const centerY = (viewportHeight - size.height) / 2;
        
        element.style.top = centerY + 'px';
        element.style.bottom = 'auto';
        element.style.left = centerX + 'px';
        
        const x = 0;
        const y = 0;
        
        element.setAttribute('data-x', x);
        element.setAttribute('data-y', y);
        element.style.transform = `translate(${x}px, ${y}px) scale(${maxScale})`;
        element.style.transition = 'transform 0.5s ease-out, top 0.5s ease-out, left 0.5s ease-out';
        
        // Remove transition after animation
        setTimeout(() => {
            element.style.transition = '';
        }, 500);
    }
    
    // Handle double-click on document - center it and move others to edges
    function handleDocumentDoubleClick(clickedElement) {
        const allRectangles = document.querySelectorAll('.rectangle');
        const viewportHeight = window.innerHeight;
        const center = viewportHeight / 2;
        
        allRectangles.forEach(function(rect) {
            if (rect === clickedElement) {
                // Center the clicked document
                centerDocument(rect);
            } else {
                // Move others to edges
                const baseTop = parseFloat(rect.style.top) || 0;
                const currentY = parseFloat(rect.getAttribute('data-y')) || 0;
                const size = getElementSize(rect);
                const centerY = baseTop + currentY + size.height / 2;
                
                // Determine which edge is closer
                const distanceFromTop = centerY;
                const distanceFromBottom = viewportHeight - centerY;
                const snapToTop = distanceFromTop < distanceFromBottom;
                
                // Move to edge as icon
                moveToEdgeAsIcon(rect, snapToTop);
            }
        });
    }
    
    // Function to make a rectangle draggable
    function makeDraggable(element) {
        let cursorOffsetX = null;
        let cursorOffsetY = null;
        let previousScale = null;
        let startCursorX = null;
        let startCursorY = null;
        
        interact(element)
            .draggable({
                listeners: {
                    start(event) {
                        $(event.target).addClass('dragging');
                        
                        // Store cursor position at start
                        startCursorX = event.clientX;
                        startCursorY = event.clientY;
                        
                        // Get element size
                        const size = getElementSize(event.target);
                        
                        // Get element's current transform and scale
                        const currentTransform = window.getComputedStyle(event.target).transform;
                        const matrix = new DOMMatrix(currentTransform);
                        previousScale = matrix.a || 1;
                        
                        // Calculate element center in world coordinates
                        const baseLeft = parseFloat(event.target.style.left) || 0;
                        const baseTop = parseFloat(event.target.style.top) || 0;
                        const currentX = parseFloat(event.target.getAttribute('data-x')) || 0;
                        const currentY = parseFloat(event.target.getAttribute('data-y')) || 0;
                        
                        const elementCenterX = baseLeft + currentX + size.width / 2;
                        const elementCenterY = baseTop + currentY + size.height / 2;
                        
                        // Calculate cursor offset from element center in unscaled coordinates
                        cursorOffsetX = (startCursorX - elementCenterX) / previousScale;
                        cursorOffsetY = (startCursorY - elementCenterY) / previousScale;
                    },
                    move(event) {
                        const target = event.target;
                        const size = getElementSize(target);
                        
                        // Get base position
                        const baseLeft = parseFloat(target.style.left) || 0;
                        const baseTop = parseFloat(target.style.top) || 0;
                        
                        let x, y, newScale;
                        
                        // If we have cursor offset, calculate position to keep cursor point fixed
                        if (cursorOffsetX !== null && cursorOffsetY !== null && previousScale !== null) {
                            // Calculate where element center should be so cursor point stays under cursor
                            // cursorWorldX = elementCenterX + cursorOffsetX * scale
                            // So: elementCenterX = cursorWorldX - cursorOffsetX * scale
                            // We want cursorWorldX = event.clientX (current cursor position)
                            
                            // First, estimate position for scale calculation
                            const tempX = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                            const tempY = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
                            const tempCenterY = baseTop + tempY + size.height / 2;
                            newScale = calculateScaleFromY(tempCenterY, size.width);
                            
                            // Calculate element center to keep cursor point fixed
                            const newCenterX = event.clientX - cursorOffsetX * newScale;
                            const newCenterY = event.clientY - cursorOffsetY * newScale;
                            
                            // Convert back to translate values
                            x = newCenterX - baseLeft - size.width / 2;
                            y = newCenterY - baseTop - size.height / 2;
                        } else {
                            // Fallback: use drag delta directly
                            x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                            y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
                            const centerY = baseTop + y + size.height / 2;
                            newScale = calculateScaleFromY(centerY, size.width);
                        }
                        
                        target.setAttribute('data-x', x);
                        target.setAttribute('data-y', y);
                        target.style.transform = `translate(${x}px, ${y}px) scale(${newScale})`;
                        
                        previousScale = newScale;
                    },
                    end(event) {
                        $(event.target).removeClass('dragging');
                        cursorOffsetX = null;
                        cursorOffsetY = null;
                        previousScale = null;
                        startCursorX = null;
                        startCursorY = null;
                    }
                }
            });
    }

    // Function to generate random tilt angle between -2 and 2 degrees
    function getRandomTilt() {
        return (Math.random() * 4 - 2).toFixed(2); // -2 to 2 degrees
    }
    
    // Function to create a rectangle (document pile) from JSON data
    function createRectangle(rectData) {
        const width = rectData.width || 200;
        const height = rectData.height || 280;
        
        const $rect = $('<div>')
            .addClass('rectangle')
            .attr('data-id', rectData.id)
            .attr('data-width', width)
            .attr('data-height', height)
            .css({
                width: width + 'px',
                height: height + 'px'
            });
        
        const $content = $('<div>').addClass('rectangle-content');
        const $pile = $('<div>').addClass('image-pile');
        
        // Create image pages with slight tilts
        if (rectData.pages && Array.isArray(rectData.pages)) {
            rectData.pages.forEach(function(pagePath, index) {
                const $page = $('<img>')
                    .addClass('image-page')
                    .attr('src', pagePath)
                    .attr('alt', `Page ${index + 1}`)
                    .css({
                        zIndex: rectData.pages.length - index, // First page on top
                        transform: `rotate(${getRandomTilt()}deg)`,
                        top: (index * 2) + 'px', // Slight vertical offset for pile effect
                        left: (index * 2) + 'px' // Slight horizontal offset for pile effect
                    });
                $pile.append($page);
            });
        }
        
        $content.append($pile);
        $rect.append($content);
        
        $rect.css({
            left: rectData.x + 'px',
            top: rectData.y + 'px'
        });
        
        $('#canvas').append($rect);
        makeDraggable($rect[0]);
        
        // Add double-click handler - prevent all event propagation
        $rect.on('dblclick', function(e) {
            e.stopPropagation();
            e.preventDefault();
            handleDocumentDoubleClick(this);
            return false;
        });
        
        // Also prevent double-click on child elements
        $rect.find('*').on('dblclick', function(e) {
            e.stopPropagation();
            e.preventDefault();
            const rect = $(this).closest('.rectangle')[0];
            if (rect) {
                handleDocumentDoubleClick(rect);
            }
            return false;
        });
        
        // Set initial scale based on position
        setTimeout(() => {
            updateElementScale($rect[0]);
        }, 0);
        
        return $rect;
    }

    // Track rectangle count for new rectangles
    let rectangleCount = 0;

    // Load rectangles from JSON
    $.getJSON('data.json', function(data) {
        if (data.rectangles && Array.isArray(data.rectangles)) {
            // Set rectangle count to max ID from JSON
            rectangleCount = Math.max(...data.rectangles.map(r => r.id || 0), 0);
            data.rectangles.forEach(function(rect) {
                createRectangle(rect);
            });
        }
    }).fail(function() {
        console.error('Failed to load data.json');
    });

    // Function to add a new rectangle (for double-click feature)
    function addRectangle(x, y) {
        rectangleCount++;
        const rectData = {
            id: rectangleCount,
            name: 'Document ' + rectangleCount,
            pages: ['docs/te-1.png'], // Default single page document
            width: 200,
            height: 280,
            x: x,
            y: y
        };
        createRectangle(rectData);
    }

    // Double-click on canvas disabled - documents should not be created via double-click
    // Removed to prevent accidental document creation
});
