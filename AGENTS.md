# AGENTS.md

## Repository Structure

- This repo is a small Jekyll-based research group website with a light custom Python build pipeline for publications and local site generation.

### Primary source files

- Top-level `.html` and `.md` files such as `index.html`, `people.html`, `publications.html`, `research.html`, `blog.html`, and `404.md` are the main page entry points.
- `_config.yml` holds site-wide configuration such as site metadata, navigation, role groupings, and front-page publication limits.
- `_data/people.yml` is the structured source of truth for people and roles.
- `_posts/` contains dated news posts and blog posts.
- `bib/pubs.bib` is the source of truth for publications.

### Shared templates and presentation

- `_layouts/` contains the page skeletons used by Jekyll pages and posts.
- `_includes/` contains reusable partials used across pages.
- `css/` contains the SCSS source for site styling.
- `js/` contains browser-side JavaScript such as the publication search behavior.
- `img/` contains static images and profile photos.

### Build and generation

- `scripts/` contains the Python scripts that generate publication-related includes and can also build the site locally.
- `Makefile` is the main entry point for local build tasks.
- `requirements-build.txt` lists Python packages needed for the custom build pipeline.
- `.codex_vendor/` is a local vendored dependency directory used by the Python build scripts when packages are installed there.

### Generated artifacts

- `_includes/front-page-papers.html`, `_includes/pubs.html`, `_includes/publication-count.html`, and `_includes/publication-search-tags.html` are generated files.
- `_site/` is the fully built output site and should be treated as generated build output.
- Do not hand-edit generated publication includes or `_site`; change the source data or generator instead, then rerender.

### Other directories

- `meetings/` stores meeting-related material and is separate from the main public site structure unless explicitly wired into pages later.
- `.git/` is the repository metadata directory and should be ignored for content work.

### Editing logic

- If the change is about page copy or layout, start with the top-level page, `_layouts/`, or reusable `_includes/`.
- If the change is about people, edit `_data/people.yml`.
- If the change is about publications, edit `bib/pubs.bib` and rerun the publication generators.
- If the change is about styling or interactivity, edit `css/` or `js/`.
- If a visible publication artifact looks wrong, fix the source or generator instead of patching the generated HTML directly.

## Publication BibTeX and Tags

- The source of truth for publications is `bib/pubs.bib`.
- The rendered publication HTML is generated from that BibTeX by `scripts/render_front_page_papers.py` and `scripts/render_publications_include.py`.
- Generated publication artifacts live in `_includes/front-page-papers.html`, `_includes/pubs.html`, `_includes/publication-count.html`, and `_includes/publication-search-tags.html`.

### Search behavior

- The text search is full-text search over normalized publication metadata.
- The search index includes the BibTeX key, entry type, title, author list, venue fields, `keywords`, `topics`, `site_tags`, `note`, `abstract`, year, and month.
- This means typing into the search box can match either standard BibTeX metadata or curated topic tags.

### Curated topic tags

- The clickable publication tags are driven by a custom BibTeX field named `topics`.
- `site_tags` is also accepted as an alias, but `topics` is the preferred field to use going forward.
- `topics` is a manual, site-specific field. ADS/ADSabs BibTeX exports do not add it by default, so it must be added by hand to entries that should participate in the curated topic filters.
- Topic values are split on commas, semicolons, or pipes.
- Example:

```bibtex
topics = {population III, red giant, asteroseismology}
```

- Topic matching is exact on normalized topic membership, not loose substring matching.
- The search box and the topic buttons are intentionally different:
  - The search box does free-text matching.
  - The topic buttons filter on explicit curated topic membership.

### Auto-generated tag row

- The visible tag buttons are auto-generated from the `topics`/`site_tags` values present in `bib/pubs.bib`.
- There is no hardcoded tag list in the page template.
- The generated tag include is `_includes/publication-search-tags.html`.
- Tags are only shown if more than one paper has that topic.
- Tags are sorted by paper count descending, with alphabetical tie-breaking.
- Each tag shows a small superscript count equal to the number of papers carrying that topic.

### When updating publications

- If a paper should appear under a topic button, add that topic to the paper's `topics` field in `bib/pubs.bib`.
- If a topic should disappear from the button row, remove it until at most one paper still carries it.
- After editing `bib/pubs.bib`, rerun the publication render step so the generated includes stay in sync.
- The simplest refresh commands are:

```powershell
& 'C:\Program Files\Python311\python.exe' scripts\render_front_page_papers.py
& 'C:\Program Files\Python311\python.exe' scripts\render_publications_include.py
```
