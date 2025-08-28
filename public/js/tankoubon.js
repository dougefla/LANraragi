/**
 * Tankoubon Manager Frontend
 * Simple interface for managing tankoubon collections
 */

var tankoubonData = [];
var currentPage = 1;
var totalTankoubons = 0;
var tankoubonsPerPage = 100; // Default page size
var sortBy = 'name';
var sortOrder = 'asc';

// Mock Index object for compatibility with LRR.buildProgressDiv
var Index = {
    isProgressLocal: false
};

$(document).ready(function() {
    console.log("Tankoubon page loaded");
    
    // Initialize thumbnail cropping setting
    if (localStorage.cropthumbs === undefined) localStorage.cropthumbs = "false";
    if (localStorage.cropthumbs === "true") $("#thumbnail-crop").prop("checked", true);
    
    // Initialize thumbnail view mode
    if (localStorage.tankoubon_viewMode === undefined) localStorage.tankoubon_viewMode = "0"; // 0 = list, 1 = thumbnails
    
    // Initialize sorting and pagination settings
    if (localStorage.tankoubon_sortBy) sortBy = localStorage.tankoubon_sortBy;
    if (localStorage.tankoubon_sortOrder) sortOrder = localStorage.tankoubon_sortOrder;
    if (localStorage.tankoubon_itemsPerPage) {
        tankoubonsPerPage = localStorage.tankoubon_itemsPerPage === 'all' ? -1 : parseInt(localStorage.tankoubon_itemsPerPage);
    }
    
    // Set initial control values
    $("#sort-by").val(sortBy);
    $("#sort-order").val(sortOrder);
    $("#items-per-page").val(localStorage.tankoubon_itemsPerPage || "100");
    
    console.log("Initial settings - view mode:", localStorage.tankoubon_viewMode, "sort:", sortBy, sortOrder, "per page:", tankoubonsPerPage);
    
    loadTankoubons();
    setupEventHandlers();
});

function setupEventHandlers() {
    // Create new tankoubon button
    $('#new-tankoubon-btn').on('click', function() {
        showCreateTankoubon();
    });
    
    // Thumbnail controls
    $("#thumbnail-crop").change(function () {
        localStorage.cropthumbs = $(this).prop("checked") ? "true" : "false";
        if (localStorage.tankoubon_viewMode === "1") {
            loadTankoubons(currentPage); // Reload thumbnails with new crop setting
        }
    });
    
    $("#toggle-thumbnail-view").click(function() {
        localStorage.tankoubon_viewMode = (localStorage.tankoubon_viewMode === "0") ? "1" : "0";
        updateViewMode();
        loadTankoubons(currentPage);
        return false;
    });
    
    // Sorting controls
    $("#sort-by").change(function() {
        sortBy = $(this).val();
        localStorage.tankoubon_sortBy = sortBy;
        currentPage = 1; // Reset to first page
        loadTankoubons(currentPage);
    });
    
    $("#sort-order").change(function() {
        sortOrder = $(this).val();
        localStorage.tankoubon_sortOrder = sortOrder;
        currentPage = 1; // Reset to first page
        loadTankoubons(currentPage);
    });
    
    // Items per page control
    $("#items-per-page").change(function() {
        var selectedValue = $(this).val();
        localStorage.tankoubon_itemsPerPage = selectedValue;
        tankoubonsPerPage = selectedValue === 'all' ? -1 : parseInt(selectedValue);
        currentPage = 1; // Reset to first page
        loadTankoubons(currentPage);
    });
    
    // Refresh button
    $("#refresh-btn").click(function() {
        loadTankoubons(currentPage);
    });
    
    // Pagination controls
    $(document).on('click', '.page-link', function(e) {
        e.preventDefault();
        var $link = $(this);
        var action = $link.attr('value');
        
        // Don't handle disabled buttons
        if ($link.css('cursor') === 'not-allowed' || $link.css('color') === 'rgb(204, 204, 204)') {
            return false;
        }
        
        var targetPage = currentPage;
        var totalPages = Math.ceil(totalTankoubons / (tankoubonsPerPage === -1 ? totalTankoubons : tankoubonsPerPage));
        
        switch(action) {
            case 'outer-left':
                targetPage = 1;
                break;
            case 'left':
                targetPage = Math.max(1, currentPage - 1);
                break;
            case 'right':
                targetPage = Math.min(totalPages, currentPage + 1);
                break;
            case 'outer-right':
                targetPage = totalPages;
                break;
        }
        
        if (targetPage !== currentPage) {
            loadTankoubons(targetPage);
        }
        
        return false;
    });
}

function loadTankoubons(page = 1) {
    console.log("Loading tankoubons for page:", page);
    $('#loading-spinner').show();
    
    currentPage = page;
    
    // Build API URL with pagination and sorting parameters
    var apiUrl = '/api/tankoubons';
    var params = [];
    
    // Add pagination if not showing all
    if (tankoubonsPerPage !== -1) {
        params.push('page=' + page);
        params.push('pagesize=' + tankoubonsPerPage);
    }
    
    // Add sorting parameters
    params.push('sort=' + sortBy);
    params.push('order=' + sortOrder);
    
    if (params.length > 0) {
        apiUrl += '?' + params.join('&');
    }
    
    console.log("API URL:", apiUrl);
    
    $.get(apiUrl)
        .done(function(data) {
            console.log("Tankoubon API response:", data);
            if (data.result) {
                tankoubonData = data.result;
                totalTankoubons = data.total || tankoubonData.length;
                
                // Update the page display info
                var displayPerPage = tankoubonsPerPage === -1 ? totalTankoubons : tankoubonsPerPage;
                var totalPages = Math.ceil(totalTankoubons / displayPerPage);
                console.log("Loaded", tankoubonData.length, "tankoubons (page", page, "of", totalPages, ") - Total:", totalTankoubons);
                
                renderTankoubonList();
                renderPagination();
                
                // Update status info
                updateStatusInfo();
            } else {
                showError('Failed to load tankoubons');
            }
        })
        .fail(function(xhr, status, error) {
            console.error("Failed to load tankoubons:", status, error);
            showError('Failed to connect to server: ' + error);
        })
        .always(function() {
            $('#loading-spinner').hide();
        });
}

function updateViewMode() {
    const isThumbnailMode = localStorage.tankoubon_viewMode === "1";
    console.log("Updating view mode to:", isThumbnailMode ? "thumbnails" : "list");
    
    if (isThumbnailMode) {
        $("#tankoubon-list").hide();
        $("#thumbs_container").show();
        $("#toggle-thumbnail-view").removeClass("fa-th").addClass("fa-list").attr("title", "Switch to List Mode");
    } else {
        $("#thumbs_container").hide();
        $("#tankoubon-list").show();
        $("#toggle-thumbnail-view").removeClass("fa-list").addClass("fa-th").attr("title", "Toggle Thumbnail View");
    }
}

function renderTankoubonList() {
    console.log("renderTankoubonList called, mode:", localStorage.tankoubon_viewMode);
    
    // Always call updateViewMode to ensure UI is in the correct state
    updateViewMode();
    
    if (localStorage.tankoubon_viewMode === "1") {
        console.log("Rendering thumbnails");
        renderTankoubonThumbnails();
    } else {
        console.log("Rendering cards");
        renderTankoubonCards();
    }
}

