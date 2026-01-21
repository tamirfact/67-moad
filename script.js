import $ from 'jquery';
import './settings.js';
import './ai.js';

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
    
    // Update z-index based on scale (bigger = higher z-index)
    function updateZIndex(element, scale) {
        // Scale ranges from 0.4 to 2.0, so z-index ranges from 400 to 2000
        // This ensures larger documents appear on top
        const zIndex = Math.round(scale * 1000);
        element.style.zIndex = zIndex;
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
        
        // Update z-index based on scale (unless dragging)
        if (!$(element).hasClass('dragging')) {
            updateZIndex(element, scale);
        }
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
        updateZIndex(element, iconScale);
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
        updateZIndex(element, maxScale);
        element.style.transition = 'transform 0.5s ease-out, top 0.5s ease-out, left 0.5s ease-out';
        
        // Remove transition after animation
        setTimeout(() => {
            element.style.transition = '';
        }, 500);
    }
    
    // Handle double-click on document - open in viewer mode
    function handleDocumentDoubleClick(clickedElement) {
        const docData = documentDataMap.get(clickedElement);
        if (docData) {
            openDocumentViewer(docData, clickedElement);
        }
    }
    
    // Viewer state
    let viewerState = {
        isOpen: false,
        currentDocData: null,
        sourceElement: null,
        zoomLevel: 1.0,
        pagePositions: []
    };
    
    // Open document viewer
    function openDocumentViewer(docData, sourceElement) {
        if (viewerState.isOpen) {
            return; // Already open
        }
        
        viewerState.isOpen = true;
        viewerState.currentDocData = docData;
        viewerState.sourceElement = sourceElement;
        viewerState.zoomLevel = 1.0;
        
        const $overlay = $('#pdf-viewer-overlay');
        const $pagesContainer = $('#pdf-viewer-pages');
        const $title = $('#pdf-viewer-title');
        
        // Set document title
        $title.text(docData.label || docData.name || 'Document');
        
        // Clear previous pages
        $pagesContainer.empty();
        
        // Store original positions of pages for animation
        // Capture position immediately before showing overlay
        const sourceRect = sourceElement.getBoundingClientRect();
        const sourceTransform = window.getComputedStyle(sourceElement).transform;
        const matrix = new DOMMatrix(sourceTransform);
        const sourceScale = matrix.a || 1;
        
        const pages = docData.pages || [];
        viewerState.pagePositions = [];
        
        // Create page elements
        pages.forEach(function(pagePath, index) {
            const $page = $('<div>').addClass('pdf-viewer-page');
            const $img = $('<img>')
                .attr('src', pagePath)
                .attr('alt', `Page ${index + 1}`);
            
            $page.append($img);
            $pagesContainer.append($page);
            
            // Calculate initial position (from source element)
            const pageOffset = index * 2; // Small offset from pile
            const initialX = sourceRect.left + pageOffset;
            const initialY = sourceRect.top + pageOffset;
            const initialWidth = sourceRect.width * sourceScale;
            const initialHeight = sourceRect.height * sourceScale;
            
            // Store initial position
            viewerState.pagePositions.push({
                element: $page[0],
                initialX: initialX,
                initialY: initialY,
                initialWidth: initialWidth,
                initialHeight: initialHeight
            });
            
            // Set initial position and size (matching source element)
            $page.css({
                position: 'fixed',
                left: initialX + 'px',
                top: initialY + 'px',
                width: initialWidth + 'px',
                height: initialHeight + 'px',
                transform: 'translate(0, 0)',
                opacity: 1,
                zIndex: 10000001
            });
        });
        
        // Set initial zoom level display
        $('#pdf-viewer-zoom-level').text('100%');
        
        // Show overlay
        $overlay.addClass('active');
        
        // Animate pages to final positions
        setTimeout(function() {
            animatePagesToViewer();
        }, 50);
    }
    
    // Animate pages from initial positions to viewer layout
    function animatePagesToViewer() {
        const $pagesContainer = $('#pdf-viewer-pages');
        const $pages = $pagesContainer.find('.pdf-viewer-page');
        const viewportWidth = window.innerWidth;
        
        // Calculate page width (fit to container with some padding)
        const maxPageWidth = Math.min(viewportWidth - 80, 800);
        const pageWidth = maxPageWidth;
        
        // Calculate vertical spacing
        const pageSpacing = 20;
        let currentTop = 40; // Start position
        
        // First, ensure all images are loaded and calculate positions
        let loadedCount = 0;
        const totalPages = $pages.length;
        
        function updatePagePositions() {
            if (loadedCount < totalPages) {
                return; // Wait for all images
            }
            
            // Get container position relative to viewport
            const containerRect = $pagesContainer[0].getBoundingClientRect();
            const toolbarHeight = $('.pdf-viewer-toolbar').outerHeight() || 48;
            
            currentTop = 40;
            
            $pages.each(function(index) {
                const $page = $(this);
                const $img = $page.find('img');
                
                // Calculate final position relative to container
                const finalLeftRelative = (viewportWidth - pageWidth) / 2;
                const finalTopRelative = currentTop;
                
                // Convert to fixed coordinates (relative to viewport)
                const finalLeftFixed = finalLeftRelative;
                const finalTopFixed = containerRect.top + finalTopRelative;
                
                // Get image dimensions
                const imgWidth = $img[0].naturalWidth || $img[0].width;
                const imgHeight = $img[0].naturalHeight || $img[0].height;
                const aspectRatio = imgHeight / imgWidth;
                const pageHeight = pageWidth * aspectRatio;
                
                // Animate to fixed position first
                $page.css({
                    position: 'fixed',
                    left: finalLeftFixed + 'px',
                    top: finalTopFixed + 'px',
                    width: pageWidth + 'px',
                    height: pageHeight + 'px',
                    transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: 'translate(0, 0)',
                    opacity: 1,
                    zIndex: 10000001
                });
                
                // After animation, switch to absolute positioning
                setTimeout(function() {
                    $page.css({
                        position: 'absolute',
                        left: finalLeftRelative + 'px',
                        top: finalTopRelative + 'px',
                        zIndex: 'auto'
                    });
                }, 600);
                
                currentTop += pageHeight + pageSpacing;
            });
            
            // Update container height
            $pagesContainer.css('min-height', (currentTop + 40) + 'px');
        }
        
        // Wait for images to load
        $pages.each(function(index) {
            const $page = $(this);
            const $img = $page.find('img');
            
            if ($img[0].complete && $img[0].naturalWidth > 0) {
                loadedCount++;
                if (loadedCount === totalPages) {
                    setTimeout(updatePagePositions, 50);
                }
            } else {
                $img.on('load', function() {
                    loadedCount++;
                    if (loadedCount === totalPages) {
                        setTimeout(updatePagePositions, 50);
                    }
                });
                
                // Handle error case
                $img.on('error', function() {
                    loadedCount++;
                    if (loadedCount === totalPages) {
                        setTimeout(updatePagePositions, 50);
                    }
                });
            }
        });
        
        // Fallback if all images are already loaded
        if (loadedCount === totalPages) {
            setTimeout(updatePagePositions, 50);
        }
    }
    
    // Close document viewer
    function closeDocumentViewer() {
        if (!viewerState.isOpen) {
            return;
        }
        
        const $overlay = $('#pdf-viewer-overlay');
        const $pages = $('#pdf-viewer-pages').find('.pdf-viewer-page');
        const sourceElement = viewerState.sourceElement;
        
        if (!sourceElement) {
            // Just close without animation
            $overlay.removeClass('active');
            viewerState.isOpen = false;
            viewerState.currentDocData = null;
            viewerState.sourceElement = null;
            return;
        }
        
        // Animate pages back to source element
        // Get current source element position (it might have moved)
        const currentSourceRect = sourceElement.getBoundingClientRect();
        const sourceTransform = window.getComputedStyle(sourceElement).transform;
        const matrix = new DOMMatrix(sourceTransform);
        const sourceScale = matrix.a || 1;
        
        $pages.each(function(index) {
            const $page = $(this);
            const pageData = viewerState.pagePositions[index];
            
            if (pageData) {
                const pageOffset = index * 2;
                const finalX = currentSourceRect.left + pageOffset;
                const finalY = currentSourceRect.top + pageOffset;
                const finalWidth = currentSourceRect.width * sourceScale;
                const finalHeight = currentSourceRect.height * sourceScale;
                
                // Switch to fixed positioning for animation back
                requestAnimationFrame(function() {
                    $page.css({
                        position: 'fixed',
                        left: finalX + 'px',
                        top: finalY + 'px',
                        width: finalWidth + 'px',
                        height: finalHeight + 'px',
                        transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                        opacity: 0,
                        zIndex: 10000001
                    });
                });
            }
        });
        
        // Hide overlay after animation
        setTimeout(function() {
            $overlay.removeClass('active');
            $('#pdf-viewer-pages').empty();
            viewerState.isOpen = false;
            viewerState.currentDocData = null;
            viewerState.sourceElement = null;
            viewerState.pagePositions = [];
        }, 600);
    }
    
    // Zoom functions
    function zoomViewer(zoomDelta) {
        const newZoom = Math.max(0.5, Math.min(3.0, viewerState.zoomLevel + zoomDelta));
        viewerState.zoomLevel = newZoom;
        
        const $pagesContainer = $('#pdf-viewer-pages');
        const $pages = $pagesContainer.find('.pdf-viewer-page');
        const viewportWidth = window.innerWidth;
        const basePageWidth = Math.min(viewportWidth - 80, 800);
        const newPageWidth = basePageWidth * newZoom;
        
        let currentTop = 40;
        
        $pages.each(function() {
            const $page = $(this);
            const $img = $page.find('img');
            
            // Calculate new height based on aspect ratio
            const imgWidth = $img[0].naturalWidth || $img[0].width;
            const imgHeight = $img[0].naturalHeight || $img[0].height;
            const aspectRatio = imgHeight / imgWidth;
            const newPageHeight = newPageWidth * aspectRatio;
            
            $page.css({
                width: newPageWidth + 'px',
                height: newPageHeight + 'px',
                left: ((viewportWidth - newPageWidth) / 2) + 'px',
                top: currentTop + 'px',
                transition: 'all 0.3s ease'
            });
            
            currentTop += newPageHeight + 20;
        });
        
        $('#pdf-viewer-zoom-level').text(Math.round(newZoom * 100) + '%');
        $pagesContainer.css('min-height', (currentTop + 40) + 'px');
    }
    
    function fitToWidth() {
        const $pagesContainer = $('#pdf-viewer-pages');
        const viewportWidth = window.innerWidth;
        const maxPageWidth = viewportWidth - 80;
        
        const basePageWidth = Math.min(viewportWidth - 80, 800);
        viewerState.zoomLevel = maxPageWidth / basePageWidth;
        viewerState.zoomLevel = Math.max(0.5, Math.min(3.0, viewerState.zoomLevel));
        
        const $pages = $pagesContainer.find('.pdf-viewer-page');
        let currentTop = 40;
        
        $pages.each(function() {
            const $page = $(this);
            const $img = $page.find('img');
            
            // Calculate height based on aspect ratio
            const imgWidth = $img[0].naturalWidth || $img[0].width;
            const imgHeight = $img[0].naturalHeight || $img[0].height;
            const aspectRatio = imgHeight / imgWidth;
            const pageHeight = maxPageWidth * aspectRatio;
            
            $page.css({
                width: maxPageWidth + 'px',
                height: pageHeight + 'px',
                left: ((viewportWidth - maxPageWidth) / 2) + 'px',
                top: currentTop + 'px',
                transition: 'all 0.3s ease'
            });
            
            currentTop += pageHeight + 20;
        });
        
        $('#pdf-viewer-zoom-level').text(Math.round(viewerState.zoomLevel * 100) + '%');
        $pagesContainer.css('min-height', (currentTop + 40) + 'px');
    }
    
        // Viewer event handlers
    $(document).ready(function() {
        $('#pdf-viewer-close').on('click', function() {
            closeDocumentViewer();
        });
        
        $('#pdf-viewer-zoom-in').on('click', function() {
            zoomViewer(0.25);
        });
        
        $('#pdf-viewer-zoom-out').on('click', function() {
            zoomViewer(-0.25);
        });
        
        $('#pdf-viewer-fit-width').on('click', function() {
            fitToWidth();
        });
        
        // Close on overlay click
        $('#pdf-viewer-overlay').on('click', function(e) {
            if (e.target === this) {
                closeDocumentViewer();
            }
        });
        
        // Prevent closing when clicking on viewer content
        $('.pdf-viewer-container').on('click', function(e) {
            e.stopPropagation();
        });
        
        // Handle window resize
        let resizeTimeout;
        $(window).on('resize', function() {
            if (viewerState.isOpen) {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(function() {
                    // Recalculate page positions on resize
                    const $pagesContainer = $('#pdf-viewer-pages');
                    const $pages = $pagesContainer.find('.pdf-viewer-page');
                    const viewportWidth = window.innerWidth;
                    const basePageWidth = Math.min(viewportWidth - 80, 800);
                    const pageWidth = basePageWidth * viewerState.zoomLevel;
                    
                    let currentTop = 40;
                    
                    $pages.each(function() {
                        const $page = $(this);
                        const $img = $page.find('img');
                        const imgWidth = $img[0].naturalWidth || $img[0].width;
                        const imgHeight = $img[0].naturalHeight || $img[0].height;
                        const aspectRatio = imgHeight / imgWidth;
                        const pageHeight = pageWidth * aspectRatio;
                        
                        $page.css({
                            width: pageWidth + 'px',
                            height: pageHeight + 'px',
                            left: ((viewportWidth - pageWidth) / 2) + 'px',
                            top: currentTop + 'px'
                        });
                        
                        currentTop += pageHeight + 20;
                    });
                    
                    $pagesContainer.css('min-height', (currentTop + 40) + 'px');
                }, 250);
            }
        });
        
        // Handle ESC key to close viewer
        $(document).on('keydown', function(e) {
            if (e.key === 'Escape') {
                if (viewerState.isOpen) {
                    closeDocumentViewer();
                } else if (typeof closeAIInput !== 'undefined') {
                    closeAIInput();
                }
            }
        });
    });
    
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
                        $('body').addClass('dragging-active');
                        
                        // Store current dragged document
                        currentDraggedDocument = event.target;
                        
                        // Set highest z-index while dragging
                        event.target.style.zIndex = 10000;
                        
                        // Show action tiles for this document
                        const docId = event.target.getAttribute('data-id');
                        const docData = documentDataMap.get(event.target);
                        if (docData && docData.actions && docData.actions.length > 0) {
                            showActionTiles(docData.actions);
                        }
                        
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
                        
                        // Check if cursor is in right 25% of screen
                        const viewportWidth = window.innerWidth;
                        const rightZoneStart = viewportWidth * 0.75;
                        const $actionContainer = $('#action-tiles-container');
                        
                        if (event.clientX >= rightZoneStart && $actionContainer.hasClass('visible')) {
                            // Slide action tiles into view
                            $actionContainer.addClass('in-view');
                        } else {
                            // Slide action tiles out of view
                            $actionContainer.removeClass('in-view');
                        }
                        
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
                        const target = event.target;
                        $(target).removeClass('dragging');
                        $('body').removeClass('dragging-active');
                        
                        // Check if dropped on action tile first (using elementFromPoint as fallback)
                        const dropX = event.clientX;
                        const dropY = event.clientY;
                        const elementAtPoint = document.elementFromPoint(dropX, dropY);
                        const $actionTile = $(elementAtPoint).closest('.action-tile');
                        
                        let droppedOnActionTile = false;
                        if ($actionTile.length) {
                            const actionText = $actionTile.attr('data-action');
                            const docData = documentDataMap.get(target);
                            if (docData && actionText) {
                                // Store original state before transforming
                                const currentTransform = window.getComputedStyle(target).transform;
                                const matrix = new DOMMatrix(currentTransform);
                                const currentX = parseFloat(target.getAttribute('data-x')) || 0;
                                const currentY = parseFloat(target.getAttribute('data-y')) || 0;
                                const currentTop = parseFloat(target.style.top) || 0;
                                const currentLeft = parseFloat(target.style.left) || 0;
                                
                                documentOriginalState = {
                                    element: target,
                                    x: currentX,
                                    y: currentY,
                                    top: currentTop,
                                    left: currentLeft,
                                    scale: matrix.a || 1,
                                    transform: currentTransform
                                };
                                
                                // Scale down and shift right
                                scaleDownAndShiftRight(target);
                                
                                showShareDialog(actionText, docData.label || docData.name, target);
                                droppedOnActionTile = true;
                            }
                        }
                        
                        // Hide action tiles
                        hideActionTiles();
                        
                        if (!droppedOnActionTile) {
                            // Check if dropped on left panel
                            const panelRect = $('#left-panel')[0].getBoundingClientRect();
                            
                            if (dropX >= panelRect.left && dropX <= panelRect.right &&
                                dropY >= panelRect.top && dropY <= panelRect.bottom) {
                                // Remove document from canvas
                                const docName = target.getAttribute('data-name');
                                if (docName) {
                                    documentsOnCanvas.delete(docName);
                                    
                                    // Remove document element
                                    documentDataMap.delete(target);
                                    $(target).remove();
                                    
                                    // Remove tooltip if exists
                                    const docId = target.getAttribute('data-id');
                                    $(`.rectangle-tooltip[data-rect-id="${docId}"]`).remove();
                                    
                                    // Update sidebar item state
                                    const $listItem = $(`.document-list-item[data-doc-name="${docName}"]`);
                                    updateDocumentListItemState($listItem, docName);
                                }
                            } else {
                                // Update z-index based on final scale when released
                                const currentTransform = window.getComputedStyle(target).transform;
                                const matrix = new DOMMatrix(currentTransform);
                                const finalScale = matrix.a || 1;
                                updateZIndex(target, finalScale);
                            }
                        }
                        
                        // Clear current dragged document
                        currentDraggedDocument = null;
                        
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
            .attr('data-name', rectData.name || '')
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
        
        // Store document data for action tiles
        documentDataMap.set($rect[0], rectData);
        
        // Track document on canvas
        if (rectData.name) {
            documentsOnCanvas.add(rectData.name);
        }
        
        // Create tooltip if label exists
        if (rectData.label) {
            const $tooltip = $('<div>')
                .addClass('rectangle-tooltip')
                .text(rectData.label)
                .attr('data-rect-id', rectData.id);
            
            $('body').append($tooltip);
            
            // Show tooltip on hover
            $rect.on('mouseenter', function(e) {
                const rect = this;
                const rectRect = rect.getBoundingClientRect();
                const tooltip = $tooltip[0];
                
                // Position tooltip above or below based on available space
                const spaceAbove = rectRect.top;
                const spaceBelow = window.innerHeight - rectRect.bottom;
                const showAbove = spaceAbove > spaceBelow;
                
                $tooltip.removeClass('top bottom').addClass(showAbove ? 'top' : 'bottom');
                
                // Calculate position
                const rectCenterX = rectRect.left + rectRect.width / 2;
                const tooltipRect = tooltip.getBoundingClientRect();
                const tooltipX = rectCenterX - tooltipRect.width / 2;
                
                // Keep tooltip within viewport
                const minX = 10;
                const maxX = window.innerWidth - tooltipRect.width - 10;
                const finalX = Math.max(minX, Math.min(maxX, tooltipX));
                
                if (showAbove) {
                    $tooltip.css({
                        left: finalX + 'px',
                        top: (rectRect.top - tooltipRect.height - 10) + 'px'
                    });
                } else {
                    $tooltip.css({
                        left: finalX + 'px',
                        top: (rectRect.bottom + 10) + 'px'
                    });
                }
                
                $tooltip.addClass('show');
            });
            
            // Hide tooltip on mouse leave
            $rect.on('mouseleave', function() {
                $tooltip.removeClass('show');
            });
            
            // Update tooltip position during drag
            $rect.on('mousemove', function() {
                if ($tooltip.hasClass('show')) {
                    const rect = this;
                    const rectRect = rect.getBoundingClientRect();
                    const tooltipRect = $tooltip[0].getBoundingClientRect();
                    const showAbove = $tooltip.hasClass('top');
                    const rectCenterX = rectRect.left + rectRect.width / 2;
                    const tooltipX = rectCenterX - tooltipRect.width / 2;
                    const minX = 10;
                    const maxX = window.innerWidth - tooltipRect.width - 10;
                    const finalX = Math.max(minX, Math.min(maxX, tooltipX));
                    
                    if (showAbove) {
                        $tooltip.css({
                            left: finalX + 'px',
                            top: (rectRect.top - tooltipRect.height - 10) + 'px'
                        });
                    } else {
                        $tooltip.css({
                            left: finalX + 'px',
                            top: (rectRect.bottom + 10) + 'px'
                        });
                    }
                }
            });
        }
        
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
        
        // Set initial scale and z-index based on position
        setTimeout(() => {
            updateElementScale($rect[0]);
            // Also set initial z-index
            const baseTop = parseFloat($rect[0].style.top) || 0;
            const y = parseFloat($rect[0].getAttribute('data-y')) || 0;
            const size = getElementSize($rect[0]);
            const centerY = baseTop + y + size.height / 2;
            const scale = calculateScaleFromY(centerY, size.width);
            updateZIndex($rect[0], scale);
        }, 0);
        
        return $rect;
    }

    // Track rectangle count for new rectangles
    let rectangleCount = 0;
    // Track which documents are on canvas (by name/id)
    let documentsOnCanvas = new Set();
    let allDocumentsData = [];
    // Store document data by element for action tiles
    let documentDataMap = new Map();
    // Store original position/transform when dropping on action tile
    let documentOriginalState = null;
    
    // Make document tracking accessible globally for ai.js
    window.documentsOnCanvas = documentsOnCanvas;
    window.documentDataMap = documentDataMap;
    
    // Left panel functionality
    const LEFT_PANEL_TRIGGER_DISTANCE = 30;
    let panelVisible = false;
    let panelHovered = false;
    
    // Track mouse position for panel trigger
    $(document).on('mousemove', function(e) {
        const distanceFromLeft = e.clientX;
        
        if (distanceFromLeft <= LEFT_PANEL_TRIGGER_DISTANCE && !panelVisible) {
            $('#left-panel').addClass('visible');
            $('#folder-indicator').addClass('hidden');
            panelVisible = true;
        } else if (distanceFromLeft > LEFT_PANEL_TRIGGER_DISTANCE + 280 && panelVisible && !panelHovered) {
            // Hide panel if mouse moves away (with some buffer) and not hovering panel
            $('#left-panel').removeClass('visible');
            $('#folder-indicator').removeClass('hidden');
            panelVisible = false;
        }
    });
    
    // Keep panel visible when hovering over it
    $('#left-panel').on('mouseenter', function() {
        $(this).addClass('visible');
        $('#folder-indicator').addClass('hidden');
        panelVisible = true;
        panelHovered = true;
    });
    
    $('#left-panel').on('mouseleave', function(e) {
        panelHovered = false;
        // Hide panel if mouse moves away from left edge
        if (e.clientX > LEFT_PANEL_TRIGGER_DISTANCE + 280) {
            $(this).removeClass('visible');
            $('#folder-indicator').removeClass('hidden');
            panelVisible = false;
        }
    });
    
    // Create document list item in sidebar
    function createDocumentListItem(docData) {
        const $item = $('<div>')
            .addClass('document-list-item')
            .attr('data-doc-name', docData.name)
            .attr('data-doc-id', docData.id);
        
        const $icon = $('<div>')
            .addClass('document-list-item-icon')
            .text('📄');
        
        const $content = $('<div>').addClass('document-list-item-content');
        const $title = $('<div>')
            .addClass('document-list-item-title')
            .text(docData.label || docData.name);
        
        const $subtitle = $('<div>')
            .addClass('document-list-item-subtitle')
            .text(`${docData.pages ? docData.pages.length : 0} page${docData.pages && docData.pages.length !== 1 ? 's' : ''}`);
        
        $content.append($title).append($subtitle);
        $item.append($icon).append($content);
        
        // Set initial visibility state
        updateDocumentListItemState($item, docData.name);
        
        return $item;
    }
    
    // Update sidebar item visibility based on whether document is on canvas
    function updateDocumentListItemState($item, docName) {
        if (documentsOnCanvas.has(docName)) {
            // Hide item if document is on canvas
            $item.hide();
        } else {
            // Show item if document is not on canvas
            $item.show();
            const docData = allDocumentsData.find(d => d.name === docName);
            if (docData) {
                $item.find('.document-list-item-subtitle').text(`${docData.pages ? docData.pages.length : 0} page${docData.pages && docData.pages.length !== 1 ? 's' : ''}`);
            }
        }
    }
    
    // Make updateDocumentListItemState accessible globally for ai.js
    window.updateDocumentListItemState = updateDocumentListItemState;
    
    // Store current dragged document for action tiles
    let currentDraggedDocument = null;
    
    // Show action tiles for a document
    function showActionTiles(actions) {
        const $container = $('#action-tiles-container');
        $container.empty();
        
        actions.forEach(function(action) {
            const $tile = $('<div>')
                .addClass('action-tile')
                .attr('data-action', action)
                .html('<div class="action-tile-title">' + action + '</div>');
            
            $container.append($tile);
            
            // Make tile a dropzone - use lower overlap threshold
            interact($tile[0])
                .dropzone({
                    accept: '.rectangle',
                    overlap: 0.1,
                    ondropactivate: function(event) {
                        $(event.target).addClass('drag-over');
                    },
                    ondragenter: function(event) {
                        $(event.target).addClass('drag-over');
                    },
                    ondragleave: function(event) {
                        $(event.target).removeClass('drag-over');
                    },
                    ondrop: function(event) {
                        const actionText = $(event.target).attr('data-action');
                        const draggableElement = event.relatedTarget;
                        if (draggableElement) {
                            const docData = documentDataMap.get(draggableElement);
                            if (docData) {
                                // Store original state before transforming
                                const currentTransform = window.getComputedStyle(draggableElement).transform;
                                const matrix = new DOMMatrix(currentTransform);
                                const currentX = parseFloat(draggableElement.getAttribute('data-x')) || 0;
                                const currentY = parseFloat(draggableElement.getAttribute('data-y')) || 0;
                                const currentTop = parseFloat(draggableElement.style.top) || 0;
                                const currentLeft = parseFloat(draggableElement.style.left) || 0;
                                
                                documentOriginalState = {
                                    element: draggableElement,
                                    x: currentX,
                                    y: currentY,
                                    top: currentTop,
                                    left: currentLeft,
                                    scale: matrix.a || 1,
                                    transform: currentTransform
                                };
                                
                                // Scale down and shift right
                                scaleDownAndShiftRight(draggableElement);
                                
                                showShareDialog(actionText, docData.label || docData.name, draggableElement);
                            }
                        }
                        $(event.target).removeClass('drag-over');
                    },
                    ondropdeactivate: function(event) {
                        $(event.target).removeClass('drag-over');
                    }
                });
        });
        
        $container.addClass('visible');
    }
    
    // Hide action tiles
    function hideActionTiles() {
        $('#action-tiles-container').removeClass('visible').removeClass('in-view').empty();
    }
    
    // Scale down and shift document to the right
    function scaleDownAndShiftRight(element) {
        const viewportWidth = window.innerWidth;
        const size = getElementSize(element);
        
        // Scale down to 0.5x
        const newScale = 0.5;
        
        // Shift to the right (about 60% from left edge)
        const newLeft = viewportWidth * 0.6;
        const currentTop = parseFloat(element.style.top) || 0;
        
        element.style.top = currentTop + 'px';
        element.style.left = newLeft + 'px';
        element.style.transition = 'transform 0.3s ease-out, left 0.3s ease-out';
        
        const currentX = parseFloat(element.getAttribute('data-x')) || 0;
        const currentY = parseFloat(element.getAttribute('data-y')) || 0;
        element.style.transform = `translate(${currentX}px, ${currentY}px) scale(${newScale})`;
        
        updateZIndex(element, newScale);
        
        // Remove transition after animation
        setTimeout(() => {
            element.style.transition = '';
        }, 300);
    }
    
    // Restore document to original position
    function restoreDocumentPosition() {
        if (!documentOriginalState) return;
        
        const { element, x, y, top, left, scale } = documentOriginalState;
        
        element.style.transition = 'transform 0.3s ease-out, left 0.3s ease-out, top 0.3s ease-out';
        element.style.top = top + 'px';
        element.style.left = left + 'px';
        element.setAttribute('data-x', x);
        element.setAttribute('data-y', y);
        element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        
        updateZIndex(element, scale);
        
        // Remove transition after animation
        setTimeout(() => {
            element.style.transition = '';
        }, 300);
        
        documentOriginalState = null;
    }
    
    // Show share/print dialog
    function showShareDialog(action, docLabel, docElement) {
        const $dialog = $('#share-dialog');
        const $title = $('#dialog-title');
        const $message = $('#dialog-message');
        
        // Store reference to document element
        $dialog.data('doc-element', docElement);
        
        // Determine if it's a print or share action
        const isPrint = action.toLowerCase().includes('print');
        
        if (isPrint) {
            $title.text('Print Document');
            $message.text(`Printing "${docLabel}"...`);
        } else {
            $title.text('Share Document');
            $message.text(`Sharing "${docLabel}" via ${action}...`);
        }
        
        $dialog.addClass('show');
    }
    
    // Close share dialog
    $('#dialog-close').on('click', function() {
        restoreDocumentPosition();
        $('#share-dialog').removeClass('show');
    });
    
    // Cancel button
    $('#dialog-cancel').on('click', function() {
        restoreDocumentPosition();
        $('#share-dialog').removeClass('show');
    });
    
    // Share button - keep document where it is
    $('#dialog-share').on('click', function() {
        documentOriginalState = null; // Clear original state since we're keeping it
        $('#share-dialog').removeClass('show');
    });
    
    // Share and Close button - remove document
    $('#dialog-share-close').on('click', function() {
        const $dialog = $('#share-dialog');
        const docElement = $dialog.data('doc-element');
        
        if (docElement) {
            const docName = docElement.getAttribute('data-name');
            if (docName) {
                documentsOnCanvas.delete(docName);
                
                // Remove document element
                documentDataMap.delete(docElement);
                $(docElement).remove();
                
                // Remove tooltip if exists
                const docId = docElement.getAttribute('data-id');
                $(`.rectangle-tooltip[data-rect-id="${docId}"]`).remove();
                
                // Update sidebar item state
                const $listItem = $(`.document-list-item[data-doc-name="${docName}"]`);
                updateDocumentListItemState($listItem, docName);
            }
        }
        
        documentOriginalState = null;
        $('#share-dialog').removeClass('show');
    });
    
    // Close dialog when clicking outside
    $('#share-dialog').on('click', function(e) {
        if (e.target === this) {
            restoreDocumentPosition();
            $(this).removeClass('show');
        }
    });
    
    // Highlight existing document on canvas
    function highlightExistingDocument(docName) {
        const $existingDoc = $(`.rectangle[data-name="${docName}"]`);
        if ($existingDoc.length) {
            $existingDoc.addClass('highlight-existing');
            setTimeout(() => {
                $existingDoc.removeClass('highlight-existing');
            }, 2000);
        }
    }
    
    // Make sidebar items draggable
    function makeSidebarItemDraggable(element, docData) {
        interact(element)
            .draggable({
                listeners: {
                    start(event) {
                        $(event.target).addClass('dragging');
                        
                        // Create a ghost element
                        const $ghost = $(event.target).clone()
                            .addClass('drag-ghost')
                            .css({
                                width: $(event.target).width() + 'px',
                                opacity: 0.8
                            });
                        $('body').append($ghost);
                    },
                    move(event) {
                        const $ghost = $('.drag-ghost');
                        if ($ghost.length) {
                            $ghost.css({
                                left: (event.clientX - $ghost.width() / 2) + 'px',
                                top: (event.clientY - 20) + 'px'
                            });
                        }
                    },
                    end(event) {
                        $(event.target).removeClass('dragging');
                        $('.drag-ghost').remove();
                        
                        // Check if dropped on canvas
                        const dropX = event.clientX;
                        const dropY = event.clientY;
                        const canvasRect = $('#canvas')[0].getBoundingClientRect();
                        
                        if (dropX >= canvasRect.left && dropX <= canvasRect.right &&
                            dropY >= canvasRect.top && dropY <= canvasRect.bottom) {
                            
                            // Create document at drop position
                            const canvasX = dropX - canvasRect.left - (docData.width || 200) / 2;
                            const canvasY = dropY - canvasRect.top - (docData.height || 280) / 2;
                            
                            // Create a copy of the document data with new position
                            const newDocData = $.extend({}, docData, {
                                id: ++rectangleCount,
                                x: canvasX,
                                y: canvasY
                            });
                            
                            createRectangle(newDocData);
                            documentsOnCanvas.add(docData.name);
                            
                            // Hide sidebar item since document is now on canvas
                            const $listItem = $(`.document-list-item[data-doc-name="${docData.name}"]`);
                            updateDocumentListItemState($listItem, docData.name);
                        }
                    }
                }
            });
    }

    // Initialize left panel dropzone
    function initializePanelDropzone() {
        const leftPanel = document.getElementById('left-panel');
        if (leftPanel) {
            interact(leftPanel)
                .dropzone({
                    accept: '.rectangle',
                    overlap: 0.25,
                    ondropactivate: function(event) {
                        event.target.classList.add('drop-active');
                    },
                    ondragenter: function(event) {
                        const draggableElement = event.relatedTarget;
                        if (draggableElement) {
                            $('#left-panel').addClass('drop-target');
                        }
                    },
                    ondragleave: function(event) {
                        $('#left-panel').removeClass('drop-target');
                    },
                    ondrop: function(event) {
                        $('#left-panel').removeClass('drop-target');
                    },
                    ondropdeactivate: function(event) {
                        event.target.classList.remove('drop-active');
                        $('#left-panel').removeClass('drop-target');
                    }
                });
        }
    }
    
    // Load rectangles from JSON
    $.getJSON('data.json', function(data) {
        if (data.rectangles && Array.isArray(data.rectangles)) {
            // Store all documents data
            allDocumentsData = data.rectangles;
            
            // Set rectangle count to max ID from JSON
            rectangleCount = Math.max(...data.rectangles.map(r => r.id || 0), 0);
            
            // Populate sidebar with all documents (but don't create on canvas)
            const $documentList = $('#document-list');
            data.rectangles.forEach(function(rect) {
                const $listItem = createDocumentListItem(rect);
                $documentList.append($listItem);
                makeSidebarItemDraggable($listItem[0], rect);
            });
            
            // Initialize panel dropzone after documents are loaded
            initializePanelDropzone();
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
