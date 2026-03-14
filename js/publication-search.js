(function () {
    "use strict";

    function normalizeText(value) {
        return String(value || "")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function pluralize(count, noun) {
        return count === 1 ? noun : noun + "s";
    }

    function initializePublicationSearch(container) {
        var input = container.querySelector("[data-search-input]");
        var results = container.querySelector("[data-search-results]");
        var status = container.querySelector("[data-search-status]");
        var empty = container.querySelector("[data-search-empty]");
        var activeTagsHost = container.querySelector("[data-search-active-tags]");
        var tagButtons = Array.prototype.slice.call(container.querySelectorAll("[data-search-tag]"));
        var entries = Array.prototype.slice.call(container.querySelectorAll("[data-publication-entry]"));
        var maxResultsValue = parseInt(container.getAttribute("data-max-results") || "", 10);
        var maxResults = Number.isFinite(maxResultsValue) && maxResultsValue > 0 ? maxResultsValue : null;
        var selectedTags = [];

        if (!input || !entries.length) {
            return;
        }

        function updateVisibleClasses(visibleEntries) {
            entries.forEach(function (entry) {
                entry.classList.remove("is-first-visible", "is-last-visible");
            });
            if (!visibleEntries.length) {
                return;
            }
            visibleEntries[0].classList.add("is-first-visible");
            visibleEntries[visibleEntries.length - 1].classList.add("is-last-visible");
        }

        function updateDateLabels(visibleEntries) {
            var visibleSet = new Set(visibleEntries);
            var previousYear = "";
            var previousMonthKey = "";

            entries.forEach(function (entry) {
                var yearNode = entry.querySelector("[data-date-year]");
                var monthNode = entry.querySelector("[data-date-month]");
                var year = entry.getAttribute("data-year-value") || "";
                var month = entry.getAttribute("data-month-value") || "";

                if (!yearNode || !monthNode) {
                    return;
                }

                if (!visibleSet.has(entry)) {
                    yearNode.textContent = "";
                    yearNode.hidden = true;
                    monthNode.textContent = "";
                    monthNode.hidden = true;
                    return;
                }

                var monthKey = year + "::" + month;
                var showYear = Boolean(year) && year !== previousYear;
                var showMonth = Boolean(month) && monthKey !== previousMonthKey;

                yearNode.textContent = showYear ? year : "";
                yearNode.hidden = !showYear;
                monthNode.textContent = showMonth ? month : "";
                monthNode.hidden = !showMonth;

                if (year) {
                    previousYear = year;
                }
                if (month) {
                    previousMonthKey = monthKey;
                }
            });
        }

        function renderActiveTags() {
            if (!activeTagsHost) {
                return;
            }

            while (activeTagsHost.firstChild) {
                activeTagsHost.removeChild(activeTagsHost.firstChild);
            }
            selectedTags.forEach(function (tag) {
                var chip = document.createElement("button");
                chip.type = "button";
                chip.className = "publication-search-chip";
                chip.setAttribute("data-active-tag", tag);
                chip.setAttribute("aria-label", "Remove " + tag + " filter");
                chip.innerHTML =
                    '<span class="publication-search-chip-label"></span>' +
                    '<span class="publication-search-chip-remove" aria-hidden="true">&times;</span>';
                chip.querySelector(".publication-search-chip-label").textContent = tag;
                chip.addEventListener("click", function () {
                    selectedTags = selectedTags.filter(function (value) {
                        return value !== tag;
                    });
                    syncTagButtons();
                    renderActiveTags();
                    applySearch();
                    input.focus();
                });
                activeTagsHost.appendChild(chip);
            });
        }

        function syncTagButtons() {
            var activeTagSet = new Set(selectedTags.map(normalizeText));
            tagButtons.forEach(function (button) {
                var tag = button.getAttribute("data-search-tag") || "";
                var isActive = activeTagSet.has(normalizeText(tag));
                button.setAttribute("aria-pressed", isActive ? "true" : "false");
            });
        }

        function matchesEntry(entry, terms) {
            var searchText = entry.getAttribute("data-search-text") || "";
            return terms.every(function (term) {
                return searchText.indexOf(term) !== -1;
            });
        }

        function matchesTopics(entry, topicTerms) {
            if (!topicTerms.length) {
                return true;
            }

            var topics = (entry.getAttribute("data-search-topics") || "")
                .split("|")
                .map(normalizeText)
                .filter(Boolean);
            return topicTerms.every(function (term) {
                return topics.indexOf(term) !== -1;
            });
        }

        function statusMessage(visibleCount, matchingCount, hasFilters) {
            if (matchingCount === 0) {
                return "No matching papers.";
            }

            if (maxResults && matchingCount > maxResults) {
                if (hasFilters) {
                    return (
                        "Showing " +
                        visibleCount +
                        " of " +
                        matchingCount +
                        " matching " +
                        pluralize(matchingCount, "paper") +
                        "."
                    );
                }
                return (
                    "Showing " +
                    visibleCount +
                    " of " +
                    matchingCount +
                    " " +
                    pluralize(matchingCount, "paper") +
                    "."
                );
            }

            if (hasFilters) {
                return "Showing " + visibleCount + " matching " + pluralize(visibleCount, "paper") + ".";
            }
            return "Showing " + visibleCount + " " + pluralize(visibleCount, "paper") + ".";
        }

        function applySearch() {
            var queryTerms = normalizeText(input.value)
                .split(" ")
                .filter(Boolean);
            var tagTerms = selectedTags
                .map(normalizeText)
                .filter(Boolean);
            var matchingEntries = [];
            var visibleEntries = [];
            var hasFilters = queryTerms.length > 0 || tagTerms.length > 0;

            entries.forEach(function (entry) {
                if (matchesEntry(entry, queryTerms) && matchesTopics(entry, tagTerms)) {
                    matchingEntries.push(entry);
                }
            });

            entries.forEach(function (entry) {
                entry.hidden = true;
            });

            matchingEntries.forEach(function (entry, index) {
                if (!maxResults || index < maxResults) {
                    entry.hidden = false;
                    visibleEntries.push(entry);
                }
            });

            updateVisibleClasses(visibleEntries);
            updateDateLabels(visibleEntries);

            if (results) {
                results.hidden = matchingEntries.length === 0;
            }
            if (empty) {
                empty.hidden = matchingEntries.length !== 0;
            }
            if (status) {
                status.textContent = statusMessage(visibleEntries.length, matchingEntries.length, hasFilters);
            }
        }

        tagButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                var tag = button.getAttribute("data-search-tag") || "";
                var normalizedTag = normalizeText(tag);
                var alreadySelected = selectedTags.some(function (value) {
                    return normalizeText(value) === normalizedTag;
                });

                if (alreadySelected) {
                    selectedTags = selectedTags.filter(function (value) {
                        return normalizeText(value) !== normalizedTag;
                    });
                } else {
                    selectedTags = selectedTags.concat([tag]);
                }

                syncTagButtons();
                renderActiveTags();
                applySearch();
                input.focus();
            });
        });

        input.addEventListener("input", applySearch);
        input.addEventListener("keydown", function (event) {
            if (event.key === "Backspace" && !input.value && selectedTags.length) {
                selectedTags = selectedTags.slice(0, -1);
                syncTagButtons();
                renderActiveTags();
                applySearch();
            }
        });

        syncTagButtons();
        renderActiveTags();
        applySearch();
    }

    document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice
            .call(document.querySelectorAll("[data-publication-search]"))
            .forEach(initializePublicationSearch);
    });
})();