function updateStatusInfo() {
    // Create or update status info display
    var statusHtml = '<div style="text-align: center; margin: 10px; color: #888; font-size: 13px;">';
    statusHtml += 'Showing ' + tankoubonData.length + ' of ' + totalTankoubons + ' tankoubons';
    if (tankoubonsPerPage !== -1) {
        var totalPages = Math.ceil(totalTankoubons / tankoubonsPerPage);
        statusHtml += ' (Page ' + currentPage + ' of ' + totalPages + ')';
    }
    statusHtml += ' • Sorted by ' + sortBy + ' (' + sortOrder + ')';
    statusHtml += '</div>';
    
    // Remove existing status and add new one
    $('.tankoubon-status').remove();
    $('#tankoubon-list').after('<div class="tankoubon-status">' + statusHtml + '</div>');
}

function renderTankoubonCards() {
    var container = $('#tankoubon-list');
    container.empty();
    
    if (tankoubonData.length === 0) {
        container.html('<div style="text-align: center; color: #666; margin: 50px; font-size: 16px;"><i class="fa fa-inbox"></i><br><br>No tankoubons found.<br><br>Create your first tankoubon to get started!</div>');
        return;
    }
    
    // Compact list-style layout
    var html = '<div style="max-width: 800px; margin: 0 auto;">';
    
    tankoubonData.forEach(function(tank) {
        var archiveCount = tank.archives ? tank.archives.length : 0;
        var hasArchives = archiveCount > 0;
        
        // Compact horizontal list item
        html += '<div class="tankoubon-list-item" style="display: flex; align-items: center; padding: 12px; margin: 8px 0; background: rgba(255,255,255,0.05); border-radius: 6px; border-left: 3px solid #007bff;">';
        
        // Icon and basic info
        html += '<div style="flex-shrink: 0; margin-right: 15px;">';
        html += '<div style="font-size: 24px;">📚</div>';
        html += '</div>';
        
        // Main content
        html += '<div style="flex-grow: 1; min-width: 0;">';
        html += '<div style="font-weight: bold; font-size: 16px; margin-bottom: 4px; color: #fff;">' + LRR.encodeHTML(tank.name) + '</div>';
        html += '<div style="font-size: 12px; color: #aaa; margin-bottom: 2px;">ID: ' + LRR.encodeHTML(tank.id) + '</div>';
        html += '<div style="font-size: 13px; color: #ccc;">';
        html += '<i class="fa fa-book" style="margin-right: 5px;"></i>' + archiveCount + ' archives';
        if (tank.summary) {
            html += ' • ' + LRR.encodeHTML(tank.summary.substring(0, 80) + (tank.summary.length > 80 ? '...' : ''));
        }
        html += '</div>';
        html += '</div>';
        
        // Action buttons (compact)
        html += '<div style="flex-shrink: 0; display: flex; gap: 6px;">';
        
        // View button
        html += '<button class="stdbtn view-archives-btn" data-tank-id="' + LRR.encodeHTML(tank.id) + '" data-tank-name="' + LRR.encodeHTML(tank.name) + '" ';
        html += 'style="padding: 6px 12px; font-size: 12px;" title="View archives">👁 ' + archiveCount + '</button>';
        
        // Management buttons for logged users
        if ($('body').data('user-logged') === "1") {
            html += '<button class="stdbtn add-archives-btn" data-tank-id="' + LRR.encodeHTML(tank.id) + '" data-tank-name="' + LRR.encodeHTML(tank.name) + '" ';
            html += 'style="padding: 6px 10px; font-size: 12px;" title="Add archives">➕</button>';
            
            if (hasArchives) {
                html += '<button class="stdbtn manage-archives-btn" data-tank-id="' + LRR.encodeHTML(tank.id) + '" data-tank-name="' + LRR.encodeHTML(tank.name) + '" ';
                html += 'style="padding: 6px 10px; font-size: 12px;" title="Manage archives">📋</button>';
            }
            
            html += '<button class="stdbtn edit-tankoubon-btn" data-tank-id="' + LRR.encodeHTML(tank.id) + '" data-tank-name="' + LRR.encodeHTML(tank.name) + '" ';
            html += 'style="padding: 6px 10px; font-size: 12px;" title="Edit tankoubon">✏</button>';
            
            html += '<button class="stdbtn delete-tankoubon-btn" data-tank-id="' + LRR.encodeHTML(tank.id) + '" data-tank-name="' + LRR.encodeHTML(tank.name) + '" ';
            html += 'style="padding: 6px 10px; font-size: 12px; background-color: #d32f2f; color: white;" title="Delete tankoubon">🗑</button>';
        }
        
        html += '</div>';
        html += '</div>';
    });
    
    html += '</div>';
    container.html(html);
    
    // Attach event handlers to the new buttons
    attachEventHandlers();
}

function renderTankoubonThumbnails() {
    var container = $('#thumbs_container');
    container.empty();
    
    if (tankoubonData.length === 0) {
        container.html('<div style="text-align: center; color: #666; margin: 50px; font-size: 16px;"><i class="fa fa-inbox"></i><br><br>No tankoubons found.<br><br>Create your first tankoubon to get started!</div>');
        return;
    }
    
    tankoubonData.forEach(function(tank, index) {
        var archiveCount = tank.archives ? tank.archives.length : 0;
        
        // Determine thumbnail source
        var thumbnailUrl;
        if (tank.thumbnail && tank.thumbnail !== '') {
            // Use custom selected thumbnail
            thumbnailUrl = '/api/archives/' + tank.thumbnail + '/thumbnail';
        } else if (tank.archives && tank.archives.length > 0) {
            // Fallback to first archive
            thumbnailUrl = '/api/archives/' + tank.archives[0] + '/thumbnail';
        } else {
            thumbnailUrl = '/img/noThumb.png';
        }
        
        // Create compact thumbnail HTML with lazy loading
        var thumbnailHtml = '<div class="compact-thumb" data-tank-id="' + LRR.encodeHTML(tank.id) + '" data-tank-name="' + LRR.encodeHTML(tank.name) + '" style="position: relative; cursor: pointer; overflow: hidden;">';
        
        // Use lazy loading for thumbnails beyond the first row (12 items)
        if (index < 12) {
            // Load immediately for first row
            thumbnailHtml += '<img src="' + thumbnailUrl + '" onerror="this.src=\'/img/noThumb.png\';" />';
        } else {
            // Lazy load for subsequent images
            thumbnailHtml += '<img data-src="' + thumbnailUrl + '" src="/img/noThumb.png" class="lazy-thumbnail" onerror="this.src=\'/img/noThumb.png\';" />';
        }
        
        // Small overlay with archive count only
        if (archiveCount > 0) {
            thumbnailHtml += '<div style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.7); color: white; padding: 1px 4px; font-size: 10px; border-radius: 2px; font-weight: bold;">' + archiveCount + '</div>';
        }
        
        // Add tankoubon name on hover for identification
        thumbnailHtml += '<div class="thumb-title" style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.8); color: white; padding: 4px; font-size: 11px; text-align: center; transform: translateY(100%); transition: transform 0.2s ease; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + LRR.encodeHTML(tank.name) + '</div>';
        
        thumbnailHtml += '</div>';
        
        container.append(thumbnailHtml);
    });
    
    // Initialize lazy loading
    initializeLazyLoading();
    
    // Add hover effects for title display
    $('#thumbs_container .compact-thumb').hover(
        function() {
            $(this).find('.thumb-title').css('transform', 'translateY(0)');
        },
        function() {
            $(this).find('.thumb-title').css('transform', 'translateY(100%)');
        }
    );
    
    // Attach click handlers
    $('#thumbs_container .compact-thumb').on('click', function() {
        var tankId = $(this).data('tank-id');
        var tankName = $(this).data('tank-name');
        showArchives(tankId, tankName);
    });
    
    // Add right-click context menu
    attachThumbnailEventHandlers();
}

