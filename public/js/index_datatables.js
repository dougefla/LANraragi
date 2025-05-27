/**
 * All the Archive Index functions related to DataTables.
 */
const IndexTable = {};

IndexTable.dataTable = {};
IndexTable.originalTitle = document.title;
IndexTable.isComingFromPopstate = false;
IndexTable.currentSearch = "";

// Add selection mode variables
IndexTable.isSelectionMode = false;
IndexTable.selectedArchives = [];

/**
 * Initialize DataTables.
 */
IndexTable.initializeAll = function () {
    console.log("Initializing DataTables...");
    
    // Bind events to DOM
    $(document).on("click.apply-search", "#apply-search", () => { 
        console.log("Search button clicked");
        IndexTable.currentSearch = $("#search-input").val(); 
        IndexTable.doSearch(); 
    });
    $(document).on("click.clear-search", "#clear-search", () => { IndexTable.currentSearch = ""; IndexTable.doSearch(); });
    $(document).on("keyup.search-input", "#search-input", (e) => {
        if (e.defaultPrevented) {
            return;
        } else if (e.key === "Enter") {
            IndexTable.currentSearch = $("#search-input").val();
            IndexTable.doSearch();
        }
        e.preventDefault();
    });

    // Add selection mode click handler with high specificity
    $(document).on("click.selection", ".selectable", function(e) {
        if (IndexTable.isSelectionMode) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const id = $(this).attr("id");
            IndexTable.handleSelection(id);
            return false;
        }
    });

    // Catch tag div clicks and do a search instead of reloading the page
    $(document).on("click.gt", ".gt", (e) => {
        e.preventDefault();
        IndexTable.currentSearch = $(e.target).attr("search");
        IndexTable.doSearch();
    });

    // Context menu handling for both archives and tankoubons
    $(document).on("contextmenu", ".context-menu", function(e) {
        // Let the jQuery contextMenu plugin handle it
        return true;
    });

    // Clear searchbar cache
    $("#search-input").val("");

    // Classes for even/odd lines
    $.fn.dataTableExt.oStdClasses.sStripeOdd = "gtr0";
    $.fn.dataTableExt.oStdClasses.sStripeEven = "gtr1";

    // set custom columns
    let columns = [];
    columns.push({ data: null, className: "title itd", name: "title", render: IndexTable.renderTitle });
    const columnCount = Index.getColumnCount();
    // set custom columns
    for (let i = 1; i <= columnCount; i++) {
        columns.push({
            data: "tags",
            className: `customheader${i} itd`,
            name: localStorage[`customColumn${i}`] || `defaultCol${i}`,
            render: (data, type) => IndexTable.renderColumn(localStorage[`customColumn${i}`], type, data)
        });
    }
    columns.push({ data: "tags", className: "tags itd", name: "tags", orderable: false, render: IndexTable.renderTags });

    // Datatables configuration
    IndexTable.dataTable = $(".datatables").DataTable({
        serverSide: true,
        processing: true,
        ajax: {
            url: "search",
            cache: true,
            data: function(d) {
                // Add custom parameter based on checkbox state
                const groupTanks = $("#group-tanks").prop("checked");
                d.groupby_tanks = groupTanks ? "true" : "false";
                console.log("DataTables request data with custom params:", d);
                return d;
            }
        },
        deferRender: true,
        lengthChange: false,
        pageLength: Index.pageSize,
        order: [[0, "asc"]],
        dom: "<\"top\"ip>rt<\"bottom\"p><\"clear\">",
        language: {
            info: I18N.IndexPageCount,
            infoEmpty: `<h1><br/><i class="fas fa-4x fa-toilet-paper-slash"></i><br/><br/>
                        ${I18N.IndexNoArcsFound(new LRR.apiURL("/upload"))}</h1><br/>`,
            processing: `<div id="progress" class="indeterminate"><div class="bar-container"><div class="bar" style=" width: 80%; "></div></div></div>`,
        },
        preDrawCallback: IndexTable.initializeThumbView,
        drawCallback: IndexTable.drawCallback,
        rowCallback: IndexTable.buildThumbnailCell,
        columns: columns,
    });

    // Add a listen event to window.popstate to update the search accordingly
    $(window).on("popstate", () => {
        IndexTable.isComingFromPopstate = true;
        IndexTable.consumeURLParameters();
    });

    console.log("DataTables initialized, consuming URL parameters...");
    // If the url has parameters, handle them now by doing the matching search.
    IndexTable.consumeURLParameters();
};

