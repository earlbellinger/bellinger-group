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

- `_includes/front-page-papers.html`, `_includes/pubs.html`, `_includes/publication-count.html`, `_includes/publication-search-tags.html`, and `_data/publication-topics.yml` are generated files.
- `_site/` is the fully built output site and should be treated as generated build output.
- Do not hand-edit generated publication includes, `_data/publication-topics.yml`, or `_site`; change the source data or generator instead, then rerender.

### Other directories

- `meetings/` stores meeting-related material and is separate from the main public site structure unless explicitly wired into pages later.
- `.git/` is the repository metadata directory and should be ignored for content work.

### Editing logic

- If the change is about page copy or layout, start with the top-level page, `_layouts/`, or reusable `_includes/`.
- If the change is about people, edit `_data/people.yml`.
- If the change is about publications, edit `bib/pubs.bib` and rerun the publication generators.
- If the change is about styling or interactivity, edit `css/` or `js/`.
- If a visible publication artifact looks wrong, fix the source or generator instead of patching the generated HTML directly.

## Push and Deploy

- After every completed change, including content, styling, code, and documentation, commit, push, and deploy the site unless the user explicitly asks otherwise. Deployment is part of completing the task; no additional confirmation is needed.
- The published branch is `master` on `origin` (`https://github.com/earlbellinger/bellinger-group.git`). Pushing to GitHub alone does not deploy the site.
- The live site is `https://www.astro.yale.edu/bellinger/`.

### Validate and push

1. Review `git status --short` and the diff. Preserve unrelated work and stage only files belonging to the change.
2. Run `git diff --check` and checks appropriate to the change. For site changes, build locally with the command below and inspect the affected pages; check desktop and mobile layouts for visual changes. The local builder recreates this repository's generated `_site/` directory.

   ```powershell
   & 'C:\Program Files\Python311\python.exe' scripts\build_site.py
   ```

3. Regenerate publication artifacts when required by the publication instructions below. Include relevant tracked generated changes in the commit; never stage `_site/`.
4. After staging the intended files, commit with a descriptive message and push to `origin master`. Stop and resolve any failed check or Git command before deploying.

   ```powershell
   git commit -m "Describe the change"
   git push origin master
   ```

### Deploy through the Yale server

- SSH host: `voltron.stdusr.yale.internal`, user `epb37`.
- Server checkout: `/home/epb37/bellinger/bellinger-group`.
- Deployment script: `/home/epb37/bellinger/sync.sh`. Run it from `/home/epb37/bellinger` because it uses relative paths.
- Before deployment, check that the server checkout is on `master` with no uncommitted changes. Preserve any unexpected server work and resolve it before continuing.
- The Windows SSH executable is `C:\Program Files\Git\usr\bin\ssh.exe`. Use `-o RemoteCommand=none` to override the saved interactive SSH command, `-x` to disable X11 forwarding, and batch mode to avoid hanging on password prompts.

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' -x -o BatchMode=yes -o ConnectTimeout=15 -o RemoteCommand=none epb37@voltron.stdusr.yale.internal 'git -C /home/epb37/bellinger/bellinger-group status --short; git -C /home/epb37/bellinger/bellinger-group branch --show-current'
```

After confirming the checkout is clean and on `master`, deploy:

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' -x -o BatchMode=yes -o ConnectTimeout=15 -o RemoteCommand=none epb37@voltron.stdusr.yale.internal 'cd /home/epb37/bellinger && bash -e sync.sh'
```

- The script pulls the repository, builds with `make`/Jekyll, commits and pushes any resulting tracked changes, and syncs the built site to `new-astro-web.stdusr.yale.internal:/var/www/html/bellinger`. `bash -e` stops the deployment if a command fails.
- Use this script for deployment. The local `make deploy` target still has placeholder host/path settings, and the local Python preview build does not include all the separate `meetings/` and `apps/` assets that the server's Jekyll build deploys.
- Wait for the script to finish successfully, then verify the affected live pages and assets. For documentation-only changes, confirm the server checkout has the commit and the live site responds successfully.
- If the script creates and pushes a new commit, fetch and fast-forward the local checkout after confirming it is clean.
- If SSH or deployment is unavailable, report the specific blocker and whether the changes were pushed. Yale network/VPN access may be required; do not claim deployment succeeded without verification.

## Publication BibTeX and Tags

- The source of truth for publications is `bib/pubs.bib`.
- The rendered publication HTML is generated from that BibTeX by `scripts/render_front_page_papers.py` and `scripts/render_publications_include.py`.
- Generated publication artifacts live in `_includes/front-page-papers.html`, `_includes/pubs.html`, `_includes/publication-count.html`, and `_includes/publication-search-tags.html`.

### Search behavior

- The text search is full-text search over normalized publication metadata.
- The search index includes the BibTeX key, entry type, title, author list, venue fields, `keywords`, `topics`, `site_tags`, `note`, `abstract`, year, and month.
- This means typing into the search box can match either standard BibTeX metadata or curated topic tags.
- Link to a filtered publication list with `{{ site.base }}/publications.html?tag=population%20III`, using a URL-encoded topic from `_data/publication-topics.yml`. Research links should use ordinary anchors so opening in a new tab also works.
- An explicit `tag` or `q` URL parameter replaces the saved search. Repeated `tag` parameters require all selected topics; `q` supplies optional free text. Search controls keep these parameters in sync while preserving the page hash and unrelated parameters.

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
- The generated agent-readable tag list is `_data/publication-topics.yml`. It is automatically populated from the bibtex file. This list should be drawn from when generating topic fields for new bibtex entries. Topics that are not in this list can be added to bibtex and the code will automatically add it to this yml file. 
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