function initializeLazyLoading() {
    // Simple lazy loading implementation
    var lazyImages = document.querySelectorAll('.lazy-thumbnail');
    
    if ('IntersectionObserver' in window) {
        // Modern browsers with IntersectionObserver
        var imageObserver = new IntersectionObserver(function(entries, observer) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var image = entry.target;
                    var dataSrc = image.getAttribute('data-src');
                    if (dataSrc) {
                        // Add loading indicator
                        image.style.filter = 'blur(2px)';
                        
                        // Load the image
                        image.src = dataSrc;
                        image.onload = function() {
                            image.style.filter = 'none';
                            image.classList.remove('lazy-thumbnail');
                        };
                        image.removeAttribute('data-src');
                        imageObserver.unobserve(image);
                    }
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '50px'
        });
        
        lazyImages.forEach(function(image) {
            imageObserver.observe(image);
        });
    } else {
        // Fallback for older browsers
        lazyImages.forEach(function(image) {
            var dataSrc = image.getAttribute('data-src');
            if (dataSrc) {
                image.src = dataSrc;
                image.removeAttribute('data-src');
                image.classList.remove('lazy-thumbnail');
            }
        });
    }
}

function attachEventHandlers() {
    $('.view-archives-btn').on('click', function() {
        var tankId = $(this).data('tank-id');
        var tankName = $(this).data('tank-name');
        showArchives(tankId, tankName);
    });
    
    $('.add-archives-btn').on('click', function() {
        var tankId = $(this).data('tank-id');
        var tankName = $(this).data('tank-name');
        showAddArchives(tankId, tankName);
    });
    
    $('.manage-archives-btn').on('click', function() {
        var tankId = $(this).data('tank-id');
        var tankName = $(this).data('tank-name');
        showManageArchives(tankId, tankName);
    });
    
    $('.edit-tankoubon-btn').on('click', function() {
        var tankId = $(this).data('tank-id');
        var tankName = $(this).data('tank-name');
        showEditTankoubon(tankId, tankName);
    });
    
    $('.delete-tankoubon-btn').on('click', function() {
        var tankId = $(this).data('tank-id');
        var tankName = $(this).data('tank-name');
        deleteTankoubon(tankId, tankName);
    });
}

function attachThumbnailEventHandlers() {
    // Add right-click context menu for compact tankoubon thumbnails
    $('#thumbs_container .compact-thumb').each(function() {
        var $thumb = $(this);
        var tankId = $thumb.data('tank-id');
        var tank = tankoubonData.find(t => t.id === tankId);
        if (!tank) return;
        
        // Add context menu functionality
        $thumb.contextmenu(function(e) {
            e.preventDefault();
            
            var actions = [
                {
                    text: '👁 View Archives (' + (tank.archives ? tank.archives.length : 0) + ')',
                    onclick: function() { showArchives(tankId, tank.name); }
                }
            ];
            
            if ($('body').data('user-logged') === "1") {
                actions.push(
                    {
                        text: '➕ Add Archives',
                        onclick: function() { showAddArchives(tankId, tank.name); }
                    },
                    {
                        text: '📋 Manage Archives', 
                        onclick: function() { showManageArchives(tankId, tank.name); }
                    },
                    {
                        text: '✏ Edit Tankoubon',
                        onclick: function() { showEditTankoubon(tankId, tank.name); }
                    },
                    {
                        text: '🗑 Delete Tankoubon',
                        onclick: function() { deleteTankoubon(tankId, tank.name); }
                    }
                );
            }
            
            // Create context menu
            var menu = $('<div class="context-menu" style="position: fixed; background: white; border: 1px solid #ccc; padding: 8px 0; z-index: 1000; box-shadow: 3px 3px 10px rgba(0,0,0,0.3); border-radius: 4px; min-width: 180px;"></div>');
            
            actions.forEach(function(action, index) {
                if (index > 0) {
                    menu.append('<div style="height: 1px; background: #eee; margin: 3px 0;"></div>');
                }
                var item = $('<div style="padding: 8px 15px; cursor: pointer; font-size: 13px;">' + action.text + '</div>');
                item.click(function() {
                    action.onclick();
                    menu.remove();
                });
                item.hover(
                    function() { $(this).css('background-color', '#f0f0f0'); },
                    function() { $(this).css('background-color', 'white'); }
                );
                menu.append(item);
            });
            
            menu.css({
                left: Math.min(e.pageX, $(window).width() - 200) + 'px',
                top: Math.min(e.pageY, $(window).height() - menu.height() - 50) + 'px'
            });
            
            $('body').append(menu);
            
            // Remove menu when clicking elsewhere
            $(document).one('click', function() {
                menu.remove();
            });
            
            return false;
        });
    });
}

function showCreateTankoubon() {
    $('#tankoubon-name').val('');
    $('#tankoubon-summary').val('');
    $('#tankoubon-tags').val('');
    $('#tankoubon-id').val('');
    
    Swal.fire({
        title: 'Create New Tankoubon',
        html: $('#create-tankoubon-modal').html(),
        showCancelButton: true,
        confirmButtonText: 'Create',
        cancelButtonText: 'Cancel',
        width: 600,
        didOpen: function() {
            // Focus on name input
            $('.swal2-container input[type="text"]').first().focus();
        }
    }).then((result) => {
        if (result.isConfirmed) {
            var name = $('.swal2-container #tankoubon-name').val().trim();
            var summary = $('.swal2-container #tankoubon-summary').val().trim();
            var tags = $('.swal2-container #tankoubon-tags').val().trim();
            var customId = $('.swal2-container #tankoubon-id').val().trim();
            
            // Validate input
            var errors = validateTankoubonData(name, summary, tags);
            if (errors.length > 0) {
                showError('Validation errors: ' + errors.join(', '));
                return;
            }
            
            createTankoubon(name, summary, tags, customId);
        }
    });
}

function createTankoubon(name, summary, tags, customId) {
    var postData = { name: name };
    if (customId !== '') {
        postData.tankid = customId;
    }
    if (summary !== '') {
        postData.summary = summary;
    }
    if (tags !== '') {
        postData.tags = tags;
    }
    
    // LANraragi API expects PUT for create operations
    $.ajax({
        url: '/api/tankoubons',
        type: 'PUT',
        data: postData
    })
    .done(function(data) {
        if (data.success) {
            showSuccess('Tankoubon "' + name + '" created successfully!');
            loadTankoubons(); // Refresh the list
        } else {
            showError('Failed to create tankoubon: ' + (data.error || 'Unknown error'));
        }
    })
    .fail(function(xhr) {
        showError('Failed to create tankoubon: ' + (xhr.responseJSON ? xhr.responseJSON.error : 'Network error'));
    });
}