/**
 * Looks at the active filters and performs a search using DataTables' API.
 * (which is hooked back to the internal Search API)
 * If you specify a page argument, the search will load the given page.
 * @param {*} page Page to load
 */
IndexTable.doSearch = function (page) {
    console.log("Performing search:", {
        currentSearch: IndexTable.currentSearch,
        selectedCategory: Index.selectedCategory,
        page: page
    });
    
    // Add the selected category to the tags column so it's picked up by the search engine
    // This allows for the regular search bar to be used in conjunction with categories.
    IndexTable.dataTable.column(".tags.itd").search(Index.selectedCategory);

    // Update search input field
    $("#search-input").val(IndexTable.currentSearch);
    IndexTable.dataTable.search(IndexTable.currentSearch);

    // Add the current search terms to the title tab
    document.title = IndexTable.originalTitle + ((IndexTable.currentSearch !== "") ? ` - ${IndexTable.currentSearch}` : "");

    if (page) {
        // Hack the displayStart value to draw at the page we asked
        // eslint-disable-next-line no-underscore-dangle
        const customDisplayStart = page * IndexTable.dataTable.settings()[0]._iDisplayLength;
        IndexTable.dataTable.settings()[0].iInitDisplayStart = customDisplayStart;
    } else {
        IndexTable.dataTable.settings()[0].iInitDisplayStart = 0;
    }
    IndexTable.dataTable.draw();

    // Re-load categories so the most recently selected/created ones appear first
    Index.loadCategories();

    // Re-load carousel
    Index.updateCarousel();
};

// #region Compact View

/**
 * Generic function for rendering namespace columns.
 * @param {*} namespace The tag namespace to render
 * @param {*} type Whether this is a displayed column (html) or just a data request
 * @param {*} data The tag contents
 * @returns The table HTML, or raw data if type is data
 */
IndexTable.renderColumn = function (namespace, type, data) {
    if (type === "display") {
        if (data === "") return "";

        let namespaceRegEx = namespace;
        if (namespace === "series") namespaceRegEx = "(?:series|parody)";
        const regex = new RegExp(`.*${namespaceRegEx}:\\s?([^,]*),*.*`, "gi"); // Catch last namespace:xxx value in tags
        const match = regex.exec(data);

        if (match != null) {
            let tagText = match[1].replace(/\b./g, (m) => m.toUpperCase());
            // If namespace is a date, consider the contents are a UNIX timestamp
            if (namespace === "date_added" || namespace === "timestamp") {
                const date = new Date(match[1] * 1000);
                tagText = date.toLocaleDateString();
            }

            return `<a style="cursor:pointer" href="${LRR.getTagSearchURL(namespace, match[1])}">
                        ${tagText}
                    </a>`;
        } else return "";
    }
    return data;
};

/**
 * Render the title column.
 * @param {*} data Title
 * @param {*} type Whether this is a displayed column (html) or just a data request
 * @returns The table HTML, or raw title if type is data
 */
