(function () {
    var filterRoot = document.querySelector("[data-blog-filters]");
    var postList = document.querySelector("[data-blog-post-list]");

    if (!filterRoot || !postList) {
        return;
    }

    var posts = Array.prototype.slice.call(
        postList.querySelectorAll(".news-card[data-post-type]")
    );
    var toolbar = filterRoot.querySelector(".blog-filter-toolbar");
    var status = filterRoot.querySelector(".blog-filter-status");
    var preferredOrder = ["papers", "awards", "funding", "news"];
    var counts = {};
    var labels = {};
    var activeFilter = "all";

    if (!posts.length || !toolbar || !status) {
        return;
    }

    posts.forEach(function (post) {
        var type = post.getAttribute("data-post-type") || "news";
        var label = post.getAttribute("data-post-type-label") || "Updates";

        counts[type] = (counts[type] || 0) + 1;
        labels[type] = labels[type] || label;
    });

    function getFilterTypes() {
        var orderedTypes = [];

        preferredOrder.forEach(function (type) {
            if (counts[type]) {
                orderedTypes.push(type);
            }
        });

        Object.keys(counts).forEach(function (type) {
            if (orderedTypes.indexOf(type) === -1) {
                orderedTypes.push(type);
            }
        });

        return orderedTypes;
    }

    function createButton(type, label, count) {
        var button = document.createElement("button");
        var labelSpan = document.createElement("span");
        var countSpan = document.createElement("span");

        button.type = "button";
        button.className = "blog-filter-button";
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("data-filter-type", type);

        labelSpan.className = "blog-filter-button__label";
        labelSpan.textContent = label;

        countSpan.className = "blog-filter-button__count";
        countSpan.textContent = count;

        button.appendChild(labelSpan);
        button.appendChild(countSpan);

        return button;
    }

    function getVisibleCount() {
        return posts.reduce(function (count, post) {
            return count + (post.hidden ? 0 : 1);
        }, 0);
    }

    function updateStatus(activeType) {
        var visibleCount = getVisibleCount();
        var noun = visibleCount === 1 ? "post" : "posts";

        if (activeType === "all") {
            status.textContent = "Showing all " + visibleCount + " " + noun + ".";
            return;
        }

        status.textContent =
            "Showing " +
            visibleCount +
            " " +
            (labels[activeType] || "filtered").toLowerCase() +
            " " +
            noun +
            ".";
    }

    function applyFilter(activeType) {
        activeFilter = activeType;

        posts.forEach(function (post) {
            var matches =
                activeType === "all" ||
                (post.getAttribute("data-post-type") || "news") === activeType;

            post.hidden = !matches;
        });

        Array.prototype.slice
            .call(toolbar.querySelectorAll(".blog-filter-button"))
            .forEach(function (button) {
                button.setAttribute(
                    "aria-pressed",
                    button.getAttribute("data-filter-type") === activeType ? "true" : "false"
                );
            });

        updateStatus(activeType);
    }

    function renderButtons() {
        var filterTypes = getFilterTypes();

        toolbar.innerHTML = "";
        toolbar.appendChild(createButton("all", "All posts", posts.length));

        filterTypes.forEach(function (type) {
            toolbar.appendChild(
                createButton(type, labels[type] || type, counts[type])
            );
        });
    }

    toolbar.addEventListener("click", function (event) {
        var button = event.target.closest(".blog-filter-button");

        if (!button) {
            return;
        }

        var selectedFilter = button.getAttribute("data-filter-type") || "all";

        if (selectedFilter === activeFilter && selectedFilter !== "all") {
            applyFilter("all");
            return;
        }

        applyFilter(selectedFilter);
    });

    renderButtons();
    applyFilter("all");
})();
