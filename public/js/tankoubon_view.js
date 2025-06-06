/**
 * Tankoubon View Operations
 */
window.TankoubonView = {
    currentPage: 0,
    itemsPerPage: parseInt(localStorage.getItem('tankoubon-view-page-size') || '100'),
    totalArchives: 0,
    archives: [],
    allArchives: [], // Store all archives for episode navigation
    isEpisodeNavExpanded: false, // Track if episode nav is expanded
    maxVisibleEpisodes: 20, // Maximum number of episodes to show in compact view

    /**
     * Initialize the page
     */
    initializeAll: function () {
        // Parse URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const pageParam = urlParams.get('page');
        const sizeParam = urlParams.get('size');
        
        console.log('URL parameters:', { page: pageParam, size: sizeParam });
        
        if (pageParam !== null) {
            this.currentPage = parseInt(pageParam);
        }
        if (sizeParam !== null) {
            this.itemsPerPage = parseInt(sizeParam);
            localStorage.setItem('tankoubon-view-page-size', this.itemsPerPage);
        }

        console.log('Initial state:', {
            currentPage: this.currentPage,
            itemsPerPage: this.itemsPerPage
        });

        // Set initial value of items-per-page dropdowns
        $('#items-per-page, #items-per-page-bottom').val(this.itemsPerPage);
        
        // Load all archives first for episode navigation
        this.loadAllArchives(() => {
            // Then load paginated archives
            this.loadArchives();
        });

        // Add event listeners for pagination controls
        $('#page-select, #page-select-bottom').on('change', (e) => {
            this.currentPage = parseInt($(e.target).val()) - 1;
            console.log('Page changed:', {
                newPage: this.currentPage,
                itemsPerPage: this.itemsPerPage
            });
            this.loadArchives();
            
            // Sync other page select
            const otherSelect = e.target.id === 'page-select' ? '#page-select-bottom' : '#page-select';
            $(otherSelect).val(this.currentPage + 1);
        });

        $('#items-per-page, #items-per-page-bottom').on('change', (e) => {
            this.itemsPerPage = parseInt($(e.target).val());
            localStorage.setItem('tankoubon-view-page-size', this.itemsPerPage);
            this.currentPage = 0; // Reset to first page when changing items per page
            console.log('Items per page changed:', {
                newSize: this.itemsPerPage,
                currentPage: this.currentPage
            });
            this.loadArchives();
            
            // Sync other items-per-page select
            const otherSelect = e.target.id === 'items-per-page' ? '#items-per-page-bottom' : '#items-per-page';
            $(otherSelect).val(this.itemsPerPage);
        });

        // Add event listeners for navigation buttons
        const handleNavigation = (action) => {
            const totalPages = Math.ceil(this.totalArchives / this.itemsPerPage);
            let newPage = this.currentPage;

            switch (action) {
                case 'first':
                    newPage = 0;
                    break;
                case 'prev':
                    newPage = Math.max(0, this.currentPage - 1);
                    break;
                case 'next':
                    newPage = Math.min(totalPages - 1, this.currentPage + 1);
                    break;
                case 'last':
                    newPage = totalPages - 1;
                    break;
            }

            if (newPage !== this.currentPage) {
                this.currentPage = newPage;
                this.loadArchives();
            }
        };

        // Bind navigation buttons
        $('#first-page, #first-page-bottom').on('click', () => handleNavigation('first'));
        $('#prev-page, #prev-page-bottom').on('click', () => handleNavigation('prev'));
        $('#next-page, #next-page-bottom').on('click', () => handleNavigation('next'));
        $('#last-page, #last-page-bottom').on('click', () => handleNavigation('last'));
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
     * Load all archives for episode navigation
     */
    loadAllArchives: function(callback) {
        const tankId = window.location.pathname.split('/').pop();
        const currentArchiveId = new URLSearchParams(window.location.search).get('id');
        
        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "GET",
            data: { size: -1 }, // Request all archives
            success: (response) => {
                if (!response.archives || response.archives.length === 0) {
                    if (callback) callback();
                    return;
                }

                // Load archive details
                const archivePromises = response.archives.map(archiveId =>
                    $.ajax({
                        url: "../api/archives/" + archiveId,
                        type: "GET"
                    })
                );

                Promise.all(archivePromises).then(archives => {
                    this.allArchives = archives;
                    this.totalArchives = archives.length;
                    this.updateEpisodeNav(currentArchiveId, tankId);
                    if (callback) callback();
                });
            },
            error: (xhr, status, error) => {
                console.error('Error loading all archives:', error);
                if (callback) callback();
            }
        });
    },

    /**
     * Update episode navigation display
     */
    updateEpisodeNav: function(currentArchiveId, tankId) {
        const archives = this.allArchives;
        if (!archives || archives.length === 0) return;

        const currentIndex = archives.findIndex(archive => archive.arcid === currentArchiveId);
        let html = '<div class="episode-nav-container">';

        // Function to create episode button HTML
        const createEpisodeButton = (archive, index) => {
            const isCurrent = archive.arcid === currentArchiveId;
            const progressClass = archive.progress ? 
                (archive.progress === 'completed' ? 'read' : 
                 archive.progress === 'reading' ? 'reading' : '') : '';
            
            return `
                <div class='episode-nav-item ${isCurrent ? 'current' : ''} ${progressClass}'
                     onclick='window.location.href="../reader?id=${archive.arcid}&tank=${tankId}"'>
                    ${index + 1}
                    <div class='episode-nav-tooltip'>${archive.title}</div>
                </div>
            `;
        };

        if (archives.length > this.maxVisibleEpisodes && !this.isEpisodeNavExpanded) {
            // Compact view
            const visibleRange = 7; // Show 7 episodes around current
            const startEpisodes = archives.slice(0, 3); // First 3
            const endEpisodes = archives.slice(-3); // Last 3
            
            // Calculate range around current episode
            let currentStart = Math.max(3, currentIndex - Math.floor(visibleRange/2));
            let currentEnd = Math.min(archives.length - 3, currentStart + visibleRange);
            currentStart = Math.max(3, currentEnd - visibleRange); // Adjust start if end was capped
            
            const middleEpisodes = archives.slice(currentStart, currentEnd);

            // Add first episodes
            startEpisodes.forEach((archive, i) => {
                html += createEpisodeButton(archive, i);
            });

            // Add ellipsis if there's a gap
            if (currentStart > startEpisodes.length) {
                html += '<div class="episode-nav-ellipsis">...</div>';
            }

            // Add middle episodes around current
            middleEpisodes.forEach((archive, i) => {
                html += createEpisodeButton(archive, i + currentStart);
            });

            // Add ellipsis if there's a gap
            if (currentEnd < archives.length - endEpisodes.length) {
                html += '<div class="episode-nav-ellipsis">...</div>';
            }

            // Add last episodes
            endEpisodes.forEach((archive, i) => {
                html += createEpisodeButton(archive, archives.length - endEpisodes.length + i);
            });

            // Add expand button
            html += `
                <div class="episode-nav-expand" onclick="TankoubonView.toggleEpisodeNav()">
                    <i class="fas fa-chevron-down"></i>
                    Show All
                </div>
            `;
        } else {
            // Expanded view
            archives.forEach((archive, index) => {
                html += createEpisodeButton(archive, index);
            });

            // Add collapse button if expandable
            if (archives.length > this.maxVisibleEpisodes) {
                html += `
                    <div class="episode-nav-expand" onclick="TankoubonView.toggleEpisodeNav()">
                        <i class="fas fa-chevron-up"></i>
                        Show Less
                    </div>
                `;
            }
        }

        html += '</div>';
        $('#episode-nav').html(html);
    },

    /**
     * Toggle episode navigation between expanded and compact views
     */
    toggleEpisodeNav: function() {
        this.isEpisodeNavExpanded = !this.isEpisodeNavExpanded;
        const tankId = window.location.pathname.split('/').pop();
        const currentArchiveId = new URLSearchParams(window.location.search).get('id');
        this.updateEpisodeNav(currentArchiveId, tankId);
    },

    /**
     * Load archives for the current page
     */
    loadArchives: function () {
        const tankId = window.location.pathname.split('/').pop();
        
        // Show loading indicator
        $('#archives-container').html('<div class="loading-indicator"><i class="fa fa-4x fa-spinner fa-spin"></i></div>');
        
        const params = {
            page: this.currentPage,
            size: this.itemsPerPage
        };

        console.log('Loading archives with params:', params);
        
        $.ajax({
            url: "../api/tankoubons/" + tankId,
            type: "GET",
            data: params,
            success: (response) => {
                console.log('API response:', response);

                if (!response.archives || response.archives.length === 0) {
                    $('#archives-container').html(
                        "<div class='empty-message'>" +
                        "<i class='fas fa-book-open fa-3x'></i><br><br>" +
                        "No archives in this tankoubon.<br>" +
                        "Add archives using the context menu in the main library view!" +
                        "</div>"
                    );
                    return;
                }

                // Load archive details for the current page
                const archivePromises = response.archives.map(archiveId =>
                    $.ajax({
                        url: "../api/archives/" + archiveId,
                        type: "GET"
                    })
                );

                Promise.all(archivePromises).then(archives => {
                    console.log('Loaded archive details:', archives.length);
                    this.archives = archives;
                    
                    let html = "<div class='archive-grid'>";
                    archives.forEach((archive) => {
                        html += `
                            <div class='archive-card' onclick='window.location.href="../reader?id=${archive.arcid}&tank=${tankId}"'>
                                <img src="../api/archives/${archive.arcid}/thumbnail" alt="Thumbnail" />
                                <div class='title'>${archive.title}</div>
                                ${this.getProgressBadge(archive)}
                            </div>
                        `;
                    });
                    html += "</div>";
                    
                    $('#archives-container').html(html);
                    this.updatePagination();
                });
            },
            error: (xhr, status, error) => {
                console.error('API error:', { status, error, response: xhr.responseText });
                LRR.showErrorToast("Error loading tankoubon: " + error);
                $('#archives-container').html(
                    "<div class='error-message'>" +
                    "<i class='fas fa-exclamation-circle fa-3x'></i><br><br>" +
                    "Error loading archives: " + error +
                    "</div>"
                );
            }
        });
    },

    /**
     * Update pagination controls
     */
    updatePagination: function() {
        const totalPages = Math.ceil(this.totalArchives / this.itemsPerPage);
        console.log('Updating pagination:', {
            totalArchives: this.totalArchives,
            itemsPerPage: this.itemsPerPage,
            totalPages: totalPages,
            currentPage: this.currentPage
        });

        // Update both page selects
        $('#page-select, #page-select-bottom').each((_, select) => {
            const $select = $(select);
            $select.empty();
            
            for (let i = 1; i <= totalPages; i++) {
                $select.append($('<option>', {
                    value: i,
                    text: `${i} / ${totalPages}`,
                    selected: i === this.currentPage + 1
                }));
            }
        });

        // Update both items-per-page dropdowns
        $('#items-per-page, #items-per-page-bottom').val(this.itemsPerPage);

        // Update showing/total counts
        const start = this.currentPage * this.itemsPerPage + 1;
        const end = Math.min(start + this.archives.length - 1, this.totalArchives);
        $('#showing-count, #showing-count-bottom').text(`${start}-${end}`);
        $('#total-count, #total-count-bottom').text(this.totalArchives);

        // Update last page numbers
        $('#last-page-number, #last-page-number-bottom').text(totalPages);

        // Update navigation button states
        const isFirstPage = this.currentPage === 0;
        const isLastPage = this.currentPage >= totalPages - 1;

        $('#first-page, #first-page-bottom').prop('disabled', isFirstPage);
        $('#prev-page, #prev-page-bottom').prop('disabled', isFirstPage);
        $('#next-page, #next-page-bottom').prop('disabled', isLastPage);
        $('#last-page, #last-page-bottom').prop('disabled', isLastPage);

        // Update URL with current parameters
        const url = new URL(window.location);
        url.searchParams.set('page', this.currentPage);
        url.searchParams.set('size', this.itemsPerPage);
        window.history.replaceState({}, '', url);
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