IndexTable.renderTitle = function (data, type) {
    if (type === "display") {
        const id = data.arcid || data.id;
        const isTankoubon = id.startsWith('TANK_');
        const title = isTankoubon ? data.name : data.title;
        const url = isTankoubon ? `/tankoubon/${id}` : `/reader?id=${id}`;

        // Don't allow selecting tankoubons
        const isSelectable = !isTankoubon && IndexTable.isSelectionMode;
        
        // Create checkbox for selection mode
        const checkbox = isSelectable ? 
            `<div class="selection-area" style="display: inline-block;">
                <div class="selection-checkbox ${IndexTable.selectedArchives.includes(id) ? 'checked' : ''}" id="checkbox-${id}">
                    <i class="fas fa-check"></i>
                </div>
            </div>` : '';

        // Check if we're in list view mode
        if (localStorage.indexViewMode === "0") {
            const bookmarkIcon = !isTankoubon && !isSelectable ? LRR.buildBookmarkIconElement(id, "title-bookmark-icon") : '';
            const titleLink = isSelectable ? title : `<a href="${url}" style="text-decoration:none; color:inherit;">${title}</a>`;
            const isSelected = IndexTable.selectedArchives.includes(id);
            return `<div id="${id}" class="${isTankoubon ? 'tankobon-item' : 'context-menu'} ${isSelectable ? 'selectable' : ''} ${isSelected ? 'selected' : ''}">
                        <div style="text-align:left; display:block; text-decoration:none; color:inherit;">
                            ${bookmarkIcon}
                            ${checkbox}
                            ${titleLink}
                        </div>
                    </div>`;
        }

        // For thumbnail view, show the full thumbnail and details
        const bookmarkIcon = !isTankoubon ? LRR.buildBookmarkIconElement(id, "thumbnail-bookmark-icon") : '';
        const progressDiv = !isTankoubon ? LRR.buildProgressDiv(data) : '';

        const thumbnailUrl = isTankoubon ? 
            (data.cover_archive ? 
                new LRR.apiURL(`/api/archives/${data.cover_archive}/thumbnail`).toString() : 
                '') : 
            new LRR.apiURL(`/api/archives/${id}/thumbnail`).toString();

        const tankStats = isTankoubon ? 
            `<div class="tank-stats">
                <i class="fas fa-book"></i> ${data.archives ? data.archives.length : 0} Archives
                <i class="fas fa-file ml-2"></i> ${data.pagecount || 0} Pages
            </div>` : '';

        // In selection mode, use a div with onclick handler
        const containerTag = 'div';
        const containerAttrs = isSelectable ?
            `style="text-align:center; position:relative; display:block; text-decoration:none; color:inherit; cursor: pointer;" onclick="event.preventDefault(); event.stopPropagation(); IndexTable.handleSelection('${id}'); return false;"` :
            `style="text-align:center; position:relative; display:block; text-decoration:none; color:inherit;" onclick="window.location.href='${url}'"`;

        return `
            <div id="${id}" class="context-menu ${isTankoubon ? 'tankobon-item' : ''} ${isSelectable ? 'selectable' : ''}">
                <${containerTag} ${containerAttrs}>
                    <div class="id3" ${isTankoubon ? 'style="background: rgba(70, 130, 180, 0.2);"' : ''}>
                        <a href="${url}" title="${title}">
                            <img src="${thumbnailUrl}" title="${title}" />
                        </a>
                        ${bookmarkIcon}
                        ${checkbox}
                    </div>
                    <div class="id4">
                        ${title}
                        ${progressDiv}
                        ${tankStats}
                    </div>
                </${containerTag}>
            </div>`;
    }
    return data.title;
};

/**
 * Render the tags column.
 * @param {*} data Tags
 * @param {*} type Whether this is a displayed column (html) or just a data request
 * @returns The table HTML, or raw tags if type is data
 */
IndexTable.renderTags = function (data, type) {
    if (type === "display") {
        const tags = typeof data === 'object' ? (data.tags || '') : data;
        return `<span class="tag-tooltip" onmouseover="IndexTable.buildTagTooltip(this)" style="text-overflow:ellipsis;">
                    ${LRR.colorCodeTags(tags)}
                </span>
                <div class="caption caption-tags" style="display: none;" >
                    ${LRR.buildTagsDiv(tags)}
                </div>`;
    }
    return typeof data === 'object' ? (data.tags || '') : data;
};

// #endregion

// #region Thumbnail View
// Functions executed on DataTables draw callbacks to build the thumbnail view if it's enabled:

/**
 * Inits the div that contains the thumbnails
 */
