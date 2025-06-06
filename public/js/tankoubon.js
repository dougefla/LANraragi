/**
 * Tankoubon Operations
 */
window.Tankoubon = {
    currentPage: 0,
    totalPages: 0,
    pageSize: 100,  // Default page size
    sortBy: localStorage.getItem('tankoubon-sort-by') || 'name',
    sortOrder: localStorage.getItem('tankoubon-sort-order') || 'asc',

    /**
     * Initialize the page
     */
    initializeAll: function () {
        // Bind events to DOM
        $("#new-tankoubon").click(this.showNewTankoubonDialog);
        $("#refresh").click(this.refreshList);
        $("#return").click(() => { window.location.href = "."; });

        // Sort functionality
        $("#sort-by").val(this.sortBy);  // Set initial sort option
        $("#sort-by").change(() => {
            this.sortBy = $("#sort-by").val();
            localStorage.setItem('tankoubon-sort-by', this.sortBy);
            this.currentPage = 0;
            this.loadTankoubonList();
        });

        // Initialize sort order button state
        $(".sort-order").addClass(this.sortOrder);
        $(".sort-order").off('click').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
            localStorage.setItem('tankoubon-sort-order', this.sortOrder);
            $(".sort-order").removeClass('asc desc').addClass(this.sortOrder);
            this.loadTankoubonList();
            return false;
        });

        // View toggle buttons
        $(".grid-toggle, .list-toggle").click((e) => {
            e.preventDefault();
            const isGrid = $(e.target).hasClass('grid-toggle');
            $(".mode-toggle").removeClass('active');
            $(e.target).addClass('active');
            localStorage.setItem('tankoubon-view', isGrid ? 'grid' : 'list');
            this.loadTankoubonList();
        });

        // Page size control
        const savedPageSize = localStorage.getItem('tankoubon-page-size') || '100';
        this.pageSize = parseInt(savedPageSize);
        $("#page-size").val(savedPageSize);

        $("#page-size").change(() => {
            this.pageSize = parseInt($("#page-size").val());
            localStorage.setItem('tankoubon-page-size', this.pageSize);
            this.currentPage = 0;  // Reset to first page when changing page size
            this.loadTankoubonList();
            this.updatePageSelect();
        });

        // Page select dropdown
        $("#page-select").change(() => {
            this.currentPage = parseInt($("#page-select").val()) - 1;
            this.loadTankoubonList();
        });

        // Set initial view based on localStorage
        const viewMode = localStorage.getItem('tankoubon-view') || 'grid';
        if (viewMode === 'list') {
            $(".list-toggle").click();
        } else {
            $(".grid-toggle").addClass('active');
        }

        // Initialize context menu
        $.contextMenu({
            selector: '.tankoubon-item',
            callback: function(key, options) {
                const tankId = $(this).data('tank-id');
                switch(key) {
                    case "view":
                        window.location.href = `./tankoubon/${tankId}`;
                        break;
                    case "edit":
                        Tankoubon.showEditTankoubonDialog(tankId);
                        break;
                    case "delete":
                        Tankoubon.deleteTankoubon(tankId);
                        break;
                    case "delete_all":
                        Tankoubon.deleteTankoubonAndArchives(tankId);
                        break;
                }
            },
            items: {
                "view": {name: "View Details", icon: "fas fa-book"},
                "edit": {name: "Edit Name", icon: "fas fa-edit"},
                "delete": {name: "Delete", icon: "fas fa-trash"},
                "delete_all": {name: "Delete Tankoubon (All)", icon: "fas fa-trash-alt"}
            }
        });

        // Load tankoubon list on page load
        this.loadTankoubonList();
    },

    /**
     * Load the list of tankoubon
     */
    loadTankoubonList: function () {
        const viewMode = localStorage.getItem('tankoubon-view') || 'grid';
        const params = {
            page: this.currentPage,
            size: this.pageSize,
            sort: this.sortBy,
            order: this.sortOrder
        };

        // Update URL with current parameters
        const url = new URL(window.location);
        url.searchParams.set('page', this.currentPage);
        url.searchParams.set('sort', this.sortBy);
        url.searchParams.set('order', this.sortOrder);
        window.history.replaceState({}, '', url);

        // Show loading indicator
        $("#loading-indicator").show();
        $("#empty-state").hide();
        $("#tankoubon-list table, #tankoubon-list .grid-view").remove();

        $.ajax({
            url: "api/tankoubons",
            type: "GET",
            data: params,
            success: (response) => {
                const data = response.result;

                if (data.length === 0) {
                    $("#loading-indicator").hide();
                    $("#empty-state").show();
                    return;
                }

                let html = "";
                if (viewMode === 'list') {
                    html = "<div class='ido'><table class='table-list'><thead><tr>" +
                        "<th style='width: 40%'>Name</th>" +
                        "<th style='width: 30%'>Archives</th>" +
                        "<th style='width: 30%'>Last Modified</th>" +
                        "</tr></thead><tbody>";

                    data.forEach(function (tank) {
                        const archiveCount = tank.archive_count || 0;
                        const lastModified = tank.last_updated ? new Date(tank.last_updated * 1000).toLocaleString() : "Never";
                        
                        html += "<tr class='tankoubon-item' data-tank-id='" + tank.id + "' style='cursor: pointer;'>" +
                            "<td class='tank-name'>" + tank.name + "</td>" +
                            "<td><div class='archive-count'><i class='fas fa-book'></i> " + archiveCount + "</div></td>" +
                            "<td>" + lastModified + "</td>" +
                            "</tr>";
                    });

                    html += "</tbody></table></div>";
                } else {
                    // For grid view, we need to load previews first
                    html = "<div class='grid-view'>";
                    const previewPromises = data.map(tank => 
                        this.getTankoubonPreview(tank.id).then(previewUrl => ({
                            ...tank,
                            previewUrl
                        }))
                    );

                    Promise.all(previewPromises).then(tanksWithPreviews => {
                        tanksWithPreviews.forEach(tank => {
                            const archiveCount = tank.archive_count || 0;
                            
                            html += "<div class='tankoubon-item tankoubon-card' data-tank-id='" + tank.id + "'>" +
                                "<div class='info'>" +
                                "<div class='name'>" + tank.name + "</div>" +
                                "</div>" +
                                "<div class='preview'>";
                            
                            if (tank.previewUrl) {
                                html += "<img src='" + tank.previewUrl + "' alt='Preview'>";
                            } else {
                                html += "<i class='fas fa-book fa-3x' style='color: #ddd;'></i>";
                            }

                            html += "</div>" +
                                "<div class='archive-count'><i class='fas fa-book'></i> " + archiveCount + "</div>" +
                                "</div>";
                        });

                        html += "</div>";
                        $("#tankoubon-list").html(html);

                        // Add click handlers for grid view
                        this.addClickHandlers();
                    });
                }

                if (viewMode === 'list') {
                    $("#tankoubon-list").html(html);
                    // Add click handlers for list view
                    this.addClickHandlers();
                }

                $("#loading-indicator").hide();
                
                // Update pagination
                this.totalPages = Math.ceil(response.total / this.pageSize);
                this.updatePageSelect();
            },
            error: (xhr, status, error) => {
                $("#loading-indicator").hide();
                LRR.showErrorToast("Error loading tankoubons: " + error);
            }
        });
    },

    /**
     * Add click handlers to tankoubon items
     */
    addClickHandlers: function() {
        $('.tankoubon-item').off('click').on('click', function(e) {
            // Don't trigger if clicking on context menu
            if (!$(e.target).closest('.context-menu-item').length) {
                const tankId = $(this).data('tank-id');
                window.location.href = `./tankoubon/${tankId}`;
            }
        });
    },

    /**
     * Refresh the list
     */
    refreshList: function() {
        Tankoubon.loadTankoubonList();
    },

    /**
     * Show dialog to create a new tankoubon
     */
    showNewTankoubonDialog: function() {
        LRR.showPopUp({
            title: "New Tankoubon",
            html: `
                <div style="text-align:left">
                    <label for="tankoubon-name">Name:</label><br>
                    <input type="text" id="tankoubon-name" class="stdinput" style="width:100%" maxlength="255">
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: "Create",
            preConfirm: () => {
                const name = $("#tankoubon-name").val();
                if (!name) {
                    LRR.showErrorToast("Please enter a name for the tankoubon");
                    return false;
                }
                return name;
            }
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: "api/tankoubons",
                    type: "POST",
                    data: JSON.stringify({ name: result.value }),
                    contentType: "application/json",
                    success: function() {
                        LRR.showSuccessToast("Tankoubon created successfully!");
                        Tankoubon.loadTankoubonList();
                    },
                    error: function(xhr, status, error) {
                        LRR.showErrorToast("Error creating tankoubon: " + error);
                    }
                });
            }
        });
    },

    /**
     * Show dialog to edit a tankoubon
     */
    showEditTankoubonDialog: function(tankId) {
        $.ajax({
            url: "api/tankoubons/" + tankId,
            type: "GET",
            success: function(tank) {
                LRR.showPopUp({
                    title: "Edit Tankoubon",
                    html: `
                        <div style="text-align:left">
                            <label for="tankoubon-name">Name:</label><br>
                            <input type="text" id="tankoubon-name" class="stdinput" style="width:100%" maxlength="255" value="${tank.name}">
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: "Save",
                    preConfirm: () => {
                        const name = $("#tankoubon-name").val();
                        if (!name) {
                            LRR.showErrorToast("Please enter a name for the tankoubon");
                            return false;
                        }
                        return name;
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        $.ajax({
                            url: "api/tankoubons/" + tankId,
                            type: "PUT",
                            data: JSON.stringify({ name: result.value }),
                            contentType: "application/json",
                            success: function() {
                                LRR.showSuccessToast("Tankoubon updated successfully!");
                                Tankoubon.loadTankoubonList();
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
     * Delete a tankoubon
     */
    deleteTankoubon: function(tankId) {
        LRR.showPopUp({
            title: "Delete Tankoubon",
            text: "Are you sure you want to delete this tankoubon? This action cannot be undone.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
            confirmButtonColor: "#dc3545"
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: "api/tankoubons/" + tankId,
                    type: "DELETE",
                    success: function() {
                        LRR.showSuccessToast("Tankoubon deleted successfully!");
                        Tankoubon.loadTankoubonList();
                    },
                    error: function(xhr, status, error) {
                        LRR.showErrorToast("Error deleting tankoubon: " + error);
                    }
                });
            }
        });
    },

    /**
     * Delete a tankoubon and all its archives
     */
    deleteTankoubonAndArchives: function(tankId) {
        LRR.showPopUp({
            title: "Delete Tankoubon and Archives",
            text: "Are you sure you want to delete this tankoubon AND all its archives? This action cannot be undone.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete All",
            confirmButtonColor: "#dc3545"
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: "api/tankoubons/" + tankId + "/delete_all",
                    type: "DELETE",
                    success: function() {
                        LRR.showSuccessToast("Tankoubon and archives deleted successfully!");
                        Tankoubon.loadTankoubonList();
                    },
                    error: function(xhr, status, error) {
                        LRR.showErrorToast("Error deleting tankoubon and archives: " + error);
                    }
                });
            }
        });
    },

    /**
     * Get a preview image for a tankoubon from its first archive
     */
    getTankoubonPreview: function (tankId) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: "api/tankoubons/" + tankId,
                type: "GET",
                success: function(tank) {
                    if (tank.cover_archive) {
                        resolve("./api/archives/" + tank.cover_archive + "/thumbnail");
                    } else if (tank.archives && tank.archives.length > 0) {
                        resolve("./api/archives/" + tank.archives[0] + "/thumbnail");
                    } else {
                        resolve(null);
                    }
                },
                error: function(error) {
                    console.error("Error getting tankoubon preview:", error);
                    resolve(null);
                }
            });
        });
    },

    /**
     * Update the page select dropdown with the current number of pages
     */
    updatePageSelect: function() {
        const $pageSelect = $("#page-select");
        $pageSelect.empty();
        
        for (let i = 1; i <= this.totalPages; i++) {
            $pageSelect.append($('<option>', {
                value: i,
                text: i,
                selected: i === this.currentPage + 1
            }));
        }
    }
};

// Initialize when document is ready
$(document).ready(function () {
    if ($("#tankoubon-list").length) {
        window.Tankoubon.initializeAll();
    }
}); 