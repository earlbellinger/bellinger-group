from __future__ import annotations

import datetime as dt
import html
import os
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from render_front_page_papers import (
    render_front_page_papers_include,
    render_publication_count_include,
    render_publications_include as render_publications_include_from_bib,
)


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / ".codex_vendor"
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

try:
    import bibtexparser
    import markdown
    import sass
    import yaml
    from bibtexparser.customization import convert_to_unicode
    from liquid import Environment, FileSystemLoader
except ImportError as exc:  # pragma: no cover - helpful failure mode
    missing = (
        "Missing build dependency. Install with:\n"
        "  python -m pip install --target .codex_vendor -r requirements-build.txt"
    )
    raise SystemExit(f"{missing}\n\nOriginal error: {exc}") from exc


FRONT_MATTER_RE = re.compile(r"\A---[ \t]*\r?\n(.*?)(?:\r?\n)?---[ \t]*\r?\n?", re.DOTALL)
INCLUDE_TAG_RE = re.compile(r"{%\s*include\s+.*?%}", re.DOTALL)
INCLUDE_ARG_RE = re.compile(r"(?P<lead>\s+)(?P<key>[A-Za-z_][\w-]*)=(?P<value>(?:\"[^\"]*\"|'[^']*'|[^\s%]+))")
MONTH_NAMES = {
    "jan": ("January", 1),
    "january": ("January", 1),
    "feb": ("February", 2),
    "february": ("February", 2),
    "mar": ("March", 3),
    "march": ("March", 3),
    "apr": ("April", 4),
    "april": ("April", 4),
    "may": ("May", 5),
    "jun": ("June", 6),
    "june": ("June", 6),
    "jul": ("July", 7),
    "july": ("July", 7),
    "aug": ("August", 8),
    "august": ("August", 8),
    "sep": ("September", 9),
    "sept": ("September", 9),
    "september": ("September", 9),
    "oct": ("October", 10),
    "october": ("October", 10),
    "nov": ("November", 11),
    "november": ("November", 11),
    "dec": ("December", 12),
    "december": ("December", 12),
}
JOURNAL_ALIASES = {
    r"\apj": "The Astrophysical Journal",
    r"\apjl": "The Astrophysical Journal Letters",
    r"\apjs": "The Astrophysical Journal Supplement Series",
    r"\aap": "Astronomy & Astrophysics",
    r"\mnras": "Monthly Notices of the Royal Astronomical Society",
    r"\aj": "The Astronomical Journal",
    r"\nat": "Nature",
    r"\apss": "Astrophysics and Space Science",
    r"\prd": "Physical Review D",
    r"\araa": "Annual Review of Astronomy and Astrophysics",
}


class LiquidMap(dict):
    def __iter__(self):
        return iter(self.items())


class PreprocessingLoader(FileSystemLoader):
    def get_source(self, env, template_name, *, context=None, **kwargs):
        source = super().get_source(env, template_name, context=context, **kwargs)
        return source._replace(text=preprocess_liquid(source.text))


@dataclass
class Document:
    source_path: Path
    output_path: Path
    url: str
    data: dict[str, Any]
    body: str
    is_markdown: bool
    date: dt.datetime | None = None
    slug: str | None = None


def preprocess_liquid(source: str) -> str:
    def normalize_include(match: re.Match[str]) -> str:
        tag = match.group(0)
        normalized = INCLUDE_ARG_RE.sub(
            lambda item: f"{item.group('lead')}{item.group('key')}: {item.group('value')}",
            tag,
        )
        parts = re.match(r"({%\s*include\s+)([^\s%]+)(.*?)(%})", normalized, re.DOTALL)
        if not parts:
            return normalized
        prefix, template_name, args, tag_close = parts.groups()
        if template_name[:1] not in {'"', "'"}:
            template_name = f'"{template_name}"'
        arg_text = args.strip()
        if arg_text:
            arg_text = re.sub(r"\s+(?=[A-Za-z_][\w-]*:)", ", ", arg_text)
            return f"{prefix}{template_name}, {arg_text} {tag_close}"
        return f"{prefix}{template_name} {tag_close}"

    return INCLUDE_TAG_RE.sub(normalize_include, source)


def parse_front_matter(text: str) -> tuple[dict[str, Any], str]:
    match = FRONT_MATTER_RE.match(text)
    if not match:
        return {}, text
    data = yaml.safe_load(match.group(1)) or {}
    return data, text[match.end() :]