IndexTable.initializeThumbView = function () {
    // we only do all this thingamajang if thumbnail view is enabled
    if (localStorage.indexViewMode === "1") {
        // Create a thumbs container if it doesn't exist. put it in the dataTables_scrollbody div
        if ($("#thumbs_container").length < 1) $(".datatables").after("<div id='thumbs_container'></div>");

        // clear out the thumbs container
        $("#thumbs_container").html("");

        $(".list").hide();
    } else {
        // Destroy the thumb container, make the table visible again and ensure autowidth is correct
        $("#thumbs_container").remove();
        $(".list").show();

        // Nuke style of table
        // Datatables' auto-width gets a bit lost when coming back from thumb view.
        $(".datatables").attr("style", "");

        IndexTable.dataTable.columns?.adjust();
    }
};

/**
 * Builds a id1 class div to jam in the thumb container for the given archive data
 * @param {*} row matching DataTables row
 * @param {*} data raw data
 */
IndexTable.buildThumbnailCell = function (row, data) {
    if (localStorage.indexViewMode === "1") {
        // Build a thumb-like div with the data
        $("#thumbs_container").append(LRR.buildThumbnailDiv(data));
    }
};

// #endregion

// #region Pushstate/Popstate URL parameters handling

/**
 * Called after the table is drawn. Updates page selector.
 * (And handles pushing the search parameters to the URL)
 */
IndexTable.drawCallback = function () {
    if (typeof (IndexTable.dataTable) !== "undefined") {
        const pageInfo = IndexTable.dataTable.page.info();
        if (pageInfo.pages === 0) {
            $(".itg").hide();
        } else {
            $(".itg").show();
        }

        // Update url to contain all search parameters, and push it to the history
        if (IndexTable.isComingFromPopstate) {
            // But don't fire this if we're coming from popstate
            IndexTable.isComingFromPopstate = false;
        } else {
            let params = IndexTable.buildURLParameters();
            if (params === "?") params = "/";
            window.history.pushState(null, null, params);
        }

        let currentSort = IndexTable.dataTable.order()[0][0];
        const currentOrder = IndexTable.dataTable.order()[0][1];

        // Save sort/order/page to localStorage
        localStorage.indexSort = currentSort;
        localStorage.indexOrder = currentOrder;

        // Using double equals here since the sort column can be either a string or an int
        // eslint-disable-next-line eqeqeq
        // get current columns count, except title and tags 
        const currentCustomColumnCount = IndexTable.dataTable.columns().count() - 2;
        // check currentSort, if out of range, back to use title
        if (currentSort > currentCustomColumnCount) {
            localStorage.indexSort = 0;
        }
        if (currentSort >= 1 && currentSort <= columnCount.value) {
            currentSort = localStorage[`customColumn${currentSort}`] || `Header ${currentSort}`;
        } else {
            currentSort = "title";
        }

        Index.updateTableControls(currentSort, currentOrder, pageInfo.pages, pageInfo.page + 1);

        // Clear potential leftover tooltips
        tippy.hideAll();
    }
};

IndexTable.buildURLParameters = function () {
    const cat = IndexTable.dataTable.column(".tags.itd").search();
    const page = IndexTable.dataTable.page.info().page + 1;
    const sortby = IndexTable.dataTable.order()[0][0];
    const sortorder = IndexTable.dataTable.order()[0][1];

    const encodedSearch = encodeURIComponent(IndexTable.dataTable.search());

    // Check each parameter and append them to the URL if they exist
    let params = "?";
    if (page !== 1) params += `p=${page}&`;
    if (sortby !== 0) params += `sort=${sortby}&`;
    if (sortorder !== "asc") params += `sortdir=${sortorder}&`;
    if (encodedSearch !== "") params += `q=${encodedSearch}&`;
    if (cat !== "") params += `c=${cat}&`;

    return params;
};

IndexTable.consumeURLParameters = function () {
    const params = new URLSearchParams(window.location.search);

    if (params.has("c")) Index.selectedCategory = params.get("c");
    else Index.selectedCategory = "";

    if (params.has("q")) { IndexTable.currentSearch = decodeURIComponent(params.get("q")); }

    // Get order from URL, fallback to localstorage if available
    const order = [[0, "asc"]];

    if (params.has("sort")) {
        order[0][0] = params.get("sort");
    } else if (localStorage.indexSort) {
        order[0][0] = localStorage.indexSort;
    }
    // get current columns count, except title and tags 
    const currentCustomColumnCount = IndexTable.dataTable.columns().count() - 2;
    // check currentSort, if out of range, back to use title
    if (localStorage.indexSort > currentCustomColumnCount) {
        localStorage.indexSort = 0;
        order[0][0] = localStorage.indexSort;
    }

    if (params.has("sortdir")) {
        order[0][1] = params.get("sortdir");
    } else if (localStorage.indexOrder) {
        order[0][1] = localStorage.indexOrder;
    }

    IndexTable.dataTable.order(order);

    if (params.has("p")) {
        IndexTable.doSearch(params.get("p") - 1);
    } else {
        IndexTable.doSearch();
    }
};

