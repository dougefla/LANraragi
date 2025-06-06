/**
 * Tankoubon View Operations
 */
window.TankoubonView = {
    /**
     * Initialize the page
     */
    initializeAll: function () {
        // Load archives on page load
        this.loadArchives();

        // Initialize episode navigation
        this.initializeEpisodeNav();
    },

    /**
     * Get progress badge HTML for an archive
     */
    getProgressBadge: function (archive) {
        if (!archive.progress) return '';
        
        let badgeClass = '';
        let text = '';
        
        switch(archive.progress) {
            case 'new':
                badgeClass = 'progress-new';
                text = 'New';
                break;
            case 'reading':
                badgeClass = 'progress-reading';
                text = 'Reading';
                break;
            case 'completed':
                badgeClass = 'progress-completed';
                text = 'Completed';
                break;
        }
        
        return `<span class='progress-indicator ${badgeClass}'>${text}</span>`;
    },

    /**
     * Initialize episode navigation
     */
    initializeEpisodeNav: function() {
        const tankId = window.location.pathname.split('/').pop();
        const currentArchiveId = new URLSearchParams(window.location.search).get('id');
        
        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "GET",
            success: function(tank) {
                if (!tank.archives || tank.archives.length === 0) {
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
                    archives.forEach((archive, index) => {
                        const isCurrent = archive.arcid === currentArchiveId;
                        const progressClass = archive.progress ? 
                            (archive.progress === 'completed' ? 'read' : 
                             archive.progress === 'reading' ? 'reading' : '') : '';
                        
                        html += `
                            <div class='episode-nav-item ${isCurrent ? 'current' : ''} ${progressClass}'
                                 onclick='TankoubonView.jumpToEpisode("${archive.arcid}")'>
                                ${index + 1}
                                <div class='episode-nav-tooltip'>${archive.title}</div>
                            </div>
                        `;
                    });
                    $('#episode-nav').html(html);
                });
            }
        });
    },

    /**
     * Load archives for the current tankoubon
     */
    loadArchives: function () {
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
                    let html = "<div class='archive-grid'>";
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
                    
                    $('#archives-container').html(html);
                });
            },
            error: function(xhr, status, error) {
                LRR.showErrorToast("Error loading archives: " + error);
            }
        });
    },

    /**
     * Jump to a specific episode
     */
    jumpToEpisode: function(archiveId) {
        if (!archiveId) return;
        const tankId = window.location.pathname.split('/').pop();
        window.location.href = `../reader?id=${archiveId}&tank=${tankId}`;
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
                            data: JSON.stringify(result.value),
                            contentType: "application/json",
                            success: function() {
                                LRR.showSuccessToast("Tankoubon updated successfully!");
                                window.location.reload();
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
     * Delete the current tankoubon
     */
    deleteTankoubon: function(deleteArchives = false) {
        const tankId = window.location.pathname.split('/').pop();
        
        LRR.showPopUp({
            title: "Delete Tankoubon",
            text: deleteArchives ? 
                "Are you sure you want to delete this tankoubon AND all its archives? This action cannot be undone." :
                "Are you sure you want to delete this tankoubon? This action cannot be undone.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
            confirmButtonColor: "#dc3545"
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: "../api/tankoubons/" + tankId + (deleteArchives ? "?delete_archives=1" : ""),
                    type: "DELETE",
                    success: function() {
                        LRR.showSuccessToast("Tankoubon deleted successfully!");
                        window.location.href = "../tankoubons";
                    },
                    error: function(xhr, status, error) {
                        LRR.showErrorToast("Error deleting tankoubon: " + error);
                    }
                });
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
                if (!tank.archives || tank.archives.length === 0) {
                    LRR.showInfoToast("No archives to manage.");
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
                    let html = "<div class='archive-list'>";
                    html += "<table style='width: 100%; margin-top: 20px;'>";
                    html += "<thead><tr><th style='width: 60px'></th><th>Title</th><th style='width: 120px'>Actions</th></tr></thead><tbody>";

                    archives.forEach((archive, index) => {
                        html += "<tr>" +
                            "<td><img src='../api/archives/" + archive.arcid + "/thumbnail' style='max-width: 50px; height: auto;' /></td>" +
                            "<td>" + archive.title + "</td>" +
                            "<td style='text-align: right'>" +
                            "<div class='btn-group'>" +
                            "<button class='stdbtn' onclick='TankoubonView.moveArchive(\"" + tankId + "\", \"" + archive.arcid + "\", " + index + ", -1)'>" +
                            "<i class='fas fa-arrow-up'></i></button>" +
                            "<button class='stdbtn' onclick='TankoubonView.moveArchive(\"" + tankId + "\", \"" + archive.arcid + "\", " + index + ", 1)'>" +
                            "<i class='fas fa-arrow-down'></i></button>" +
                            "<button class='stdbtn' onclick='TankoubonView.setAsCover(\"" + tankId + "\", \"" + archive.arcid + "\")'>" +
                            "<i class='fas fa-image'></i></button>" +
                            "<button class='stdbtn' onclick='TankoubonView.removeArchive(\"" + tankId + "\", \"" + archive.arcid + "\")'>" +
                            "<i class='fas fa-times'></i></button>" +
                            "</div>" +
                            "</td></tr>";
                    });

                    html += "</tbody></table>";
                    html += "</div>";

                    LRR.showPopUp({
                        title: "Manage Archives",
                        html: html,
                        width: "800px",
                        showConfirmButton: false
                    });
                });
            },
            error: function(xhr, status, error) {
                LRR.showErrorToast("Error loading tankoubon: " + error);
            }
        });
    },

    /**
     * Move an archive up or down in the order
     */
    moveArchive: function(tankId, archiveId, currentIndex, direction) {
        $.ajax({
            url: "../api/tankoubons/" + tankId + "/archives/" + archiveId + "/move",
            type: "POST",
            data: JSON.stringify({ direction: direction }),
            contentType: "application/json",
            success: function() {
                window.location.reload();
            },
            error: function(xhr, status, error) {
                LRR.showErrorToast("Error moving archive: " + error);
            }
        });
    },

    /**
     * Set an archive as the tankoubon cover
     */
    setAsCover: function(tankId, archiveId) {
        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "PUT",
            data: JSON.stringify({
                metadata: {
                    cover_archive: archiveId
                }
            }),
            contentType: "application/json",
            success: function() {
                window.location.reload();
            },
            error: function(xhr, status, error) {
                LRR.showErrorToast("Error setting cover: " + error);
            }
        });
    },

    /**
     * Remove an archive from the tankoubon
     */
    removeArchive: function(tankId, archiveId) {
        LRR.showPopUp({
            title: "Remove Archive",
            text: "Are you sure you want to remove this archive from the tankoubon?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Remove",
            confirmButtonColor: "#dc3545"
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: "../api/tankoubons/" + tankId + "/archives/" + archiveId,
                    type: "DELETE",
                    success: function() {
                        window.location.reload();
                    },
                    error: function(xhr, status, error) {
                        LRR.showErrorToast("Error removing archive: " + error);
                    }
                });
            }
        });
    }
};

// Initialize when DOM is ready
jQuery(() => {
    TankoubonView.initializeAll();
}); 