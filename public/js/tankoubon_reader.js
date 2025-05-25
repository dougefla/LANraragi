/**
 * Tankoubon Reader Operations
 */
window.TankoubonReader = {
    /**
     * Initialize the page
     */
    initializeAll: function () {
        // Bind events to DOM
        $("#refresh").click(this.loadTankoubonGrid);
        $("#return").click(() => { window.location.href = "."; });
        $("#search-input").on('input', this.handleSearch);

        // Load tankoubon grid on page load
        this.loadTankoubonGrid();
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
     * Load the grid of tankoubon
     */
    loadTankoubonGrid: function () {
        $.ajax({
            url: "api/tankoubons",
            type: "GET",
            success: function (data) {
                if (data.length === 0) {
                    $("#tankoubon-grid").html("<div class='no-results'><i class='fas fa-book fa-3x'></i><br><br>No tankoubons found.</div>");
                    return;
                }

                const previewPromises = data.map(tank => 
                    TankoubonReader.getTankoubonPreview(tank.id).then(previewUrl => ({
                        ...tank,
                        previewUrl
                    }))
                );

                Promise.all(previewPromises).then(tanksWithPreviews => {
                    let html = "";
                    tanksWithPreviews.forEach(tank => {
                        const archiveCount = tank.archives ? tank.archives.length : 0;
                        
                        html += "<div class='tankoubon-card' onclick='TankoubonReader.viewTankoubon(\"" + tank.id + "\")'>" +
                            "<div class='preview'>";
                        
                        if (tank.previewUrl) {
                            html += "<img src='" + tank.previewUrl + "' alt='Preview'>";
                        } else {
                            html += "<i class='fas fa-book fa-3x' style='color: #ddd;'></i>";
                        }

                        html += "</div>" +
                            "<div class='info'>" +
                            "<div class='name'>" + tank.name + "</div>" +
                            "<div class='stats'>" +
                            "<span>" + archiveCount + " archives</span>" +
                            "</div>" +
                            "</div>" +
                            "</div>";
                    });

                    $("#tankoubon-grid").html(html);
                });
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error loading tankoubons: " + error);
            }
        });
    },

    /**
     * Handle search input
     */
    handleSearch: function () {
        const searchTerm = $("#search-input").val().toLowerCase();
        $(".tankoubon-card").each(function() {
            const name = $(this).find(".name").text().toLowerCase();
            if (name.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    },

    /**
     * View a tankoubon's archives
     */
    viewTankoubon: function (tankId) {
        $.ajax({
            url: "api/tankoubons/" + tankId,
            type: "GET",
            success: function (tank) {
                if (!tank.archives || tank.archives.length === 0) {
                    LRR.toast({
                        heading: "Empty Tankoubon",
                        text: "This tankoubon has no archives.",
                        icon: "warning"
                    });
                    return;
                }

                // Get archive details
                const archivePromises = tank.archives.map(archiveId =>
                    $.ajax({
                        url: "api/archives/" + archiveId + "/metadata",
                        type: "GET"
                    })
                );

                Promise.all(archivePromises).then(archives => {
                    // Sort archives by their order in tank.archives
                    const archiveMap = new Map();
                    tank.archives.forEach((id, index) => {
                        archiveMap.set(id, index + 1);
                    });

                    archives.sort((a, b) => archiveMap.get(a.arcid) - archiveMap.get(b.arcid));

                    let html = "<div class='archive-list'><h3>" + tank.name + "</h3>";
                    html += "<table style='width: 100%; margin-top: 20px;'>";
                    html += "<tr><th style='width: 60px'></th><th>Title</th></tr>";

                    archives.forEach(function (archive) {
                        html += "<tr>" +
                            "<td><img src='./api/archives/" + archive.arcid + "/thumbnail' class='thumbnail' style='max-width: 50px; height: auto;' /></td>" +
                            "<td><a href='./reader?id=" + archive.arcid + "' target='_blank'>" + archive.title + "</a></td>" +
                            "</tr>";
                    });

                    html += "</table></div>";

                    LRR.showPopUp({
                        title: tank.name,
                        html: html,
                        width: "800px"
                    });
                });
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error loading tankoubon: " + error);
            }
        });
    }
};

// Initialize when DOM is ready
jQuery(() => {
    TankoubonReader.initializeAll();
}); 