function showEditTankoubon(tankId, currentName) {
    // Load current tankoubon data first
    $.get('/api/tankoubons/' + tankId + '?include_full_data=1')
        .done(function(data) {
            if (data.result) {
                var tank = data.result;
                $('#edit-tankoubon-name').val(tank.name || '');
                $('#edit-tankoubon-summary').val(tank.summary || '');
                $('#edit-tankoubon-tags').val(tank.tags || '');
                $('#edit-tankoubon-id').val(tankId);
                
                Swal.fire({
                    title: 'Edit Tankoubon',
                    html: $('#edit-tankoubon-modal').html(),
                    showCancelButton: true,
                    confirmButtonText: 'Update',
                    cancelButtonText: 'Cancel',
                    width: 700,
                    didOpen: function() {
                        $('.swal2-container #edit-tankoubon-name').val(tank.name || '');
                        $('.swal2-container #edit-tankoubon-summary').val(tank.summary || '');
                        $('.swal2-container #edit-tankoubon-tags').val(tank.tags || '');
                        $('.swal2-container #edit-tankoubon-id').val(tankId);
                        
                        // Load thumbnail selection
                        loadThumbnailSelection(tankId, tank.thumbnail || '', tank.full_data || []);
                        
                        $('.swal2-container input[type="text"]').first().focus();
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        var newName = $('.swal2-container #edit-tankoubon-name').val().trim();
                        var newSummary = $('.swal2-container #edit-tankoubon-summary').val().trim();
                        var newTags = $('.swal2-container #edit-tankoubon-tags').val().trim();
                        var tankId = $('.swal2-container #edit-tankoubon-id').val();
                        
                        // Validate input
                        var errors = validateTankoubonData(newName, newSummary, newTags);
                        if (errors.length > 0) {
                            showError('Validation errors: ' + errors.join(', '));
                            return;
                        }
                        
                        updateTankoubon(tankId, newName, newSummary, newTags);
                    }
                });
            } else {
                showError('Failed to load tankoubon data');
            }
        })
        .fail(function() {
            showError('Failed to load tankoubon data');
        });
}

function updateTankoubon(tankId, newName, newSummary, newTags) {
    var updateData = { name: newName };
    if (newSummary !== '') {
        updateData.summary = newSummary;
    }
    if (newTags !== '') {
        updateData.tags = newTags;
    }
    
    $.ajax({
        url: '/api/tankoubons/' + tankId,
        type: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(updateData)
    })
    .done(function(data) {
        if (data.success) {
            showSuccess('Tankoubon updated successfully!');
            loadTankoubons(); // Refresh the list
        } else {
            showError('Failed to update tankoubon: ' + (data.error || 'Unknown error'));
        }
    })
    .fail(function(xhr) {
        showError('Failed to update tankoubon: ' + (xhr.responseJSON ? xhr.responseJSON.error : 'Network error'));
    });
}

function loadThumbnailSelection(tankId, currentThumbnail, archives) {
    var container = $('.swal2-container #thumbnail-selection');
    
    if (archives && archives.length > 0) {
        var html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px;">';
        
        archives.forEach(function(archive) {
            var isSelected = currentThumbnail === archive.arcid;
            var selectedClass = isSelected ? ' selected' : '';
            
            html += '<div class="thumbnail-option' + selectedClass + '" data-archive-id="' + LRR.encodeHTML(archive.arcid) + '" ';
            html += 'style="border: 2px solid ' + (isSelected ? '#007bff' : '#ddd') + '; ';
            html += 'cursor: pointer; text-align: center; padding: 8px; border-radius: 4px; background: white; height: 180px; display: flex; flex-direction: column; overflow: hidden;">';
            html += '<img src="/api/archives/' + LRR.encodeHTML(archive.arcid) + '/thumbnail" ';
            html += 'style="width: 100%; height: 120px; object-fit: cover; border-radius: 3px; flex: none;" ';
            html += 'alt="' + LRR.encodeHTML(archive.title) + '" />';
            html += '<div style="font-size: 11px; margin-top: 5px; word-wrap: break-word; flex: 1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">';
            html += LRR.encodeHTML(archive.title.length > 30 ? archive.title.substring(0, 30) + '...' : archive.title);
            html += '</div>';
            html += '</div>';
        });
        
        html += '</div>';
        container.html(html);
        
        // Add click handlers
        container.find('.thumbnail-option').on('click', function() {
            var archiveId = $(this).data('archive-id');
            selectThumbnail(tankId, archiveId, $(this));
        });
    } else {
        container.html('<div style="text-align: center; padding: 20px; color: #666;">No archives found in this tankoubon.</div>');
    }
}

function selectThumbnail(tankId, archiveId, element) {
    // Update UI immediately
    $('.swal2-container .thumbnail-option').removeClass('selected').css('border-color', '#ddd');
    element.addClass('selected').css('border-color', '#007bff');
    
    // Send request to update thumbnail
    $.ajax({
        url: '/api/tankoubons/' + tankId + '/thumbnail',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ archive_id: archiveId })
    })
    .done(function(data) {
        if (data.success) {
            showSuccess('Thumbnail updated successfully!');
            // Update the tankoubon data locally to show the change immediately
            updateTankoubonThumbnailInData(tankId, archiveId);
            // Refresh the main display if we're in thumbnail mode
            if (localStorage.tankoubon_viewMode === "1") {
                updateTankoubonThumbnailInDOM(tankId, archiveId);
            }
        } else {
            showError('Failed to update thumbnail: ' + (data.error || 'Unknown error'));
        }
    })
    .fail(function(xhr) {
        showError('Failed to update thumbnail: ' + (xhr.responseJSON ? xhr.responseJSON.error : 'Network error'));
        // Revert UI changes on error
        $('.swal2-container .thumbnail-option').removeClass('selected').css('border-color', '#ddd');
    });
}

function updateTankoubonThumbnailInData(tankId, archiveId) {
    // Find and update the tankoubon in our local data
    for (var i = 0; i < tankoubonData.length; i++) {
        if (tankoubonData[i].id === tankId) {
            tankoubonData[i].thumbnail = archiveId;
            break;
        }
    }
}

function updateTankoubonThumbnailInDOM(tankId, archiveId) {
    // Find the thumbnail element in the DOM and update its src
    var thumbnailElement = $('.compact-thumb[data-tank-id="' + tankId + '"] img');
    if (thumbnailElement.length > 0) {
        var newThumbnailUrl = '/api/archives/' + archiveId + '/thumbnail';
        thumbnailElement.attr('src', newThumbnailUrl);
        // Also update data-src for lazy loading
        thumbnailElement.attr('data-src', newThumbnailUrl);
    }
}

function deleteTankoubon(tankId, tankName) {
    showConfirmationDialog(
        'Delete Tankoubon',
        'Are you sure you want to delete "' + tankName + '"? This action cannot be undone.',
        'Yes, delete it!',
        'Cancel'
    ).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: '/api/tankoubons/' + tankId,
                type: 'DELETE'
            })
            .done(function(data) {
                if (data.success) {
                    showSuccess('Tankoubon "' + tankName + '" deleted successfully!');
                    loadTankoubons(); // Refresh the list
                } else {
                    showError('Failed to delete tankoubon: ' + (data.error || 'Unknown error'));
                }
            })
            .fail(function(xhr) {
                showError('Failed to delete tankoubon: ' + (xhr.responseJSON ? xhr.responseJSON.error : 'Network error'));
            });
        }
    });
}