// #endregion

/**
 * Build a tooltip when hovering over an archive title, then display it.
 * The tooltip is saved in DOM for further uses.
 * @param {*} target The target archive title
 * @returns
 */
IndexTable.buildImageTooltip = function (target) {
    if (target.innerHTML === "") return;

    tippy(target, {
        content: $(target).next("div").clone().attr("style", "height:300px;")[0],
        delay: 0,
        animation: false,
        maxWidth: "none",
        followCursor: true,
    }).show(); // Call show() so that the tooltip shows now

    $(target).attr("onmouseover", ""); // Don't trigger this function again for this element
};

/**
 * Build a tooltip when hovering over a tag div, then display it.
 * @param {*} target The target tags div
 */
IndexTable.buildTagTooltip = function (target) {
    tippy(target, {
        content: $(target).next("div").attr("style", "")[0],
        delay: 0,
        placement: "auto-start",
        maxWidth: "none",
        interactive: true,
        // Have to be outside so that it is not hidden by other elements.
        appendTo: document.body,
    }).show(); // Call show() so that the tooltip shows now

    $(target).attr("onmouseover", "");
};

/**
 * Toggle selection mode on/off
 */
IndexTable.toggleSelectionMode = function() {
    // Don't allow enabling selection mode in thumbnail view
    if (localStorage.indexViewMode === "1") {
        return;
    }

    IndexTable.isSelectionMode = !IndexTable.isSelectionMode;
    
    // Update button appearance
    const button = $("#selection-mode");
    button.toggleClass("active", IndexTable.isSelectionMode);
    
    // Show/hide selection toolbar
    $("#selection-toolbar").toggle(IndexTable.isSelectionMode);
    
    // Clear selected archives when turning off selection mode
    if (!IndexTable.isSelectionMode) {
        IndexTable.selectedArchives = [];
        $(".selectable").removeClass("selected");
        $(".selection-checkbox").removeClass("checked");
    }
    
    // Force a redraw of the table to update the thumbnails
    IndexTable.dataTable.draw(false);
};

/**
 * Handle selection of an archive
 */
IndexTable.handleSelection = function(id) {
    if (!IndexTable.isSelectionMode) return;
    
    const index = IndexTable.selectedArchives.indexOf(id);
    const element = $(`#${id}`);
    const checkbox = $(`#checkbox-${id}`);
    
    if (index === -1) {
        // Add to selection
        IndexTable.selectedArchives.push(id);
        element.addClass("selected");
        checkbox.addClass("checked");
    } else {
        // Remove from selection
        IndexTable.selectedArchives.splice(index, 1);
        element.removeClass("selected");
        checkbox.removeClass("checked");
    }
    
    // Update selected count
    $("#selected-count").text(IndexTable.selectedArchives.length);
    
    // Enable/disable action buttons
    const hasSelection = IndexTable.selectedArchives.length > 0;
    $("#add-to-tankoubon").prop("disabled", !hasSelection);
    $("#delete-selected").prop("disabled", !hasSelection);
};

/**
 * Add selected archives to tankoubon
 */
