# targets that aren't filenames
.PHONY: all clean deploy build serve

all: build

PYTHON ?= python3

_includes/pubs.html: bib/pubs.bib _data/people.yml scripts/render_front_page_papers.py scripts/render_publications_include.py
	mkdir -p _includes
	$(PYTHON) scripts/render_publications_include.py

_includes/publication-search-tags.html: bib/pubs.bib _config.yml _data/people.yml scripts/render_front_page_papers.py
	mkdir -p _includes
	$(PYTHON) scripts/render_front_page_papers.py

_includes/publication-count.html: bib/pubs.bib scripts/render_front_page_papers.py
	mkdir -p _includes
	$(PYTHON) scripts/render_front_page_papers.py

_includes/front-page-papers.html: bib/pubs.bib _config.yml _data/people.yml scripts/render_front_page_papers.py
	mkdir -p _includes
	$(PYTHON) scripts/render_front_page_papers.py

build: _includes/pubs.html _includes/front-page-papers.html _includes/publication-count.html _includes/publication-search-tags.html
	jekyll build

# you can configure these at the shell, e.g.:
# SERVE_PORT=5001 make serve
SERVE_HOST ?= 127.0.0.1
SERVE_PORT ?= 5000

serve: _includes/pubs.html _includes/front-page-papers.html _includes/publication-count.html _includes/publication-search-tags.html
	jekyll serve --port $(SERVE_PORT) --host $(SERVE_HOST)

clean:
	$(RM) -r _site _includes/pubs.html _includes/front-page-papers.html _includes/publication-count.html _includes/publication-search-tags.html

DEPLOY_HOST ?= yourwebpage.com
DEPLOY_PATH ?= www/
RSYNC := rsync --compress --recursive --checksum --itemize-changes --delete -e ssh

deploy: clean build
	$(RSYNC) _site/ $(DEPLOY_HOST):$(DEPLOY_PATH)