function showArchives(tankId, tankName) {
    // Load detailed tankoubon data including archives
    $.get('/api/tankoubons/' + tankId + '?include_full_data=1')
        .done(function(data) {
            if (data.result) {
                displayArchives(data.result);
            } else {
                showError('Failed to load tankoubon archives');
            }
        })
        .fail(function() {
            showError('Failed to load tankoubon archives');
        });
}

function displayArchives(tankoubon) {
    var archivesHtml = '';
    
    // Use full_data if available, otherwise fall back to archives
    var archivesList = tankoubon.full_data || tankoubon.archives || [];
    
    if (!archivesList || archivesList.length === 0) {
        archivesHtml = '<p style="text-align: center; color: #666; margin: 20px;">No archives in this tankoubon.</p>';
        archivesHtml += '<div style="text-align: center; margin: 20px;">';
        archivesHtml += '<button class="stdbtn" onclick="showAddArchives(\'' + tankoubon.id + '\', \'' + escapeHtml(tankoubon.name) + '\')" style="background-color: #4CAF50; color: white; font-size: 14px; padding: 10px 15px;">';
        archivesHtml += '<i class="fa fa-plus"></i> Add Archives</button>';
        archivesHtml += '<br><br>';
        archivesHtml += '<button class="stdbtn" onclick="Swal.close(); showEditTankoubon(\'' + tankoubon.id + '\')" style="margin-right: 10px;">';
        archivesHtml += '<i class="fa fa-edit"></i> Edit Tankoubon</button>';
        archivesHtml += '<button class="stdbtn" onclick="deleteTankoubon(\'' + tankoubon.id + '\', \'' + escapeHtml(tankoubon.name) + '\')" style="background-color: #f44336; color: white;">';
        archivesHtml += '<i class="fa fa-trash"></i> Delete</button>';
        archivesHtml += '</div>';
    } else {
        // Action buttons at top for better visibility
        archivesHtml = '<div style="margin-bottom: 15px; text-align: center; border-bottom: 1px solid #ddd; padding-bottom: 15px;">';
        archivesHtml += '<button class="stdbtn" onclick="showAddArchives(\'' + tankoubon.id + '\', \'' + escapeHtml(tankoubon.name) + '\')" style="background-color: #4CAF50; color: white; margin-right: 10px;">';
        archivesHtml += '<i class="fa fa-plus"></i> Add More Archives</button>';
        archivesHtml += '<button class="stdbtn" onclick="showManageArchives(\'' + tankoubon.id + '\', \'' + escapeHtml(tankoubon.name) + '\')" style="margin-right: 10px;">';
        archivesHtml += '<i class="fa fa-sort"></i> Reorder Archives</button>';
        archivesHtml += '<button class="stdbtn" onclick="Swal.close(); showEditTankoubon(\'' + tankoubon.id + '\')" style="margin-right: 10px;">';
        archivesHtml += '<i class="fa fa-edit"></i> Edit</button>';
        archivesHtml += '<button class="stdbtn" onclick="deleteTankoubon(\'' + tankoubon.id + '\', \'' + escapeHtml(tankoubon.name) + '\')" style="background-color: #f44336; color: white;">';
        archivesHtml += '<i class="fa fa-trash"></i> Delete</button>';
        archivesHtml += '</div>';

        // Quick navigation section (upper part)
        archivesHtml += '<div style="margin-bottom: 25px; background: #2c3e50; padding: 12px; border-radius: 8px; border: 1px solid #34495e;">';
        archivesHtml += '<h4 style="margin-top: 0; margin-bottom: 10px; color: #ecf0f1; font-size: 14px; display: flex; align-items: center;">';
        archivesHtml += '<i class="fa fa-fast-forward" style="margin-right: 6px; color: #3498db;"></i> Quick Navigation';
        archivesHtml += '</h4>';
        
        // Create dropdown for quick navigation
        archivesHtml += '<div style="position: relative; display: inline-block; width: 100%;">';
        archivesHtml += '<select id="quick-nav-dropdown" onchange="openSelectedArchive(this.value, \'' + tankoubon.id + '\')" ';
        archivesHtml += 'style="width: 100%; padding: 8px 12px; font-size: 13px; background: #1a202c; color: #e2e8f0; border: 1px solid #4a5568; border-radius: 4px; cursor: pointer;">';
        archivesHtml += '<option value="">Select an archive to read...</option>';
        
        archivesList.forEach(function(archive, index) {
            var archiveId = archive.arcid || archive;
            var title = archive.title || 'Archive ' + (index + 1);
            var displayTitle = (index + 1) + '. ' + (title.length > 60 ? title.substring(0, 60) + '...' : title);
            
            archivesHtml += '<option value="' + archiveId + '">' + escapeHtml(displayTitle) + '</option>';
        });
        
        archivesHtml += '</select>';
        archivesHtml += '</div>';
        
        archivesHtml += '</div>';
        archivesHtml += '</div>';

        // Thumbnail wall section (lower part)
        archivesHtml += '<div>';
        archivesHtml += '<h4 style="margin-top: 0; margin-bottom: 15px; color: #333; font-size: 16px; display: flex; align-items: center;">';
        archivesHtml += '<i class="fa fa-th-large" style="margin-right: 8px; color: #28a745;"></i> Thumbnail Wall';
        archivesHtml += '</h4>';
        archivesHtml += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px;">';
        
        archivesList.forEach(function(archive, index) {
            var archiveId = archive.arcid || archive;
            var title = archive.title || 'Archive ' + (index + 1);
            
            archivesHtml += '<div class="archive-thumb-item" style="text-align: center; background: transparent; border-radius: 4px; padding: 4px; transition: transform 0.2s ease, box-shadow 0.2s ease; aspect-ratio: 2/3; display: flex; flex-direction: column; height: 240px; overflow: hidden;">';
            
            // Thumbnail image with number overlay
            archivesHtml += '<div style="position: relative; margin-bottom: 6px; flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">';
            archivesHtml += '<img src="/api/archives/' + archiveId + '/thumbnail" ';
            archivesHtml += 'style="width: 100%; height: 210px; object-fit: cover; border-radius: 4px; cursor: pointer; transition: opacity 0.2s ease, box-shadow 0.2s ease; flex: none;" ';
            archivesHtml += 'onclick="window.open(\'/reader?id=' + archiveId + '&tankoubon=' + tankoubon.id + '\', \'_blank\')" ';
            archivesHtml += 'onerror="this.src=\'/img/noThumb.png\';" ';
            archivesHtml += 'onmouseover="this.style.opacity=\'0.8\'; this.style.boxShadow=\'0 4px 12px rgba(0,0,0,0.3)\';" ';
            archivesHtml += 'onmouseout="this.style.opacity=\'1\'; this.style.boxShadow=\'none\';" ';
            archivesHtml += 'title="Click to read: ' + escapeHtml(title) + '" />';
            
            // Archive number overlay
            archivesHtml += '<div style="position: absolute; top: 6px; left: 6px; background: rgba(0,0,0,0.8); color: white; padding: 3px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">';
            archivesHtml += (index + 1);
            archivesHtml += '</div>';
            archivesHtml += '</div>';
            
            // Archive title (smaller)
            archivesHtml += '<div style="font-size: 10px; color: #e0e0e0; margin-bottom: 4px; word-wrap: break-word; line-height: 1.2; height: 20px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;">';
            archivesHtml += escapeHtml(title);
            archivesHtml += '</div>';
            
            // Action buttons for this archive (only remove button for logged users)
            if ($('body').data('user-logged') === "1") {
                archivesHtml += '<div style="display: flex; gap: 6px; justify-content: center;">';
                archivesHtml += '<button class="stdbtn" onclick="removeArchiveFromTankoubon(\'' + tankoubon.id + '\', \'' + archiveId + '\')" ';
                archivesHtml += 'style="background-color: #dc3545; color: white; font-size: 10px; padding: 6px 8px; border-radius: 4px; transition: background-color 0.2s ease;" ';
                archivesHtml += 'onmouseover="this.style.backgroundColor=\'#c82333\'" ';
                archivesHtml += 'onmouseout="this.style.backgroundColor=\'#dc3545\'" ';
                archivesHtml += 'title="Remove from tankoubon">';
                archivesHtml += '<i class="fa fa-times"></i></button>';
                archivesHtml += '</div>';
            }
            archivesHtml += '</div>';
        });
        
        archivesHtml += '</div>';
        archivesHtml += '</div>';
    }
    
    // Use full_data length if available, otherwise archives length
    var archiveCount = tankoubon.full_data ? tankoubon.full_data.length : (tankoubon.archives ? tankoubon.archives.length : 0);
    
    Swal.fire({
        title: escapeHtml(tankoubon.name) + ' (' + archiveCount + ' archives)',
        html: archivesHtml,
        width: '95%',
        maxWidth: '1400px',
        showCloseButton: true,
        showConfirmButton: false,
        customClass: {
            htmlContainer: 'archives-modal-content',
            popup: 'tankoubon-view-popup'
        },
        didOpen: function() {
            // Add hover effects to thumbnail items
            $('.archive-thumb-item').hover(
                function() {
                    $(this).css({
                        'transform': 'translateY(-4px)',
                        'box-shadow': '0 4px 16px rgba(0,0,0,0.15)'
                    });
                },
                function() {
                    $(this).css({
                        'transform': 'translateY(0)',
                        'box-shadow': '0 2px 8px rgba(0,0,0,0.1)'
                    });
                }
            );
        }
    });
}