IndexTable.addSelectedToTankoubon = function() {
    if (IndexTable.selectedArchives.length === 0) return;

    // Get list of existing tankoubons
    Server.callAPI(
        "api/tankoubons",
        "GET",
        null,
        "Error loading tankoubons",
        function(tankoubons) {
            let options = '<option value="new">Create New Tankoubon</option>';
            options += '<option disabled>──────────</option>';
            tankoubons.forEach(tank => {
                options += `<option value="${tank.id}">${tank.name}</option>`;
            });

            LRR.showPopUp({
                title: "Add to Tankoubon",
                html: `<div>
                        <p>Select a tankoubon or create a new one:</p>
                        <select id="tankoubon-select" class="favtag-btn" style="width: 100%; margin-bottom: 10px;">
                            ${options}
                        </select>
                        <div id="new-tankoubon-name">
                            <input type="text" id="new-name" class="favtag-btn" placeholder="Enter new tankoubon name" style="width: 100%;">
                        </div>
                    </div>`,
                showCancelButton: true,
                confirmButtonText: "Add",
                didOpen: () => {
                    // Show/hide new tankoubon name input based on selection
                    $("#tankoubon-select").on("change", function() {
                        $("#new-tankoubon-name").toggle($(this).val() === "new");
                    });
                    // Show input field immediately if Create New Tankoubon is selected
                    $("#new-tankoubon-name").toggle($("#tankoubon-select").val() === "new");
                },
                preConfirm: () => {
                    const selectedValue = $("#tankoubon-select").val();
                    if (selectedValue === "new") {
                        const newName = $("#new-name").val()?.trim();
                        if (!newName) {
                            Swal.showValidationMessage("Please enter a name for the new tankoubon");
                            return false;
                        }
                        return { isNew: true, name: newName };
                    }
                    return { isNew: false, tankId: selectedValue };
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    if (result.value.isNew) {
                        // Create new tankoubon first using jQuery ajax directly
                        $.ajax({
                            url: "api/tankoubons",
                            type: "PUT",
                            data: { name: result.value.name },
                            success: function(response) {
                                if (response.success) {
                                    IndexTable.addArchivesToTankoubon(response.tankoubon_id);
                                } else {
                                    LRR.showErrorToast("Error creating tankoubon: " + response.error);
                                }
                            },
                            error: function(xhr, status, error) {
                                LRR.showErrorToast("Error creating tankoubon: " + error);
                            }
                        });
                    } else {
                        IndexTable.addArchivesToTankoubon(result.value.tankId);
                    }
                }
            });
        }
    );
};

/**
 * Add archives to specified tankoubon
 */
IndexTable.addArchivesToTankoubon = function(tankId) {
    let promises = IndexTable.selectedArchives.map(archiveId => {
        return $.ajax({
            url: `api/tankoubons/${tankId}/archives/${archiveId}`,
            type: "PUT"
        });
    });

    // After all archives are added, set the first one as cover
    Promise.all(promises).then(() => {
        // Set the first archive as cover
        $.ajax({
            url: `api/tankoubons/${tankId}`,
            type: "PUT",
            contentType: "application/json",
            data: JSON.stringify({
                cover_archive: IndexTable.selectedArchives[0]
            }),
            success: function() {
                LRR.toast({
                    heading: "Success!",
                    text: `Added ${IndexTable.selectedArchives.length} archives to tankoubon`,
                    icon: "success"
                });
                IndexTable.toggleSelectionMode();
                IndexTable.dataTable.draw();
            }
        });
    }).catch(error => {
        LRR.showErrorToast("Error adding archives to tankoubon: " + error);
    });
};

/**
 * Delete selected archives
 */
IndexTable.deleteSelected = function() {
    if (IndexTable.selectedArchives.length === 0) return;

    LRR.showPopUp({
        title: "Delete Archives",
        text: `Are you sure you want to delete ${IndexTable.selectedArchives.length} selected archives?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Delete",
        confirmButtonColor: "#dc3545"
    }).then((result) => {
        if (result.isConfirmed) {
            let promises = IndexTable.selectedArchives.map(archiveId => {
                return $.ajax({
                    url: `api/archives/${archiveId}`,
                    type: "DELETE"
                });
            });

            Promise.all(promises).then(() => {
                LRR.toast({
                    heading: "Success!",
                    text: `Deleted ${IndexTable.selectedArchives.length} archives`,
                    icon: "success"
                });
                IndexTable.toggleSelectionMode();
                IndexTable.dataTable.draw();
            }).catch(error => {
                LRR.showErrorToast("Error deleting archives: " + error);
            });
        }
    });
};
