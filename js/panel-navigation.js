(function () {
    "use strict";

    function toArray(list) {
        return Array.prototype.slice.call(list || []);
    }

    function getPanelIdFromHash() {
        return window.location.hash.replace(/^#/, "").trim();
    }

    document.addEventListener("DOMContentLoaded", function () {
        var panelRoot = document.querySelector("[data-panel-root]");
        var navLinks = toArray(document.querySelectorAll("[data-nav-target]"));

        if (!panelRoot) {
            return;
        }

        var panels = toArray(panelRoot.querySelectorAll("[data-page-panel]"));
        var defaultPanel = panelRoot.getAttribute("data-default-panel") || "Home";
        var validPanels = panels.map(function (panel) {
            return panel.getAttribute("data-page-panel");
        });
        var homeAnchors = {};

        toArray(panelRoot.querySelectorAll("[data-home-anchor-target]")).forEach(function (section) {
            var anchorId = section.getAttribute("data-home-anchor-target");
            if (anchorId) {
                homeAnchors[anchorId] = section;
            }
        });

        function isValidPanel(panelId) {
            return validPanels.indexOf(panelId) !== -1;
        }

        function isHomeAnchor(anchorId) {
            return Object.prototype.hasOwnProperty.call(homeAnchors, anchorId);
        }

        function updateNav(panelId) {
            navLinks.forEach(function (link) {
                var isActive = link.getAttribute("data-nav-target") === panelId;
                link.classList.toggle("active", isActive);
                if (isActive) {
                    link.setAttribute("aria-current", "page");
                } else {
                    link.removeAttribute("aria-current");
                }
            });
        }

        function showPanel(panelId, options) {
            var resolvedPanelId = isValidPanel(panelId) ? panelId : defaultPanel;
            var anchorId = options && options.anchorId;
            var initialLoad = options && options.initial;

            panels.forEach(function (panel) {
                var isActive = panel.getAttribute("data-page-panel") === resolvedPanelId;
                panel.hidden = !isActive;
                panel.classList.toggle("is-active", isActive);
            });

            updateNav(resolvedPanelId);
            panelRoot.setAttribute("data-active-panel", resolvedPanelId);

            if (anchorId && homeAnchors[anchorId]) {
                window.requestAnimationFrame(function () {
                    homeAnchors[anchorId].scrollIntoView({
                        behavior: initialLoad ? "auto" : "smooth",
                        block: "start"
                    });
                });
                return;
            }

            if (!initialLoad) {
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        }

        function activateFromHash(options) {
            var panelId = getPanelIdFromHash();

            if (isValidPanel(panelId)) {
                showPanel(panelId, options);
                return;
            }

            if (isHomeAnchor(panelId)) {
                showPanel(defaultPanel, {
                    anchorId: panelId,
                    initial: options && options.initial
                });
                return;
            }

            showPanel(defaultPanel, options);
        }

        document.addEventListener("click", function (event) {
            var link = event.target.closest("[data-nav-target], [data-panel-link], [data-home-anchor]");
            var target;

            if (!link) {
                return;
            }

            if (link.hasAttribute("data-home-anchor")) {
                target = link.getAttribute("data-home-anchor") || "";

                if (!isHomeAnchor(target)) {
                    return;
                }

                event.preventDefault();

                if (getPanelIdFromHash() === target) {
                    showPanel(defaultPanel, { anchorId: target });
                    return;
                }

                window.location.hash = target;
                return;
            }

            target =
                link.getAttribute("data-panel-link") ||
                link.getAttribute("data-nav-target") ||
                "";

            if (!isValidPanel(target)) {
                return;
            }

            event.preventDefault();

            if (getPanelIdFromHash() === target) {
                showPanel(target);
                return;
            }

            window.location.hash = target;
        });

        window.addEventListener("hashchange", function () {
            activateFromHash();
        });

        activateFromHash({ initial: true });
    });
})();