function showSuccess(message) {
    Swal.fire({
        icon: 'success',
        title: 'Success',
        text: message,
        timer: 3000,
        timerProgressBar: true
    });
}

function showError(message) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message
    });
}

function escapeHtml(text) {
    if (!text) return '';
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// New functions for enhanced archive management

function showAddArchives(tankId, tankName) {
    $('#target-tankoubon-id').val(tankId);
    $('#archive-search').val('');
    $('#search-results').hide().empty();
    
    Swal.fire({
        title: 'Add Archives to "' + tankName + '"',
        html: $('#add-archives-modal').html(),
        width: 700,
        showCancelButton: true,
        confirmButtonText: 'Done',
        cancelButtonText: 'Cancel',
        didOpen: function() {
            var modal = $('.swal2-container');
            modal.find('#target-tankoubon-id').val(tankId);
            modal.find('#archive-search').focus();
            
            // Load some initial archives to show
            searchArchives('', modal);
            
            // Setup search functionality
            var searchTimeout;
            modal.find('#archive-search').on('input', function() {
                var query = $(this).val().trim();
                
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(function() {
                    searchArchives(query, modal);
                }, 300);
            });
        }
    });
}

function searchArchives(query, modal) {
    modal.find('#search-results').html('<div style="text-align: center; padding: 20px;"><i class="fa fa-spinner fa-spin"></i> Searching...</div>').show();
    
    $.get('/api/search', { 
        filter: query,
        start: 0
    })
    .done(function(data) {
        displaySearchResults(data.data || [], modal);
    })
    .fail(function() {
        modal.find('#search-results').html('<div style="text-align: center; padding: 20px; color: #d32f2f;">Search failed</div>');
    });
}

function displaySearchResults(archives, modal) {
    var resultsContainer = modal.find('#search-results');
    
    if (archives.length === 0) {
        resultsContainer.html('<div style="text-align: center; padding: 20px; color: #666;">No archives found</div>');
        return;
    }
    
    var html = '<div style="margin-bottom: 10px; padding: 10px; background: #f0f0f0; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">';
    html += '<span><i class="fa fa-info-circle"></i> Found ' + archives.length + ' archives (showing first 10)</span>';
    html += '<button id="add-all-btn" class="stdbtn" style="font-size: 11px; padding: 5px 10px;"><i class="fa fa-plus"></i> Add All Visible</button>';
    html += '</div>';
    
    archives.slice(0, 10).forEach(function(archive) { // Limit to 10 results
        html += '<div class="search-result-item" data-archive-id="' + archive.arcid + '">';
        html += '<img src="/api/archives/' + archive.arcid + '/thumbnail" onerror="this.style.display=\'none\'" />';
        html += '<div style="flex: 1; min-width: 0;">';
        html += '<div style="font-weight: bold; margin-bottom: 3px; word-wrap: break-word;">' + escapeHtml(archive.title) + '</div>';
        if (archive.tags) {
            var tags = archive.tags.replace(/,/g, ', ');
            if (tags.length > 80) tags = tags.substring(0, 80) + '...';
            html += '<div style="font-size: 11px; color: #666;">' + escapeHtml(tags) + '</div>';
        }
        html += '</div>';
        html += '<button class="stdbtn add-single-btn" style="font-size: 11px; padding: 5px 8px;"><i class="fa fa-plus"></i> Add</button>';
        html += '</div>';
    });
    
    resultsContainer.html(html);
    
    // Attach click handlers
    resultsContainer.find('.search-result-item').on('click', function(e) {
        if (!$(e.target).hasClass('add-single-btn') && !$(e.target).parent().hasClass('add-single-btn')) {
            var archiveId = $(this).data('archive-id');
            var tankId = modal.find('#target-tankoubon-id').val();
            addArchiveToTankoubon(tankId, archiveId, $(this));
        }
    });
    
    // Single add button handlers
    resultsContainer.find('.add-single-btn').on('click', function(e) {
        e.stopPropagation();
        var archiveId = $(this).closest('.search-result-item').data('archive-id');
        var tankId = modal.find('#target-tankoubon-id').val();
        addArchiveToTankoubon(tankId, archiveId, $(this).closest('.search-result-item'));
    });
    
    // Add all button handler
    resultsContainer.find('#add-all-btn').on('click', function() {
        var tankId = modal.find('#target-tankoubon-id').val();
        var visibleArchives = [];
        resultsContainer.find('.search-result-item').each(function() {
            visibleArchives.push($(this).data('archive-id'));
        });
        
        if (visibleArchives.length > 0) {
            addMultipleArchivesToTankoubon(tankId, visibleArchives, resultsContainer);
        }
    });
}

function addMultipleArchivesToTankoubon(tankId, archiveIds, container) {
    container.find('#add-all-btn').html('<i class="fa fa-spinner fa-spin"></i> Adding ' + archiveIds.length + ' archives...').prop('disabled', true);
    
    var promises = archiveIds.map(function(archiveId) {
        return $.ajax({
            url: '/api/tankoubons/' + tankId + '/' + archiveId,
            type: 'PUT',
            contentType: 'application/json'
        });
    });
    
    Promise.all(promises)
        .then(function(responses) {
            var successful = responses.filter(function(response) {
                return response.success;
            }).length;
            
            showSuccess('Successfully added ' + successful + ' archives to tankoubon!');
            loadTankoubons();
            
            // Remove successfully added items
            container.find('.search-result-item').fadeOut(300);
        })
        .catch(function(error) {
            showError('Some archives could not be added. Please try again.');
            container.find('#add-all-btn').html('<i class="fa fa-plus"></i> Add All Visible').prop('disabled', false);
        });
}

function addArchiveToTankoubon(tankId, archiveId, resultItem) {
    resultItem.find('button').html('<i class="fa fa-spinner fa-spin"></i> Adding...').prop('disabled', true);
    
    // Use PUT to add archive to tankoubon
    $.ajax({
        url: '/api/tankoubons/' + tankId + '/' + archiveId,
        type: 'PUT',
        contentType: 'application/json'
    })
    .done(function(data) {
        if (data.success) {
            resultItem.fadeOut(300, function() {
                $(this).remove();
            });
            showSuccess('Archive added to tankoubon!');
            // Refresh tankoubon list after a short delay
            setTimeout(loadTankoubons, 1000);
        } else {
            showError('Failed to add archive: ' + (data.error || 'Unknown error'));
            resultItem.find('button').html('<i class="fa fa-plus"></i> Add').prop('disabled', false);
        }
    })
    .fail(function(xhr) {
        showError('Failed to add archive: ' + (xhr.responseJSON ? xhr.responseJSON.error : 'Network error'));
        resultItem.find('button').html('<i class="fa fa-plus"></i> Add').prop('disabled', false);
    });
}

function showManageArchives(tankId, tankName) {
    // Load tankoubon data first
    $.get('/api/tankoubons/' + tankId + '?include_full_data=1')
        .done(function(data) {
            if (data.result) {
                displayManageArchives(data.result);
            } else {
                showError('Failed to load tankoubon archives');
            }
        })
        .fail(function() {
            showError('Failed to load tankoubon archives');
        });
}

function displayManageArchives(tankoubon) {
    // Use full_data if available, otherwise fall back to archives
    var archivesList = tankoubon.full_data || tankoubon.archives || [];
    
    if (!archivesList || archivesList.length === 0) {
        showError('No archives to manage');
        return;
    }
    
    var html = '<div id="sortable-list" style="list-style: none; padding: 0; margin: 0;">';
    
    archivesList.forEach(function(archive, index) {
        html += '<div class="archive-item draggable-item" ';
        html += 'data-archive-id="' + (archive.arcid || archive) + '" ';
        html += 'draggable="true" ';
        html += 'style="display: flex; align-items: center; padding: 12px; margin-bottom: 8px; ';
        html += 'border: 1px solid #ddd; border-radius: 6px; background: #f9f9f9; cursor: grab; transition: all 0.2s ease;">';
        
        html += '<div class="drag-handle" style="margin-right: 10px; color: #666; cursor: grab;"><i class="fa fa-grip-vertical"></i></div>';
        html += '<div class="archive-order" style="margin-right: 15px; font-weight: bold; color: #666; min-width: 30px;">' + (index + 1) + '</div>';
        
        if (archive.arcid) {
            html += '<img src="/api/archives/' + archive.arcid + '/thumbnail" ';
            html += 'style="width: 40px; height: 56px; object-fit: cover; border-radius: 3px; margin-right: 15px;" ';
            html += 'onerror="this.style.display=\'none\'" />';
        }
        
        html += '<div style="flex: 1; min-width: 0;">';
        html += '<div style="font-weight: bold; font-size: 13px; margin-bottom: 3px; word-wrap: break-word;">';
        html += escapeHtml(archive.title || 'Unknown Title') + '</div>';
        html += '</div>';
        
        html += '<button class="stdbtn remove-archive-btn" data-archive-id="' + (archive.arcid || archive) + '" ';
        html += 'style="background-color: #d32f2f; color: white; font-size: 11px; padding: 4px 6px; margin-left: 10px;" title="Remove">';
        html += '<i class="fa fa-times"></i></button>';
        
        html += '</div>';
    });
    
    html += '</div>';
    html += '<div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border-radius: 4px; font-size: 12px; color: #1976d2;">';
    html += '<i class="fa fa-info-circle" style="margin-right: 5px;"></i>';
    html += 'Drag and drop archives to reorder them. Click the grip icon or drag anywhere on an archive item.';
    html += '</div>';
    
    Swal.fire({
        title: 'Manage "' + escapeHtml(tankoubon.name) + '" Archives',
        html: html,
        width: 800,
        showCancelButton: true,
        confirmButtonText: 'Save Order',
        cancelButtonText: 'Cancel',
        customClass: {
            htmlContainer: 'manage-archives-content'
        },
        didOpen: function() {
            initializeDragAndDrop();
            
            // Attach remove handlers
            $('.remove-archive-btn').on('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                var archiveId = $(this).data('archive-id');
                var archiveItem = $(this).closest('.archive-item');
                
                Swal.fire({
                    title: 'Remove Archive?',
                    text: 'Remove this archive from the tankoubon?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Remove',
                    cancelButtonText: 'Cancel'
                }).then((result) => {
                    if (result.isConfirmed) {
                        removeArchiveFromTankoubon(tankoubon.id, archiveId);
                        archiveItem.fadeOut(300, function() {
                            $(this).remove();
                            updateOrderNumbers();
                        });
                    }
                });
            });
        },
        preConfirm: function() {
            return saveArchiveOrder(tankoubon.id);
        }
    });
}

