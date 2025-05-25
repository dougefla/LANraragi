/**
 * Category Grid View Operations
 */
const CategoryGrid = {};

CategoryGrid.initializeAll = function () {
    // Bind events to DOM
    $(document).on("change", "#show-pinned-only", CategoryGrid.filterCategories);
    $(document).on("change", "#show-static-only", CategoryGrid.filterCategories);

    // Load categories on page load
    CategoryGrid.loadCategories();
};

/**
 * Build a category thumbnail div
 * @param {*} category The category data
 * @returns HTML component string
 */
CategoryGrid.buildCategoryDiv = function (category) {
    const isPinned = category.pinned === "1";
    const isStatic = category.search === "";
    const archiveCount = category.archives ? category.archives.length : 0;
    
    // Get first archive thumbnail for static categories
    let thumbnailUrl = new LRR.apiURL("/img/noThumb.png");
    if (isStatic && archiveCount > 0) {
        thumbnailUrl = new LRR.apiURL(`/api/archives/${category.archives[0]}/thumbnail`);
    }

    return `<div class="id1 category-item ${isPinned ? 'pinned' : ''} ${isStatic ? 'static' : 'dynamic'}" 
                 id="${category.id}" onclick="window.location.href='/?c=${category.id}'">
                <div class="id2">
                    ${isPinned ? '<i class="fas fa-thumbtack"></i> ' : ''}
                    ${isStatic ? '<i class="fas fa-folder-open"></i> ' : '<i class="fas fa-bolt"></i> '}
                    <span class="category-name">${LRR.encodeHTML(category.name)}</span>
                </div>
                <div class="id3">
                    <img src="${thumbnailUrl}" 
                         onerror="this.src='${new LRR.apiURL("/img/noThumb.png")}'" />
                </div>
                <div class="id4">
                    ${isStatic ? 
                        `<span class="category-info">${archiveCount} archives</span>` : 
                        `<span class="category-info">Search: ${category.search}</span>`}
                </div>
            </div>`;
};

/**
 * Load and display all categories
 */
CategoryGrid.loadCategories = function () {
    Server.callAPI("/api/categories", "GET", null, I18N.CategoryFetchError,
        (data) => {
            // Sort by pinned + alpha
            data.sort((b, a) => b.name.localeCompare(a.name));
            data.sort((a, b) => b.pinned - a.pinned);

            let html = '';
            data.forEach(category => {
                html += CategoryGrid.buildCategoryDiv(category);
            });

            $("#category_grid_container").html(html);
            CategoryGrid.filterCategories(); // Apply current filters
        }
    );
};

/**
 * Filter categories based on checkboxes
 */
CategoryGrid.filterCategories = function () {
    const showPinnedOnly = $("#show-pinned-only").prop("checked");
    const showStaticOnly = $("#show-static-only").prop("checked");

    $(".category-item").each(function() {
        const isPinned = $(this).hasClass("pinned");
        const isStatic = $(this).hasClass("static");
        
        if ((showPinnedOnly && !isPinned) || (showStaticOnly && !isStatic)) {
            $(this).hide();
        } else {
            $(this).show();
        }
    });
};

// Initialize on page load
jQuery(() => {
    CategoryGrid.initializeAll();
}); 