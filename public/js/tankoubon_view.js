/**
 * Tankoubon View Operations
 */
window.TankoubonView = {
    /**
     * Initialize the page
     */
    initializeAll: function () {
        // Load view mode from localStorage or default to grid
        const viewMode = localStorage.getItem('tankoubon-view-mode') || 'grid';
        this.switchViewMode(viewMode);

        // Bind view mode buttons
        $('.view-mode-btn').click(function() {
            const mode = $(this).data('mode');
            TankoubonView.switchViewMode(mode);
        });

        // Load archives and populate episode selector
        this.loadArchives();
    },

    /**
     * Switch between different view modes (grid, list, continuous)
     */
    switchViewMode: function (mode) {
        // Update buttons
        $('.view-mode-btn').removeClass('active');
        $(`.view-mode-btn[data-mode='${mode}']`).addClass('active');

        // Save preference
        localStorage.setItem('tankoubon-view-mode', mode);

        // Reload archives in new view mode
        this.loadArchives(mode);
    },

    /**
     * Load archives for the current tankoubon
     */
    loadArchives: function (mode = localStorage.getItem('tankoubon-view-mode') || 'grid') {
        const tankId = window.location.pathname.split('/').pop();
        
        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "GET",
            success: function(tank) {
                if (!tank.archives || tank.archives.length === 0) {
                    $('#archives-container').html(
                        "<div class='empty-message'>" +
                        "<i class='fas fa-book-open fa-3x'></i><br><br>" +
                        "No archives in this tankoubon.<br>" +
                        "Add archives using the context menu in the main library view!" +
                        "</div>"
                    );
                    return;
                }

                // Load archive details
                const archivePromises = tank.archives.map(archiveId =>
                    $.ajax({
                        url: "../api/archives/" + archiveId,
                        type: "GET"
                    })
                );

                Promise.all(archivePromises).then(archives => {
                    let html = '';
                    
                    switch(mode) {
                        case 'grid':
                            html = "<div class='archive-grid'>";
                            archives.forEach((archive, index) => {
                                html += `
                                    <div class='archive-card' onclick='window.location.href="../reader?id=${archive.arcid}&tank=${tankId}"'>
                                        <img src="../api/archives/${archive.arcid}/thumbnail" alt="Thumbnail" />
                                        <div class='title'>${archive.title}</div>
                                        ${TankoubonView.getProgressBadge(archive)}
                                    </div>
                                `;
                            });
                            html += "</div>";
                            break;

                        case 'list':
                            html = "<div class='archive-list'>";
                            archives.forEach((archive, index) => {
                                html += `
                                    <div class='archive-list-item' onclick='window.location.href="../reader?id=${archive.arcid}&tank=${tankId}"'>
                                        <img src="../api/archives/${archive.arcid}/thumbnail" alt="Thumbnail" />
                                        <div class='info'>
                                            <div class='title'>${archive.title}</div>
                                            <div class='stats'>
                                                ${archive.pagecount} pages
                                                ${TankoubonView.getProgressBadge(archive)}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            });
                            html += "</div>";
                            break;

                        case 'continuous':
                            html = "<div class='continuous-view'>";
                            archives.forEach((archive, index) => {
                                html += `
                                    <div class='archive-card'>
                                        <div class='title'>${archive.title}</div>
                                        <a href="../reader?id=${archive.arcid}&tank=${tankId}">
                                            <img src="../api/archives/${archive.arcid}/thumbnail" alt="Thumbnail" />
                                        </a>
                                    </div>
                                `;
                            });
                            html += "</div>";
                            break;
                    }

                    $('#archives-container').html(html);

                    // Populate the episode selector after archives are loaded
                    const select = $('#episode-selector');
                    select.empty();
                    select.append('<option value="">Select Episode...</option>');

                    archives.forEach((archive, index) => {
                        select.append(`<option value="${archive.arcid}">${index + 1}. ${archive.title}</option>`);
                    });
                });
            },
            error: function(xhr, status, error) {
                LRR.showErrorToast("Error loading tankoubon: " + error);
            }
        });
    },

    /**
     * Get a progress indicator badge for an archive
     */
    getProgressBadge: function(archive) {
        if (!archive.progress) {
            return "<span class='progress-indicator progress-new'>New</span>";
        }
        
        const progress = parseInt(archive.progress);
        if (progress === 100) {
            return "<span class='progress-indicator progress-completed'>Completed</span>";
        } else if (progress > 0) {
            return `<span class='progress-indicator progress-reading'>${progress}%</span>`;
        }
        
        return "<span class='progress-indicator progress-new'>New</span>";
    },

    /**
     * Show dialog for editing the tankoubon
     */
    editTankoubon: function() {
        const tankId = window.location.pathname.split('/').pop();
        
        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "GET",
            success: function(tank) {
                LRR.showPopUp({
                    title: "Edit Tankoubon",
                    html: `
                        <div>
                            <label>Name:</label><br>
                            <input type="text" id="tank-name" class="favtag-btn" value="${tank.name}" style="width: 100%; margin-bottom: 15px;">
                            
                            <label>Tags:</label><br>
                            <input type="text" id="tank-tags" class="favtag-btn" value="${tank.tags || ''}" style="width: 100%; margin-bottom: 15px;">
                            
                            <label>Summary:</label><br>
                            <textarea id="tank-summary" class="favtag-btn" style="width: 100%; height: 100px; margin-bottom: 15px;">${tank.summary || ''}</textarea>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: "Save",
                    preConfirm: () => {
                        return {
                            metadata: {
                                name: $('#tank-name').val(),
                                tags: $('#tank-tags').val(),
                                summary: $('#tank-summary').val()
                            }
                        };
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        $.ajax({
                            url: "../api/tankoubons/" + tankId,
                            type: "PUT",
                            contentType: "application/json",
                            data: JSON.stringify(result.value),
                            success: function(data) {
                                if (data.success) {
                                    LRR.toast({
                                        heading: "Success!",
                                        text: "Tankoubon updated!",
                                        icon: "success"
                                    });
                                    // Reload page to show updates
                                    window.location.reload();
                                } else {
                                    LRR.showErrorToast("Error updating tankoubon: " + data.error);
                                }
                            },
                            error: function(xhr, status, error) {
                                LRR.showErrorToast("Error updating tankoubon: " + error);
                            }
                        });
                    }
                });
            },
            error: function(xhr, status, error) {
                LRR.showErrorToast("Error loading tankoubon: " + error);
            }
        });
    },

    /**
     * Show dialog for managing archives
     */
    manageArchives: function() {
        const tankId = window.location.pathname.split('/').pop();
        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "GET",
            success: function (tank) {
                let html = "<div class='archive-list'>";
                
                // Add tankoubon management buttons at the top
                html += "<div class='tankoubon-actions'>" +
                    "<button class='stdbtn' onclick='TankoubonView.editTankoubon(\"" + tankId + "\")'>" +
                    "<i class='fas fa-edit'></i> Edit Name</button>" +
                    "<button class='stdbtn delete-btn' onclick='TankoubonView.deleteTankoubon(\"" + tankId + "\")'>" +
                    "<i class='fas fa-trash'></i> Delete Tankoubon</button>" +
                    "</div>";
                
                if (!tank.archives || tank.archives.length === 0) {
                    html += "<p class='empty-message'><i class='fas fa-book-open'></i><br>No archives in this tankoubon.<br>Add archives using the context menu in the main library view!</p>";
                    html += "</div>";
                    
                    LRR.showPopUp({
                        title: "Archives in " + tank.name + " (0 archives)",
                        html: html,
                        showCancelButton: true,
                        confirmButtonText: "Close",
                        width: "80%",
                        customClass: {
                            popup: "archive-dialog"
                        }
                    });
                } else {
                    html += "<table><thead><tr>" +
                        "<th style='width: 60px'>Cover</th>" +
                        "<th style='width: 60px'>Order</th>" +
                        "<th>Title</th>" +
                        "<th style='width: 200px'>Actions</th>" +
                        "</tr></thead><tbody>";

                    const archivePromises = tank.archives.map(function (archiveId) {
                        return new Promise((resolve, reject) => {
                            $.ajax({
                                url: "../api/archives/" + archiveId,
                                type: "GET",
                                success: resolve,
                                error: reject
                            });
                        });
                    });

                    Promise.all(archivePromises).then(archives => {
                        // Sort archives by their order in tank.archives (which maintains Redis score order)
                        const archiveMap = new Map();
                        tank.archives.forEach((id, index) => {
                            archiveMap.set(id, index + 1);
                        });

                        archives.sort((a, b) => archiveMap.get(a.arcid) - archiveMap.get(b.arcid));

                        archives.forEach(function (archive) {
                            const currentOrder = archiveMap.get(archive.arcid);
                            html += "<tr id='archive-" + archive.arcid + "'>" +
                                "<td><img src='../api/archives/" + archive.arcid + "/thumbnail' class='thumbnail' style='max-width: 50px; height: auto;' /></td>" +
                                "<td>" +
                                "<input type='number' class='order-input' value='" + currentOrder + "' " +
                                "min='1' max='" + archives.length + "' " +
                                "data-archive-id='" + archive.arcid + "' " +
                                "data-original-order='" + currentOrder + "' " +
                                "style='width: 60px;'>" +
                                "</td>" +
                                "<td><a href='../reader?id=" + archive.arcid + "' target='_blank'>" + archive.title + "</a></td>" +
                                "<td class='table-actions'>" +
                                "<div class='button-group'>" +
                                "<button class='stdbtn' onclick='TankoubonView.moveArchive(\"" + tankId + "\", \"" + archive.arcid + "\", \"up\")'>" +
                                "<i class='fas fa-arrow-up'></i></button>" +
                                "<button class='stdbtn' onclick='TankoubonView.moveArchive(\"" + tankId + "\", \"" + archive.arcid + "\", \"down\")'>" +
                                "<i class='fas fa-arrow-down'></i></button>" +
                                "<button class='stdbtn' onclick='TankoubonView.setAsCover(\"" + tankId + "\", \"" + archive.arcid + "\")'>" +
                                "<i class='fas fa-image'></i></button>" +
                                "<button class='stdbtn' onclick='TankoubonView.removeArchive(\"" + tankId + "\", \"" + archive.arcid + "\")'>" +
                                "<i class='fas fa-times'></i></button>" +
                                "</div>" +
                                "</td></tr>";
                        });

                        html += "</tbody></table>";
                        html += "<div class='order-actions'>" +
                            "<button class='stdbtn' onclick='TankoubonView.saveOrder(\"" + tankId + "\")'>" +
                            "<i class='fas fa-save'></i> Save Order</button>" +
                            "</div>";
                        html += "</div>";

                        LRR.showPopUp({
                            title: "Archives in " + tank.name + " (" + tank.archives.length + " archives)",
                            html: html,
                            showCancelButton: true,
                            confirmButtonText: "Close",
                            width: "80%",
                            customClass: {
                                popup: "archive-dialog"
                            },
                            didOpen: () => {
                                // Add event listeners for order inputs
                                $('.order-input').on('change', function() {
                                    const newOrder = parseInt($(this).val());
                                    const maxOrder = parseInt($(this).attr('max'));
                                    if (newOrder < 1) $(this).val(1);
                                    if (newOrder > maxOrder) $(this).val(maxOrder);
                                });
                            }
                        });
                    }).catch(error => {
                        LRR.showErrorToast("Error loading archive details: " + error);
                    });
                }
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error loading tankoubon: " + error);
            }
        });
    },

    /**
     * Move an archive up or down in order
     */
    moveArchive: function (tankId, archiveId, direction) {
        const row = $('#archive-' + archiveId);
        const orderInput = row.find('.order-input');
        const currentOrder = parseInt(orderInput.val());
        const maxOrder = parseInt(orderInput.attr('max'));
        
        if (direction === "up" && currentOrder > 1) {
            // Swap with previous archive
            const prevRow = row.prev();
            const prevInput = prevRow.find('.order-input');
            orderInput.val(currentOrder - 1);
            prevInput.val(currentOrder);
            row.insertBefore(prevRow);
        } else if (direction === "down" && currentOrder < maxOrder) {
            // Swap with next archive
            const nextRow = row.next();
            const nextInput = nextRow.find('.order-input');
            orderInput.val(currentOrder + 1);
            nextInput.val(currentOrder);
            row.insertAfter(nextRow);
        }
    },

    /**
     * Save the current order of archives
     */
    saveOrder: function (tankId) {
        const newOrder = [];
        $('.order-input').each(function() {
            newOrder[parseInt($(this).val()) - 1] = $(this).data('archive-id');
        });

        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "PUT",
            contentType: "application/json",
            data: JSON.stringify({
                archives: newOrder
            }),
            success: function (data) {
                if (data.success) {
                    LRR.toast({
                        heading: "Success!",
                        text: "Archive order updated!",
                        icon: "success"
                    });
                } else {
                    LRR.showErrorToast("Error updating archive order: " + data.error);
                }
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error updating archive order: " + error);
            }
        });
    },

    /**
     * Set an archive as the cover for a tankoubon
     */
    setAsCover: function (tankId, archiveId) {
        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "PUT",
            contentType: "application/json",
            data: JSON.stringify({
                cover_archive: archiveId
            }),
            success: function (data) {
                if (data.success) {
                    LRR.toast({
                        heading: "Success!",
                        text: "Cover updated!",
                        icon: "success"
                    });
                    window.location.reload();
                } else {
                    LRR.showErrorToast("Error updating cover: " + data.error);
                }
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error updating cover: " + error);
            }
        });
    },

    /**
     * Update tankobon tags by using the first archive's tags
     */
    updateTankoubonTags: function(tankId) {
        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "GET",
            success: function(tank) {
                if (!tank.archives || tank.archives.length === 0) {
                    // If no archives, clear the tags
                    $.ajax({
                        url: "../api/tankoubons/" + tankId,
                        type: "PUT",
                        contentType: "application/json",
                        data: JSON.stringify({
                            metadata: {
                                tags: ""
                            }
                        })
                    });
                    return;
                }

                // Get only the first archive's details
                $.ajax({
                    url: "../api/archives/" + tank.archives[0],
                    type: "GET",
                    success: function(archive) {
                        // Update tankobon with first archive's tags
                        $.ajax({
                            url: "../api/tankoubons/" + tankId,
                            type: "PUT",
                            contentType: "application/json",
                            data: JSON.stringify({
                                metadata: {
                                    tags: archive.tags || ""
                                }
                            }),
                            success: function(data) {
                                if (!data.success) {
                                    LRR.showErrorToast("Error updating tankobon tags: " + data.error);
                                }
                            },
                            error: function(xhr, status, error) {
                                LRR.showErrorToast("Error updating tankobon tags: " + error);
                            }
                        });
                    },
                    error: function(xhr, status, error) {
                        LRR.showErrorToast("Error loading archive details: " + error);
                    }
                });
            },
            error: function(xhr, status, error) {
                LRR.showErrorToast("Error loading tankobon: " + error);
            }
        });
    },

    /**
     * Remove an archive from the tankoubon
     */
    removeArchive: function (tankId, archiveId) {
        LRR.showPopUp({
            title: "Remove Archive",
            text: "Are you sure you want to remove this archive from the tankoubon?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            confirmButtonText: "Remove"
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: "../api/tankoubons/" + tankId + "/archives/" + archiveId,
                    type: "DELETE",
                    success: function (data) {
                        if (data.success) {
                            LRR.toast({
                                heading: "Success!",
                                text: data.message,
                                icon: "success"
                            });
                            // Update tags after removing archive
                            TankoubonView.updateTankoubonTags(tankId);
                            // Close the dialog and reload the page to update the archive list
                            window.location.reload();
                        } else {
                            LRR.showErrorToast("Error removing archive: " + data.error);
                        }
                    },
                    error: function (xhr, status, error) {
                        LRR.showErrorToast("Error removing archive: " + error);
                    }
                });
            }
        });
    },

    /**
     * Delete the current tankoubon
     */
    deleteTankoubon: function(deleteArchives = false) {
        const tankId = window.location.pathname.split('/').pop();
        
        LRR.showPopUp({
            title: deleteArchives ? "Delete Tankoubon and Archives" : "Delete Tankoubon",
            text: deleteArchives ? 
                "Are you sure you want to delete this tankoubon AND all archives inside it? This action cannot be undone!" :
                "Are you sure you want to delete this tankoubon? This action cannot be undone.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            confirmButtonText: deleteArchives ? "Delete All" : "Delete"
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: deleteArchives ? 
                        "../api/tankoubons/" + tankId + "?delete_archives=1" :
                        "../api/tankoubons/" + tankId,
                    type: "DELETE",
                    success: function(data) {
                        if (data.success) {
                            LRR.toast({
                                heading: "Success!",
                                text: deleteArchives ? "Tankoubon and all its archives have been deleted!" : "Tankoubon deleted!",
                                icon: "success"
                            });
                            // Redirect back to tankoubon list
                            window.location.href = "../tankoubons";
                        } else {
                            LRR.showErrorToast("Error deleting tankoubon: " + data.error);
                        }
                    },
                    error: function(xhr, status, error) {
                        LRR.showErrorToast("Error deleting tankoubon: " + error);
                    }
                });
            }
        });
    },

    /**
     * Populate the episode selection dropdown
     */
    populateEpisodeSelector: function() {
        const tankId = window.location.pathname.split('/').pop();
        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "GET",
            success: function(tank) {
                if (!tank.archives || tank.archives.length === 0) return;

                const archivePromises = tank.archives.map(arcid =>
                    $.ajax({
                        url: "../api/archives/" + arcid,
                        type: "GET"
                    })
                );

                Promise.all(archivePromises).then(archives => {
                    const select = $('#episode-selector');
                    select.empty();
                    select.append('<option value="">Select Episode...</option>');

                    archives.forEach((archive, index) => {
                        select.append(`<option value="${archive.arcid}">${index + 1}. ${archive.title}</option>`);
                    });
                });
            }
        });
    },

    /**
     * Jump to the selected episode
     */
    jumpToEpisode: function(arcid) {
        if (!arcid) return;
        const tankId = window.location.pathname.split('/').pop();
        window.location.href = "../reader?id=" + arcid + "&tank=" + tankId;
    }
};

// Initialize when document is ready
$(document).ready(function() {
    window.TankoubonView.initializeAll();
}); 