function initializeDragAndDrop() {
    let draggedElement = null;
    let draggedIndex = null;
    
    const sortableList = document.getElementById('sortable-list');
    const archiveItems = sortableList.querySelectorAll('.draggable-item');
    
    archiveItems.forEach((item, index) => {
        // Add drag event listeners
        item.addEventListener('dragstart', function(e) {
            draggedElement = this;
            draggedIndex = index;
            this.style.opacity = '0.5';
            this.style.transform = 'rotate(2deg)';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.outerHTML);
        });
        
        item.addEventListener('dragend', function(e) {
            this.style.opacity = '';
            this.style.transform = '';
            this.classList.remove('drag-over');
        });
        
        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            // Remove existing drag-over classes
            archiveItems.forEach(el => el.classList.remove('drag-over'));
            
            if (this !== draggedElement) {
                this.classList.add('drag-over');
                this.style.borderTop = '3px solid #2196F3';
            }
        });
        
        item.addEventListener('dragleave', function(e) {
            this.classList.remove('drag-over');
            this.style.borderTop = '';
        });
        
        item.addEventListener('drop', function(e) {
            e.preventDefault();
            
            if (this !== draggedElement) {
                const currentIndex = Array.from(sortableList.children).indexOf(this);
                
                // Determine drop position
                if (draggedIndex < currentIndex) {
                    // Insert after the target
                    this.parentNode.insertBefore(draggedElement, this.nextSibling);
                } else {
                    // Insert before the target
                    this.parentNode.insertBefore(draggedElement, this);
                }
                
                updateOrderNumbers();
            }
            
            // Clean up drag styles
            archiveItems.forEach(el => {
                el.classList.remove('drag-over');
                el.style.borderTop = '';
            });
        });
        
        // Add hover effects
        item.addEventListener('mouseenter', function() {
            if (!this.classList.contains('drag-over')) {
                this.style.backgroundColor = '#f0f0f0';
                this.style.transform = 'translateX(2px)';
            }
        });
        
        item.addEventListener('mouseleave', function() {
            if (!this.classList.contains('drag-over')) {
                this.style.backgroundColor = '#f9f9f9';
                this.style.transform = '';
            }
        });
        
        // Change cursor when dragging
        const dragHandle = item.querySelector('.drag-handle');
        dragHandle.addEventListener('mousedown', function() {
            item.style.cursor = 'grabbing';
            dragHandle.style.cursor = 'grabbing';
        });
        
        dragHandle.addEventListener('mouseup', function() {
            item.style.cursor = 'grab';
            dragHandle.style.cursor = 'grab';
        });
    });
}

