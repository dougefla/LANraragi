/**
 * Tankoubon Manager Frontend
 * Simple interface for managing tankoubon collections
 */

var tankoubonData = [];
var currentPage = 1;
var totalTankoubons = 0;
var tankoubonsPerPage = 100; // Default page size

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
    
    console.log("Initial view mode:", localStorage.tankoubon_viewMode);
    
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
        var totalPages = Math.ceil(totalTankoubons / tankoubonsPerPage);
        
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
    
    // Fetch tankoubon list from API with pagination
    var apiUrl = '/api/tankoubons';
    if (page > 1) {
        apiUrl += '?page=' + page;
    }
    
    $.get(apiUrl)
        .done(function(data) {
            console.log("Tankoubon API response:", data);
            if (data.result) {
                tankoubonData = data.result;
                totalTankoubons = data.total || tankoubonData.length;
                console.log("Loaded", tankoubonData.length, "tankoubons (page", page, "of", Math.ceil(totalTankoubons / tankoubonsPerPage), ")");
                renderTankoubonList();
                renderPagination();
            } else {
                showError('Failed to load tankoubons');
            }
        })
        .fail(function() {
            showError('Failed to connect to server');
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
    
    tankoubonData.forEach(function(tank) {
        var archiveCount = tank.archives ? tank.archives.length : 0;
        
        // Determine thumbnail source
        var thumbnailUrl;
        if (tank.archives && tank.archives.length > 0) {
            thumbnailUrl = '/api/archives/' + tank.archives[0] + '/thumbnail';
        } else {
            thumbnailUrl = '/img/noThumb.png';
        }
        
        // Create compact thumbnail HTML without any title or text
        var thumbnailHtml = '<div class="compact-thumb" data-tank-id="' + LRR.encodeHTML(tank.id) + '" data-tank-name="' + LRR.encodeHTML(tank.name) + '" style="position: relative; cursor: pointer; overflow: hidden;">';
        thumbnailHtml += '<img src="' + thumbnailUrl + '" onerror="this.src=\'/img/noThumb.png\';" />';
        
        // Small overlay with archive count only
        if (archiveCount > 0) {
            thumbnailHtml += '<div style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.7); color: white; padding: 1px 4px; font-size: 10px; border-radius: 2px; font-weight: bold;">' + archiveCount + '</div>';
        }
        
        thumbnailHtml += '</div>';
        
        container.append(thumbnailHtml);
    });
    
    // Attach click handlers
    $('#thumbs_container .compact-thumb').on('click', function() {
        var tankId = $(this).data('tank-id');
        var tankName = $(this).data('tank-name');
        showArchives(tankId, tankName);
    });
    
    // Add right-click context menu
    attachThumbnailEventHandlers();
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
    $.get('/api/tankoubons/' + tankId)
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
                    width: 600,
                    didOpen: function() {
                        $('.swal2-container #edit-tankoubon-name').val(tank.name || '');
                        $('.swal2-container #edit-tankoubon-summary').val(tank.summary || '');
                        $('.swal2-container #edit-tankoubon-tags').val(tank.tags || '');
                        $('.swal2-container #edit-tankoubon-id').val(tankId);
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
        archivesHtml += '<button class="stdbtn" onclick="deleteTankoubon(\'' + tankoubon.id + '\')" style="background-color: #f44336; color: white;">';
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
        archivesHtml += '<button class="stdbtn" onclick="deleteTankoubon(\'' + tankoubon.id + '\')" style="background-color: #f44336; color: white;">';
        archivesHtml += '<i class="fa fa-trash"></i> Delete</button>';
        archivesHtml += '</div>';
        
        archivesHtml += '<div style="display: grid; gap: 10px;">';
        
        archivesList.forEach(function(archive, index) {
            archivesHtml += '<div class="archive-item" style="display: flex; align-items: center; padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9;">';
            
            // Order number
            archivesHtml += '<div style="margin-right: 15px; font-weight: bold; color: #666; min-width: 35px; text-align: center; background: #e0e0e0; padding: 5px 8px; border-radius: 50%;">';
            archivesHtml += (index + 1) + '</div>';
            
            // Archive thumbnail (if available)
            if (archive.arcid) {
                archivesHtml += '<div style="margin-right: 15px;">';
                archivesHtml += '<img src="/api/archives/' + archive.arcid + '/thumbnail" ';
                archivesHtml += 'style="width: 60px; height: 84px; object-fit: cover; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" ';
                archivesHtml += 'onerror="this.style.display=\'none\'" />';
                archivesHtml += '</div>';
            }
            
            // Archive info
            archivesHtml += '<div style="flex: 1; min-width: 0;">';
            archivesHtml += '<div style="font-weight: bold; margin-bottom: 6px; font-size: 14px; word-wrap: break-word;">';
            archivesHtml += escapeHtml(archive.title || 'Unknown Title') + '</div>';
            
            if (archive.tags) {
                var tags = archive.tags.replace(/,/g, ', ');
                if (tags.length > 100) {
                    tags = tags.substring(0, 100) + '...';
                }
                archivesHtml += '<div style="font-size: 12px; color: #666; line-height: 1.3;">' + escapeHtml(tags) + '</div>';
            }
            archivesHtml += '</div>';
            
            // Action buttons
            archivesHtml += '<div style="display: flex; gap: 5px; flex-shrink: 0;">';
            
            if (archive.arcid) {
                archivesHtml += '<a href="/reader?id=' + archive.arcid + '&tankoubon=' + tankoubon.id + '" class="stdbtn" target="_blank" ';
                archivesHtml += 'style="font-size: 11px; padding: 6px 10px; text-decoration: none;">';
                archivesHtml += '<i class="fa fa-book-open"></i> Read</a>';
            }
            
            // Remove button for logged users
            if ($('body').data('user-logged') === "1") {
                archivesHtml += '<button class="stdbtn" onclick="removeArchiveFromTankoubon(\'' + tankoubon.id + '\', \'' + (archive.arcid || archive) + '\')" ';
                archivesHtml += 'style="background-color: #d32f2f; font-size: 11px; padding: 6px 8px;" title="Remove from tankoubon">';
                archivesHtml += '<i class="fa fa-times"></i></button>';
            }
            
            archivesHtml += '</div>';
            archivesHtml += '</div>';
        });
        
        archivesHtml += '</div>';
    }
    
    // Use full_data length if available, otherwise archives length
    var archiveCount = tankoubon.full_data ? tankoubon.full_data.length : (tankoubon.archives ? tankoubon.archives.length : 0);
    
    Swal.fire({
        title: escapeHtml(tankoubon.name) + ' (' + archiveCount + ' archives)',
        html: archivesHtml,
        width: 900,
        showCloseButton: true,
        showConfirmButton: false,
        customClass: {
            htmlContainer: 'archives-modal-content'
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
        html += '<div class="archive-item" data-archive-id="' + (archive.arcid || archive) + '" ';
        html += 'style="display: flex; align-items: center; padding: 12px; margin-bottom: 8px; ';
        html += 'border: 1px solid #ddd; border-radius: 6px; background: #f9f9f9; cursor: move;">';
        
        html += '<div style="margin-right: 10px; color: #666;"><i class="fa fa-grip-vertical"></i></div>';
        html += '<div style="margin-right: 15px; font-weight: bold; color: #666; min-width: 30px;">' + (index + 1) + '</div>';
        
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
        html += 'style="background-color: #d32f2f; font-size: 11px; padding: 4px 6px; margin-left: 10px;" title="Remove">';
        html += '<i class="fa fa-times"></i></button>';
        
        html += '</div>';
    });
    
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
            // Initialize sortable
            $('#sortable-list').sortable({
                handle: '.fa-grip-vertical',
                axis: 'y',
                helper: function(e, ui) {
                    ui.addClass('ui-sortable-helper');
                    return ui;
                },
                start: function(e, ui) {
                    ui.placeholder.height(ui.helper.height());
                }
            });
            
            // Attach remove handlers
            $('.remove-archive-btn').on('click', function(e) {
                e.stopPropagation();
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

function updateOrderNumbers() {
    $('#sortable-list .archive-item').each(function(index) {
        $(this).find('[style*="min-width: 30px"]').first().text(index + 1);
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