def markdownify(text: Any) -> str:
    if text is None:
        return ""
    return markdown.markdown(str(text), extensions=["extra"])


def sort_filter(items: Any, key: Any = None, order: Any = None) -> list[Any]:
    values = list(items or [])
    if key in (None, "", "nil"):
        return sorted(values)

    key_name = str(key)

    def lookup(item: Any) -> Any:
        if isinstance(item, dict):
            if key_name in item:
                return item[key_name]
            return item.get(key_name.replace("_", "-"))
        return getattr(item, key_name, None)

    reverse = str(order).lower() in {"last", "desc", "reverse", "true"}
    return sorted(values, key=lambda value: (lookup(value) is None, lookup(value)), reverse=reverse)


def load_yaml(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def month_parts(value: Any) -> tuple[str, int]:
    raw = str(value or "").strip().lower().strip("{}")
    if raw.isdigit():
        month_number = max(1, min(12, int(raw)))
        month_name = list(MONTH_NAMES.values())[month_number - 1][0]
        return month_name, month_number
    return MONTH_NAMES.get(raw, ("", 0))


def clean_bibtex_text(value: Any) -> str:
    text = str(value or "")
    for old, new in sorted(JOURNAL_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        text = text.replace(old, new)
    text = re.sub(r"[{}]", "", text)
    text = text.replace(r"~", " ")
    text = text.replace(r"\&", "&")
    return " ".join(text.split())


def format_authors(value: str) -> str:
    authors = [part.strip() for part in value.split(" and ") if part.strip()]
    formatted: list[str] = []
    for author in authors:
        author = clean_bibtex_text(author)
        if "," in author:
            last, first = [part.strip() for part in author.split(",", 1)]
            formatted.append(f"{first} {last}".strip())
        else:
            formatted.append(author)
    if len(formatted) <= 2:
        return " and ".join(formatted)
    return ", ".join(formatted[:-1]) + f", and {formatted[-1]}"


def bibliography_key(entry: dict[str, Any]) -> tuple[int, int, str]:
    month_name, month_number = month_parts(entry.get("month"))
    _ = month_name
    return (
        int(entry.get("year") or 0),
        month_number,
        clean_bibtex_text(entry.get("title")),
    )


def main_url(entry: dict[str, Any]) -> str | None:
    doi = clean_bibtex_text(entry.get("doi"))
    if doi:
        return f"https://doi.org/{doi}"
    adsurl = clean_bibtex_text(entry.get("adsurl"))
    if adsurl:
        return adsurl
    url = clean_bibtex_text(entry.get("url"))
    if url:
        return url
    eprint = clean_bibtex_text(entry.get("eprint"))
    if eprint:
        return f"https://arxiv.org/abs/{eprint}"
    return None


def extra_links(entry: dict[str, Any]) -> list[tuple[str, str]]:
    links: list[tuple[str, str]] = []
    doi = clean_bibtex_text(entry.get("doi"))
    if doi:
        links.append(("doi", f"https://doi.org/{doi}"))
    eprint = clean_bibtex_text(entry.get("eprint"))
    if eprint:
        links.append(("arXiv", f"https://arxiv.org/abs/{eprint}"))
    adsurl = clean_bibtex_text(entry.get("adsurl"))
    if adsurl:
        links.append(("ADS", adsurl))
    return links


def venue(entry: dict[str, Any]) -> str:
    for field in ("journal", "booktitle", "publisher"):
        value = clean_bibtex_text(entry.get(field))
        if value:
            return value
    return clean_bibtex_text(entry.get("archiveprefix"))


def render_publications_include() -> None:
    bib_path = ROOT / "bib" / "pubs.bib"
    parser = bibtexparser.bparser.BibTexParser(common_strings=True)
    parser.ignore_nonstandard_types = False
    bibliography = bibtexparser.loads(bib_path.read_text(encoding="utf-8"), parser=parser)
    entries = [convert_to_unicode(dict(entry)) for entry in bibliography.entries]
    entries = sorted(entries, key=bibliography_key, reverse=True)

    lines = ["<table class=\"table\">", "<tbody>"]
    previous_year: str | None = None
    for entry in entries:
        year = clean_bibtex_text(entry.get("year"))
        month_name, _ = month_parts(entry.get("month"))
        title = clean_bibtex_text(entry.get("title"))
        authors = format_authors(entry.get("author", ""))
        venue_text = venue(entry)
        note = clean_bibtex_text(entry.get("note"))
        url = main_url(entry)
        lines.append("  <tr>")
        lines.append("    <td>")
        lines.append('      <span class="date">')
        if year and year != previous_year:
            lines.append(f"        <big><strong>{html.escape(year)}</strong></big><br />")
            previous_year = year
        lines.append(f"        {html.escape(month_name)}")
        lines.append("      </span>")
        lines.append("    </td>")
        lines.append('    <td class="publication">')
        if url:
            lines.append(
                "      <span class=\"pubtitle\">"
                f"<a href=\"{html.escape(url)}\">{html.escape(title)}</a>.</span><br />"
            )
        else:
            lines.append(f"      <span class=\"pubtitle\">{html.escape(title)}.</span><br />")
        if authors:
            lines.append(f"      <span class=\"authors\">{html.escape(authors)}.</span><br />")
        if venue_text:
            lines.append(f"      <span class=\"venue\">{html.escape(venue_text)}</span>.")
        if note:
            lines.append(f"      <span class=\"note\"> {html.escape(note)}.</span>")
        links = extra_links(entry)
        if links:
            rendered_links = " ".join(
                f"[<a href=\"{html.escape(link)}\">{html.escape(label)}</a>]"
                for label, link in links
            )
            lines.append(f"      <br />\n      <span class=\"links\">{rendered_links}</span>")
        lines.append("    </td>")
        lines.append("  </tr>")
    lines.extend(["</tbody>", "</table>", ""])
    include_path = ROOT / "_includes" / "pubs.html"
    include_path.parent.mkdir(parents=True, exist_ok=True)
    include_path.write_text("\n".join(lines), encoding="utf-8")


def split_excerpt(text: str) -> str:
    paragraphs = re.split(r"\r?\n\s*\r?\n", text.strip(), maxsplit=1)
    return paragraphs[0].strip() if paragraphs and paragraphs[0].strip() else text.strip()


def load_posts() -> list[Document]:
    documents: list[Document] = []
    for path in sorted((ROOT / "_posts").glob("*.md")):
        match = re.match(r"(\d{4})-(\d{2})-(\d{2})-(.+)\.md$", path.name)
        if not match:
            continue
        year, month, day, slug = match.groups()
        date = dt.datetime(int(year), int(month), int(day))
        data, body = parse_front_matter(path.read_text(encoding="utf-8"))
        url = f"/blog/{year}/{month}/{day}/{slug}.html"
        output_path = ROOT / "_site" / "blog" / year / month / day / f"{slug}.html"
        data.setdefault("layout", "post")
        data.setdefault("title", "")
        data["date"] = date
        documents.append(
            Document(
                source_path=path,
                output_path=output_path,
                url=url,
                data=data,
                body=body,
                is_markdown=True,
                date=date,
                slug=slug,
            )
        )
    documents.sort(key=lambda doc: doc.date or dt.datetime.min, reverse=True)
    return documents


def load_root_pages(excludes: set[str]) -> list[Document]:
    documents: list[Document] = []
    for path in sorted(ROOT.iterdir()):
        if not path.is_file():
            continue
        if path.name in excludes or path.suffix.lower() not in {".html", ".md"}:
            continue
        data, body = parse_front_matter(path.read_text(encoding="utf-8"))
        if not data:
            continue
        output_name = "index.html" if path.name == "index.html" else f"{path.stem}.html"
        output_path = ROOT / "_site" / output_name
        url = "/" if path.name == "index.html" else f"/{output_name}"
        documents.append(
            Document(
                source_path=path,
                output_path=output_path,
                url=url,
                data=data,
                body=body,
                is_markdown=path.suffix.lower() == ".md",
            )
        )
    return documents


def load_projects() -> list[Document]:
    project_dir = ROOT / "_projects"
    documents: list[Document] = []
    if not project_dir.exists():
        return documents
    for path in sorted(project_dir.glob("*.md")):
        data, body = parse_front_matter(path.read_text(encoding="utf-8"))
        if not data:
            continue
        slug = path.stem
        data.setdefault("layout", "project")
        output_path = ROOT / "_site" / "projects" / f"{slug}.html"
        documents.append(
            Document(
                source_path=path,
                output_path=output_path,
                url=f"/projects/{slug}.html",
                data=data,
                body=body,
                is_markdown=True,
                slug=slug,
            )
        )
    return documents


def copy_static(output_dir: Path) -> None:
    for name in ("img", "js", "bib"):
        source = ROOT / name
        target = output_dir / name
        if source.exists():
            shutil.copytree(source, target, dirs_exist_ok=True)


def compile_scss(output_dir: Path) -> None:
    css_dir = output_dir / "css"
    css_dir.mkdir(parents=True, exist_ok=True)
    for source in sorted((ROOT / "css").glob("*.scss")):
        _, scss_body = parse_front_matter(source.read_text(encoding="utf-8"))
        compiled = sass.compile(
            string=scss_body,
            include_paths=[str(source.parent)],
            output_style="expanded",
        )
        target = css_dir / f"{source.stem}.css"
        target.write_text(compiled, encoding="utf-8")


def build_site_context(config: dict[str, Any], people: LiquidMap, posts: list[dict[str, Any]], projects: list[dict[str, Any]]) -> dict[str, Any]:
    site = dict(config)
    site["data"] = {"people": people}
    site["posts"] = posts
    site["projects"] = projects
    return site


def render_liquid(env: Environment, source: str, context: dict[str, Any]) -> str:
    return env.from_string(preprocess_liquid(source)).render(**context)


def load_layout(name: str) -> tuple[dict[str, Any], str]:
    candidates = [
        ROOT / "_layouts" / name,
        ROOT / "_layouts" / f"{name}.html",
        ROOT / "_layouts" / f"{name}.md",
    ]
    for candidate in candidates:
        if candidate.exists():
            return parse_front_matter(candidate.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"Unknown layout: {name}")


def render_document(env: Environment, document: Document, site: dict[str, Any]) -> str:
    page = dict(document.data)
    page["url"] = document.url
    if document.date is not None:
        page["date"] = document.date

    body_context = {"site": site, "page": page}
    rendered_body = render_liquid(env, document.body, body_context)
    content = markdownify(rendered_body) if document.is_markdown else rendered_body

    layout_name = page.get("layout")
    while layout_name:
        layout_data, layout_body = load_layout(str(layout_name))
        content = render_liquid(
            env,
            layout_body,
            {
                "site": site,
                "page": page,
                "content": content,
            },
        )
        layout_name = layout_data.get("layout")

    return content


def render_post_listing_fields(env: Environment, document: Document, site: dict[str, Any]) -> dict[str, Any]:
    page = dict(document.data)
    page["url"] = document.url
    if document.date is not None:
        page["date"] = document.date
    rendered_body = render_liquid(env, document.body, {"site": site, "page": page})
    listing = dict(page)
    listing["url"] = document.url
    listing["content"] = rendered_body.strip()
    listing["excerpt"] = split_excerpt(rendered_body)
    return listing


def write_document(document: Document, rendered: str) -> None:
    document.output_path.parent.mkdir(parents=True, exist_ok=True)
    document.output_path.write_text(rendered, encoding="utf-8")


def main() -> int:
    config = load_yaml(ROOT / "_config.yml")
    excludes = {str(item) for item in config.get("exclude", [])}
    people = LiquidMap(load_yaml(ROOT / "_data" / "people.yml"))

    output_dir = ROOT / "_site"
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    render_publications_include_from_bib(ROOT)
    render_front_page_papers_include(ROOT, int(config.get("front_page_papers", 5)))
    render_publication_count_include(ROOT)

    env = Environment(loader=PreprocessingLoader([ROOT / "_includes"]), autoescape=False)
    env.add_filter("markdownify", markdownify)
    env.add_filter("sort", sort_filter)

    posts = load_posts()
    projects = load_projects()
    base_site = build_site_context(config, people, [], [])
    post_listings = [render_post_listing_fields(env, post, base_site) for post in posts]
    project_listings = []
    for project in projects:
        listing = dict(project.data)
        listing["url"] = project.url
        project_listings.append(listing)
    site = build_site_context(config, people, post_listings, project_listings)

    documents = [*load_root_pages(excludes), *posts, *projects]
    for document in documents:
        rendered = render_document(env, document, site)
        write_document(document, rendered)

    copy_static(output_dir)
    compile_scss(output_dir)

    print(f"Built site into {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