function openSelectedArchive(archiveId, tankouboId) {
    if (archiveId) {
        window.open('/reader?id=' + archiveId + '&tankoubon=' + tankouboId, '_blank');
        // Reset dropdown to placeholder
        document.getElementById('quick-nav-dropdown').value = '';
    }
}

function updateOrderNumbers() {
    $('#sortable-list .archive-item').each(function(index) {
        $(this).find('.archive-order').text(index + 1);
    });
}

function saveArchiveOrder(tankId) {
    var archiveIds = [];
    $('#sortable-list .archive-item').each(function() {
        archiveIds.push($(this).data('archive-id'));
    });
    
    return $.ajax({
        url: '/api/tankoubons/' + tankId,
        type: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ 
            archives: archiveIds 
        })
    })
    .done(function(data) {
        if (data.success) {
            showSuccess('Archive order saved!');
            loadTankoubons();
        } else {
            showError('Failed to save order: ' + (data.error || 'Unknown error'));
        }
    })
    .fail(function() {
        showError('Failed to save archive order');
    });
}

function removeArchiveFromTankoubon(tankId, archiveId) {
    $.ajax({
        url: '/api/tankoubons/' + tankId + '/' + archiveId,
        type: 'DELETE'
    })
    .done(function(data) {
        if (data.success) {
            showSuccess('Archive removed from tankoubon!');
            // Refresh the current view
            setTimeout(function() {
                loadTankoubons();
                // Close any open modals and reopen the manage modal if needed
            }, 1000);
        } else {
            showError('Failed to remove archive: ' + (data.error || 'Unknown error'));
        }
    })
    .fail(function(xhr) {
        showError('Failed to remove archive: ' + (xhr.responseJSON ? xhr.responseJSON.error : 'Network error'));
    });
}

// Additional helper functions

function refreshTankoubonInView(tankId) {
    // Helper function to refresh a specific tankoubon in the current view
    loadTankoubons();
}

function showArchivePreview(archiveId) {
    // Load archive details for preview
    $.get('/api/archives/' + archiveId)
        .done(function(data) {
            if (data) {
                var previewHtml = '<div style="display: flex; gap: 15px; margin-bottom: 15px;">';
                previewHtml += '<img src="/api/archives/' + archiveId + '/thumbnail" style="width: 120px; height: 168px; object-fit: cover; border-radius: 6px;" onerror="this.style.display=\'none\'" />';
                previewHtml += '<div style="flex: 1;">';
                previewHtml += '<h4 style="margin: 0 0 10px 0;">' + escapeHtml(data.title || 'Unknown Title') + '</h4>';
                if (data.tags) {
                    previewHtml += '<p><strong>Tags:</strong> ' + escapeHtml(data.tags.replace(/,/g, ', ')) + '</p>';
                }
                if (data.summary) {
                    previewHtml += '<p><strong>Summary:</strong> ' + escapeHtml(data.summary) + '</p>';
                }
                previewHtml += '<p><strong>Archive ID:</strong> ' + escapeHtml(archiveId) + '</p>';
                previewHtml += '</div></div>';
                
                Swal.fire({
                    title: 'Archive Preview',
                    html: previewHtml,
                    width: 600,
                    showCloseButton: true,
                    showConfirmButton: false
                });
            }
        })
        .fail(function() {
            showError('Failed to load archive details');
        });
}

function validateTankoubonData(name, summary, tags) {
    // Validation helper
    var errors = [];
    
    if (!name || name.trim() === '') {
        errors.push('Tankoubon name is required');
    }
    
    if (name && name.length > 100) {
        errors.push('Tankoubon name is too long (max 100 characters)');
    }
    
    if (summary && summary.length > 500) {
        errors.push('Summary is too long (max 500 characters)');
    }
    
    if (tags && tags.length > 200) {
        errors.push('Tags are too long (max 200 characters)');
    }
    
    return errors;
}

function showConfirmationDialog(title, message, confirmText, cancelText) {
    // Helper for confirmation dialogs
    return Swal.fire({
        title: title,
        text: message,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: confirmText || 'Yes',
        cancelButtonText: cancelText || 'Cancel'
    });
}

function renderPagination() {
    // Add pagination controls similar to the reader's navigation
    var totalPages = Math.ceil(totalTankoubons / tankoubonsPerPage);
    
    if (totalPages <= 1) {
        $('#pagination-container').empty();
        return;
    }
    
    var paginationHtml = '<div id="pagination-controls" class="sn paginator" style="text-align: center; margin: 20px 0; padding: 15px;">';
    
    // Previous buttons
    var prevDisabled = currentPage <= 1;
    paginationHtml += '<a class="fa fa-angle-double-left page-link" style="font-size: 1.5em; margin: 0 5px; ' + (prevDisabled ? 'color: #ccc; cursor: not-allowed;' : 'cursor: pointer;') + '" value="outer-left" title="First Page"></a>';
    paginationHtml += '<a class="fa fa-angle-left page-link" style="font-size: 1.5em; margin: 0 5px; ' + (prevDisabled ? 'color: #ccc; cursor: not-allowed;' : 'cursor: pointer;') + '" value="left" title="Previous Page"></a>';
    
    // Page counter
    paginationHtml += '<div class="pagecount" style="display: inline-block; margin: 0 15px; font-weight: bold; font-size: 14px;">';
    paginationHtml += '<span class="current-page">' + currentPage + '</span> / ';
    paginationHtml += '<span class="max-page">' + totalPages + '</span>';
    paginationHtml += '</div>';
    
    // Next buttons
    var nextDisabled = currentPage >= totalPages;
    paginationHtml += '<a class="fa fa-angle-right page-link" style="font-size: 1.5em; margin: 0 5px; ' + (nextDisabled ? 'color: #ccc; cursor: not-allowed;' : 'cursor: pointer;') + '" value="right" title="Next Page"></a>';
    paginationHtml += '<a class="fa fa-angle-double-right page-link" style="font-size: 1.5em; margin: 0 5px; ' + (nextDisabled ? 'color: #ccc; cursor: not-allowed;' : 'cursor: pointer;') + '" value="outer-right" title="Last Page"></a>';
    
    paginationHtml += '</div>';
    
    // Add pagination to the container or create one if it doesn't exist
    var paginationContainer = $('#pagination-container');
    if (paginationContainer.length === 0) {
        $('#tankoubon-list').after('<div id="pagination-container"></div>');
        $('#thumbs_container').after('<div id="pagination-container-thumbs"></div>');
        paginationContainer = $('#pagination-container');
    }
    
    // Show pagination in the appropriate container
    if (localStorage.tankoubon_viewMode === "1") {
        $('#pagination-container').hide();
        $('#pagination-container-thumbs').html(paginationHtml).show();
    } else {
        $('#pagination-container-thumbs').hide();
        $('#pagination-container').html(paginationHtml).show();
    }
}
