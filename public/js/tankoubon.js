/**
 * Tankoubon Management Operations
 */
window.Tankoubon = {
    /**
     * Initialize the page
     */
    initializeAll: function () {
        // Bind events to DOM
        $("#new-tankoubon").click(this.showNewTankoubonDialog);
        $("#refresh").click(this.refreshList);
        $("#return").click(() => { window.location.href = "."; });

        // View toggle buttons
        $("#list-view").click(() => {
            $("#list-view").addClass('active');
            $("#grid-view").removeClass('active');
            localStorage.setItem('tankoubon-view', 'list');
            this.loadTankoubonList();
        });

        $("#grid-view").click(() => {
            $("#grid-view").addClass('active');
            $("#list-view").removeClass('active');
            localStorage.setItem('tankoubon-view', 'grid');
            this.loadTankoubonList();
        });

        // Set initial view based on localStorage
        const viewMode = localStorage.getItem('tankoubon-view') || 'list';
        if (viewMode === 'grid') {
            $("#grid-view").click();
        }

        // Load tankoubon list on page load
        this.loadTankoubonList();
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
     * Load the list of tankoubon
     */
    loadTankoubonList: function () {
        const viewMode = localStorage.getItem('tankoubon-view') || 'list';

        $.ajax({
            url: "api/tankoubons",
            type: "GET",
            success: function (data) {
                let html = "";
                if (data.length === 0) {
                    html = "<div class='no-results'><i class='fas fa-book fa-3x'></i><br><br>No tankoubons found.<br>Create one using the 'New Tankoubon' button above!</div>";
                } else if (viewMode === 'list') {
                    html = "<div class='ido'><table class='table-list'><thead><tr>" +
                        "<th style='width: 40%'>Name</th>" +
                        "<th style='width: 30%'>Archives</th>" +
                        "<th style='width: 30%'>Last Modified</th>" +
                        "</tr></thead><tbody>";

                    data.forEach(function (tank) {
                        const archiveCount = tank.archives ? tank.archives.length : 0;
                        const lastModified = tank.last_modified ? new Date(tank.last_modified * 1000).toLocaleString() : "Never";
                        
                        html += "<tr id='tank-" + tank.id + "' style='cursor: pointer;' onclick='Tankoubon.viewArchives(\"" + tank.id + "\")'>" +
                            "<td class='tank-name'>" + tank.name + "</td>" +
                            "<td>" + archiveCount + " archives</td>" +
                            "<td>" + lastModified + "</td>" +
                            "</tr>";
                    });

                    html += "</tbody></table></div>";
                    $("#tankoubon-list").html(html);
                } else {
                    // For grid view, we need to load previews first
                    html = "<div class='grid-view'>";
                    const previewPromises = data.map(tank => 
                        Tankoubon.getTankoubonPreview(tank.id).then(previewUrl => ({
                            ...tank,
                            previewUrl
                        }))
                    );

                    Promise.all(previewPromises).then(tanksWithPreviews => {
                        tanksWithPreviews.forEach(tank => {
                            const archiveCount = tank.archives ? tank.archives.length : 0;
                            const lastModified = tank.last_modified ? new Date(tank.last_modified * 1000).toLocaleString() : "Never";
                            
                            html += "<div class='tankoubon-card' onclick='Tankoubon.viewArchives(\"" + tank.id + "\")'>" +
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
                                "<span title='" + lastModified + "'><i class='fas fa-clock'></i></span>" +
                                "</div>" +
                                "</div>" +
                                "</div>";
                        });

                        html += "</div>";
                        $("#tankoubon-list").html(html);
                    });
                }
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error loading tankoubons: " + error);
            }
        });
    },

    /**
     * Show dialog for creating a new tankoubon
     */
    showNewTankoubonDialog: function () {
        LRR.showPopUp({
            title: I18N.NewTankoubon,
            input: "text",
            inputValue: I18N.TankoubonDefaultName,
            showCancelButton: true,
            inputValidator: (value) => {
                if (!value) {
                    return I18N.MissingTankoubonName;
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                Tankoubon.createTankoubon(result.value);
            }
        });
    },

    /**
     * Show dialog for editing a tankoubon
     */
    showEditTankoubonDialog: function (tankId) {
        $.ajax({
            url: "api/tankoubons/" + tankId,
            type: "GET",
            success: function (tank) {
                LRR.showPopUp({
                    title: "Edit Tankoubon",
                    input: "text",
                    inputValue: tank.name,
                    showCancelButton: true,
                    inputValidator: (value) => {
                        if (!value) {
                            return I18N.MissingTankoubonName;
                        }
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        this.updateTankoubon(tankId, result.value);
                    }
                });
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error loading tankoubon: " + error);
            }
        });
    },

    /**
     * Create a new tankoubon
     */
    createTankoubon: function (name) {
        $.ajax({
            url: "api/tankoubons",
            type: "PUT",
            data: { name: name },
            success: function (data) {
                if (data.success) {
                    LRR.toast({
                        heading: "Success!",
                        text: "Created tankoubon '" + name + "'",
                        icon: "success"
                    });
                    Tankoubon.loadTankoubonList();
                } else {
                    LRR.showErrorToast("Error creating tankoubon: " + data.error);
                }
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error creating tankoubon: " + error);
            }
        });
    },

    /**
     * Update a tankoubon
     */
    updateTankoubon: function (tankId, name) {
        $.ajax({
            url: "api/tankoubons/" + tankId,
            type: "PUT",
            data: { name: name },
            success: function (data) {
                if (data.success) {
                    LRR.toast({
                        heading: "Success!",
                        text: "Updated tankoubon '" + name + "'",
                        icon: "success"
                    });
                    Tankoubon.loadTankoubonList();
                } else {
                    LRR.showErrorToast("Error updating tankoubon: " + data.error);
                }
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error updating tankoubon: " + error);
            }
        });
    },

    /**
     * Delete a tankoubon
     */
    deleteTankoubon: function (tankId) {
        LRR.showPopUp({
            title: "Delete Tankoubon",
            text: I18N.TankoubonDeleteConfirm,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            confirmButtonText: "Delete"
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: "api/tankoubons/" + tankId,
                    type: "DELETE",
                    success: function (data) {
                        if (data.success) {
                            LRR.toast({
                                heading: "Success!",
                                text: I18N.TankoubonDeleted,
                                icon: "success"
                            });
                            Tankoubon.loadTankoubonList();
                        } else {
                            LRR.showErrorToast("Error deleting tankoubon: " + data.error);
                        }
                    },
                    error: function (xhr, status, error) {
                        LRR.showErrorToast("Error deleting tankoubon: " + error);
                    }
                });
            }
        });
    },

    /**
     * Add an archive to a tankoubon
     */
    addArchive: function (tankId, archiveId) {
        $.ajax({
            url: "api/tankoubons/" + tankId + "/archives/" + archiveId,
            type: "PUT",
            success: function (data) {
                if (data.success) {
                    LRR.toast({
                        heading: "Success!",
                        text: data.message,
                        icon: "success"
                    });
                } else {
                    LRR.showErrorToast("Error adding archive: " + data.error);
                }
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error adding archive: " + error);
            }
        });
    },

    /**
     * Remove an archive from a tankoubon
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
                    url: "api/tankoubons/" + tankId + "/archives/" + archiveId,
                    type: "DELETE",
                    success: function (data) {
                        if (data.success) {
                            LRR.toast({
                                heading: "Success!",
                                text: data.message,
                                icon: "success"
                            });
                            // Remove the archive row from the table
                            $("#archive-" + archiveId).remove();
                            // Refresh the main list to update archive count
                            Tankoubon.loadTankoubonList();
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
     * Refresh the tankoubon list
     */
    refreshList: function () {
        Tankoubon.loadTankoubonList();
    },

    /**
     * View and manage archives in a tankoubon
     */
    viewArchives: function (tankId) {
        $.ajax({
            url: "api/tankoubons/" + tankId,
            type: "GET",
            success: function (tank) {
                let html = "<div class='archive-list'>";
                
                // Add tankoubon management buttons at the top
                html += "<div class='tankoubon-actions'>" +
                    "<button class='stdbtn' onclick='Tankoubon.showEditTankoubonDialog(\"" + tankId + "\")'>" +
                    "<i class='fas fa-edit'></i> Edit Name</button>" +
                    "<button class='stdbtn delete-btn' onclick='Tankoubon.deleteTankoubon(\"" + tankId + "\")'>" +
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
                                url: "api/archives/" + archiveId,
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
                                "<td><img src='./api/archives/" + archive.arcid + "/thumbnail' class='thumbnail' style='max-width: 50px; height: auto;' /></td>" +
                                "<td>" +
                                "<input type='number' class='order-input' value='" + currentOrder + "' " +
                                "min='1' max='" + archives.length + "' " +
                                "data-archive-id='" + archive.arcid + "' " +
                                "data-original-order='" + currentOrder + "' " +
                                "style='width: 60px;'>" +
                                "</td>" +
                                "<td><a href='./reader?id=" + archive.arcid + "' target='_blank'>" + archive.title + "</a></td>" +
                                "<td class='table-actions'>" +
                                "<div class='button-group'>" +
                                "<button class='stdbtn' onclick='Tankoubon.moveArchive(\"" + tankId + "\", \"" + archive.arcid + "\", \"up\")'>" +
                                "<i class='fas fa-arrow-up'></i></button>" +
                                "<button class='stdbtn' onclick='Tankoubon.moveArchive(\"" + tankId + "\", \"" + archive.arcid + "\", \"down\")'>" +
                                "<i class='fas fa-arrow-down'></i></button>" +
                                "<button class='stdbtn' onclick='Tankoubon.setAsCover(\"" + tankId + "\", \"" + archive.arcid + "\")'>" +
                                "<i class='fas fa-image'></i></button>" +
                                "<button class='stdbtn' onclick='Tankoubon.removeArchive(\"" + tankId + "\", \"" + archive.arcid + "\")'>" +
                                "<i class='fas fa-times'></i></button>" +
                                "</div>" +
                                "</td></tr>";
                        });

                        html += "</tbody></table>";
                        html += "<div class='order-actions'>" +
                            "<button class='stdbtn' onclick='Tankoubon.saveOrder(\"" + tankId + "\")'>" +
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
            url: "api/tankoubons/" + tankId,
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
            url: "api/tankoubons/" + tankId,
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
                    Tankoubon.loadTankoubonList();
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
     * Add an archive to a tankoubon from the archive view
     */
    addArchiveFromView: function (archiveId) {
        $.ajax({
            url: "api/tankoubons",
            type: "GET",
            success: function (tankoubons) {
                let options = "";
                
                // Add option to create new tankoubon
                options += `<option value="new">${I18N.NewTankoubon}</option>`;
                options += `<option disabled>──────────</option>`;
                
                // Add existing tankoubons
                tankoubons.forEach(tank => 
                    options += `<option value="${tank.id}">${tank.name}</option>`
                );

                let html = `
                    <div>
                        <p>${I18N.SelectTankoubon}</p>
                        <select id="tankoubon-select" class="favtag-btn">
                            ${options}
                        </select>
                    </div>
                `;

                LRR.showPopUp({
                    title: I18N.AddToTankoubon,
                    html: html,
                    showCancelButton: true,
                    confirmButtonText: I18N.Add,
                    preConfirm: () => {
                        return $('#tankoubon-select').val();
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        if (result.value === "new") {
                            // Show dialog to create new tankoubon
                            LRR.showPopUp({
                                title: I18N.NewTankoubon,
                                input: "text",
                                inputValue: I18N.TankoubonDefaultName,
                                showCancelButton: true,
                                inputValidator: (value) => {
                                    if (!value) {
                                        return I18N.MissingTankoubonName;
                                    }
                                }
                            }).then((createResult) => {
                                if (createResult.isConfirmed) {
                                    // Create tankoubon and add archive to it
                                    $.ajax({
                                        url: "api/tankoubons",
                                        type: "PUT",
                                        data: { name: createResult.value },
                                        success: function (data) {
                                            if (data.success) {
                                                Tankoubon.addArchive(data.tankoubon_id, archiveId);
                                            } else {
                                                LRR.showErrorToast("Error creating tankoubon: " + data.error);
                                            }
                                        }
                                    });
                                }
                            });
                        } else {
                            // Add to existing tankoubon
                            Tankoubon.addArchive(result.value, archiveId);
                        }
                    }
                });
            },
            error: function (xhr, status, error) {
                LRR.showErrorToast("Error loading tankoubons: " + error);
            }
        });
    }
};

// Initialize when document is ready
$(document).ready(function () {
    if ($("#tankoubon-list").length) {
        window.Tankoubon.initializeAll();
    }
}); 