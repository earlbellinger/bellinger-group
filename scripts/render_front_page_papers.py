from __future__ import annotations

import argparse
import html
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

MONTH_ORDER = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

MONTH_NAMES = {
    1: "January",
    2: "February",
    3: "March",
    4: "April",
    5: "May",
    6: "June",
    7: "July",
    8: "August",
    9: "September",
    10: "October",
    11: "November",
    12: "December",
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


@dataclass
class BibEntry:
    entry_type: str
    key: str
    fields: dict[str, str]


@dataclass(frozen=True)
class GroupMember:
    display_name: str
    role: str


def read_front_page_papers_limit(config_path: Path) -> int:
    match = re.search(r"(?m)^front_page_papers:\s*(\d+)\s*$", config_path.read_text(encoding="utf-8"))
    return int(match.group(1)) if match else 5


def split_entries(text: str) -> list[str]:
    entries: list[str] = []
    index = 0
    while True:
        start = text.find("@", index)
        if start == -1:
            return entries
        brace_start = text.find("{", start)
        if brace_start == -1:
            return entries
        depth = 0
        position = brace_start
        while position < len(text):
            char = text[position]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    entries.append(text[start : position + 1])
                    index = position + 1
                    break
            position += 1
        else:
            return entries


def parse_entry(raw_entry: str) -> BibEntry:
    type_match = re.match(r"@(?P<entry_type>\w+)\s*\{", raw_entry)
    if not type_match:
        raise ValueError(f"Invalid BibTeX entry: {raw_entry[:60]}")
    entry_type = type_match.group("entry_type").lower()
    body = raw_entry[type_match.end() :].rstrip().rstrip("}").strip()

    key, remainder = split_key(body)
    fields = parse_fields(remainder)
    fields["key"] = key
    return BibEntry(entry_type=entry_type, key=key, fields=fields)


def split_key(body: str) -> tuple[str, str]:
    depth = 0
    for index, char in enumerate(body):
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        elif char == "," and depth == 0:
            return body[:index].strip(), body[index + 1 :]
    return body.strip(), ""


def parse_fields(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    index = 0
    length = len(body)
    while index < length:
        while index < length and body[index] in " \t\r\n,":
            index += 1
        if index >= length:
            break

        start = index
        while index < length and body[index] not in "=\r\n":
            index += 1
        name = body[start:index].strip().lower()
        while index < length and body[index] != "=":
            index += 1
        if index >= length:
            break
        index += 1
        while index < length and body[index].isspace():
            index += 1
        value, index = parse_value(body, index)
        if name:
            fields[name] = value.strip()
    return fields


def parse_value(body: str, index: int) -> tuple[str, int]:
    if index >= len(body):
        return "", index

    if body[index] == "{":
        return parse_braced_value(body, index)
    if body[index] == '"':
        return parse_quoted_value(body, index)

    start = index
    while index < len(body) and body[index] not in ",\r\n":
        index += 1
    return body[start:index].strip(), index


def parse_braced_value(body: str, index: int) -> tuple[str, int]:
    depth = 0
    start = index + 1
    index += 1
    while index < len(body):
        char = body[index]
        if char == "{":
            depth += 1
        elif char == "}":
            if depth == 0:
                return body[start:index], index + 1
            depth -= 1
        index += 1
    return body[start:], index


def parse_quoted_value(body: str, index: int) -> tuple[str, int]:
    start = index + 1
    index += 1
    while index < len(body):
        char = body[index]
        if char == '"' and body[index - 1] != "\\":
            return body[start:index], index + 1
        index += 1
    return body[start:], index


def clean_text(value: str | None) -> str:
    text = str(value or "")
    for old, new in sorted(JOURNAL_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        text = text.replace(old, new)
    text = re.sub(r"""\\["'`^~=\.Hcuvdbtrk]\{?([A-Za-z])\}?""", r"\1", text)
    text = re.sub(r"""\\([A-Za-z])\{?([A-Za-z])\}?""", r"\2", text)
    text = text.replace(r"\ss", "ss")
    text = text.replace(r"\ae", "ae")
    text = text.replace(r"\oe", "oe")
    text = text.replace(r"\o", "o")
    text = text.replace(r"\aa", "a")
    text = text.replace(r"\&", "&")
    text = text.replace("~", " ")
    text = re.sub(r"[{}]", "", text)
    return " ".join(text.split())


def month_number(value: str | None) -> int:
    raw = clean_text(value).lower()
    if raw.isdigit():
        return max(1, min(12, int(raw)))
    return MONTH_ORDER.get(raw, 0)


def month_name(value: str | None) -> str:
    return MONTH_NAMES.get(month_number(value), "")


def initials(first_names: str) -> str:
    tokens = [token for token in clean_text(first_names).replace(".", " ").split() if token]
    parts: list[str] = []
    for token in tokens:
        subparts = [part for part in token.split("-") if part]
        if not subparts:
            continue
        parts.append("-".join(f"{part[0].upper()}." for part in subparts if part[0].isalpha()))
    return " ".join(parts)


def format_author(author: str) -> str:
    cleaned = clean_text(author)
    if "," in cleaned:
        last_name, first_names = [part.strip() for part in cleaned.split(",", 1)]
    else:
        pieces = cleaned.split()
        last_name = pieces[-1] if pieces else ""
        first_names = " ".join(pieces[:-1])
    author_initials = initials(first_names)
    return f"{last_name}, {author_initials}".strip().rstrip(",")


def strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def load_group_members(path: Path) -> list[GroupMember]:
    members: list[GroupMember] = []
    current: dict[str, str] = {}

    def flush() -> None:
        display_name = strip_quotes(current.get("display_name", ""))
        role = strip_quotes(current.get("role", ""))
        if display_name and role:
            members.append(GroupMember(display_name=display_name, role=role))

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if raw_line[:1].strip() == "" and not raw_line.startswith("    "):
            continue
        if not raw_line.startswith(" ") and stripped.endswith(":"):
            if current:
                flush()
            current = {}
            continue
        if raw_line.startswith("    ") and ":" in stripped:
            field_name, field_value = stripped.split(":", 1)
            current[field_name.strip()] = field_value.strip()
    if current:
        flush()
    return members


def normalize_name(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", clean_text(text))
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9\s-]", " ", normalized)
    return " ".join(normalized.split())


def name_tokens(text: str) -> list[str]:
    return [token for token in normalize_name(text).replace("-", " ").split() if token]


def leading_initial(text: str) -> str:
    for token in name_tokens(text):
        if token:
            return token[0]
    return ""


def surname_aliases(text: str) -> list[str]:
    tokens = name_tokens(text)
    if not tokens:
        return []
    aliases: list[str] = []
    seen: set[str] = set()
    tail = tokens[1:] or tokens
    connectors = {"al", "bin", "da", "de", "del", "della", "den", "der", "di", "dos", "du", "la", "le", "van", "von"}
    variants = [
        " ".join(tail),
        tail[-1],
        " ".join(token for token in tail if token not in connectors),
    ]
    variants.extend(token for token in tail if token not in connectors)
    for alias in variants:
        alias = alias.strip()
        if alias and alias not in seen:
            seen.add(alias)
            aliases.append(alias)
    return aliases


def build_role_lookup(path: Path) -> dict[tuple[str, str], str]:
    lookup: dict[tuple[str, str], str] = {}
    for member in load_group_members(path):
        first_initial = leading_initial(member.display_name)
        if not first_initial:
            continue
        for alias in surname_aliases(member.display_name):
            lookup.setdefault((alias, first_initial), member.role)
    return lookup


def parse_author_name(author: str) -> tuple[str, str]:
    cleaned = clean_text(author)
    if "," in cleaned:
        return tuple(part.strip() for part in cleaned.split(",", 1))
    pieces = cleaned.split()
    if not pieces:
        return "", ""
    return pieces[-1], " ".join(pieces[:-1])


def match_role(author: str, role_lookup: dict[tuple[str, str], str]) -> str | None:
    last_name, first_names = parse_author_name(author)
    first_initial = leading_initial(first_names)
    if not first_initial:
        return None
    for alias in surname_aliases(last_name):
        role = role_lookup.get((alias, first_initial))
        if role:
            return role
    return None


def render_author(author: str, role_lookup: dict[tuple[str, str], str]) -> str:
    formatted = html.escape(format_author(author))
    role = match_role(author, role_lookup)
    if not role:
        return formatted
    return f'<strong class="paper-author" data-role="{html.escape(role)}">{formatted}</strong>'


def render_authors(value: str | None, role_lookup: dict[tuple[str, str], str]) -> str:
    authors = [render_author(author, role_lookup) for author in re.split(r"\s+and\s+", value or "") if author.strip()]
    return ", ".join(author for author in authors if author)


def split_authors(value: str | None) -> list[str]:
    return [author for author in re.split(r"\s+and\s+", value or "") if author.strip()]


def join_author_list(authors: list[str]) -> str:
    if len(authors) <= 2:
        return " and ".join(authors)
    return ", ".join(authors[:-1]) + f", and {authors[-1]}"


def format_display_author(author: str) -> str:
    cleaned = clean_text(author)
    if "," in cleaned:
        last_name, first_names = [part.strip() for part in cleaned.split(",", 1)]
        return f"{first_names} {last_name}".strip()
    return cleaned


def render_display_author(author: str, role_lookup: dict[tuple[str, str], str]) -> str:
    formatted = html.escape(format_display_author(author))
    role = match_role(author, role_lookup)
    if not role:
        return formatted
    return f'<strong class="paper-author" data-role="{html.escape(role)}">{formatted}</strong>'


def render_publication_authors(value: str | None, role_lookup: dict[tuple[str, str], str]) -> str:
    raw_authors = split_authors(value)
    if len(raw_authors) > 15:
        first_author = render_display_author(raw_authors[0], role_lookup)
        group_authors = [
            render_display_author(author, role_lookup)
            for author in raw_authors[1:]
            if match_role(author, role_lookup)
        ]
        if group_authors:
            return f"{first_author} et al. including {join_author_list(group_authors)}"
        return f"{first_author} et al."

    authors = [render_display_author(author, role_lookup) for author in raw_authors]
    return join_author_list(authors)


def ads_url(entry: BibEntry) -> str | None:
    for field_name in ("adsurl", "url"):
        value = clean_text(entry.fields.get(field_name))
        if value:
            return value
    doi = clean_text(entry.fields.get("doi"))
    if doi:
        return f"https://doi.org/{doi}"
    eprint = clean_text(entry.fields.get("eprint"))
    if eprint:
        return f"https://arxiv.org/abs/{eprint}"
    return None


def publication_url(entry: BibEntry) -> str | None:
    doi = clean_text(entry.fields.get("doi"))
    if doi:
        return f"https://doi.org/{doi}"
    ads = clean_text(entry.fields.get("adsurl"))
    if ads:
        return ads
    url = clean_text(entry.fields.get("url"))
    if url:
        return url
    eprint = clean_text(entry.fields.get("eprint"))
    if eprint:
        return f"https://arxiv.org/abs/{eprint}"
    return None


def publication_links(entry: BibEntry) -> list[tuple[str, str]]:
    links: list[tuple[str, str]] = []
    doi = clean_text(entry.fields.get("doi"))
    if doi:
        links.append(("doi", f"https://doi.org/{doi}"))
    eprint = clean_text(entry.fields.get("eprint"))
    if eprint:
        links.append(("arXiv", f"https://arxiv.org/abs/{eprint}"))
    ads = clean_text(entry.fields.get("adsurl"))
    if ads:
        links.append(("ADS", ads))
    return links


def venue(entry: BibEntry) -> str:
    for field_name in ("journal", "booktitle", "publisher"):
        value = clean_text(entry.fields.get(field_name))
        if value:
            return value
    return ""


def citation_sort_key(entry: BibEntry) -> tuple[int, int]:
    year = int(clean_text(entry.fields.get("year")) or 0)
    month = month_number(entry.fields.get("month"))
    return (year, month)


def load_bib_entries(root: Path) -> list[BibEntry]:
    bib_path = root / "bib" / "pubs.bib"
    entries = [parse_entry(raw_entry) for raw_entry in split_entries(bib_path.read_text(encoding="utf-8"))]
    entries.sort(key=citation_sort_key, reverse=True)
    return entries


def is_peer_reviewed(entry: BibEntry) -> bool:
    key = clean_text(entry.key).lower()
    if "arxiv" in key:
        return False
    for field_name in ("eid", "pages", "journal"):
        value = clean_text(entry.fields.get(field_name)).lower()
        if value.startswith("arxiv"):
            return False
        if value == "arxiv e-prints":
            return False
    return True


def render_publication_count_include(root: Path) -> Path:
    output_path = root / "_includes" / "publication-count.html"
    count = sum(1 for entry in load_bib_entries(root) if is_peer_reviewed(entry))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(f"{count}\n", encoding="utf-8")
    return output_path


def render_front_page_papers_include(root: Path, limit: int) -> Path:
    people_path = root / "_data" / "people.yml"
    output_path = root / "_includes" / "front-page-papers.html"

    entries = load_bib_entries(root)
    role_lookup = build_role_lookup(people_path)

    lines: list[str] = ['<ul class="paper-list list-unstyled">']
    for entry in entries[:limit]:
        authors = render_authors(entry.fields.get("author"), role_lookup)
        year = html.escape(clean_text(entry.fields.get("year")))
        title = html.escape(clean_text(entry.fields.get("title")))
        venue_text = html.escape(venue(entry))
        url = ads_url(entry)
        linked_title = f'<a href="{html.escape(url)}">{title}</a>' if url else title
        lines.append('  <li class="paper-entry">')
        lines.append(
            '    '
            f'<span class="paper-authors">{authors}</span> '
            f'(<span class="paper-year">{year}</span>). '
            f'<span class="paper-title">{linked_title}</span>. '
            f'<span class="paper-venue"><em>{venue_text}</em></span>.'
        )
        lines.append("  </li>")
    if len(lines) == 1:
        lines.append('  <li class="paper-entry paper-entry-empty">No papers yet.</li>')
    lines.append("</ul>")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return output_path


def render_publications_include(root: Path) -> Path:
    people_path = root / "_data" / "people.yml"
    output_path = root / "_includes" / "pubs.html"

    entries = load_bib_entries(root)
    role_lookup = build_role_lookup(people_path)

    lines: list[str] = ['<table class="table">', "<tbody>"]
    previous_year = ""
    previous_month_key: tuple[str, str] | None = None
    for entry in entries:
        year = html.escape(clean_text(entry.fields.get("year")))
        month = html.escape(month_name(entry.fields.get("month")))
        month_key = (year, month)
        title = html.escape(clean_text(entry.fields.get("title")))
        authors = render_publication_authors(entry.fields.get("author"), role_lookup)
        venue_text = html.escape(venue(entry))
        note = html.escape(clean_text(entry.fields.get("note")))
        url = publication_url(entry)

        lines.append("  <tr>")
        lines.append("    <td>")
        lines.append('      <span class="date">')
        if year and year != previous_year:
            lines.append(f"        <big><strong>{year}</strong></big><br />")
            previous_year = year
        if month and month_key != previous_month_key:
            lines.append(f"        {month}")
            previous_month_key = month_key
        else:
            lines.append("        ")
        lines.append("      </span>")
        lines.append("    </td>")
        lines.append('    <td class="publication">')
        if url:
            lines.append(
                '      <span class="pubtitle">'
                f'<a href="{html.escape(url)}">{title}</a>.</span><br />'
            )
        else:
            lines.append(f'      <span class="pubtitle">{title}.</span><br />')
        if authors:
            lines.append(f'      <span class="authors">{authors}.</span><br />')
        if venue_text:
            lines.append(f'      <span class="venue">{venue_text}</span>.')
        if note:
            lines.append(f'      <span class="note"> {note}.</span>')
        links = publication_links(entry)
        if links:
            rendered_links = " ".join(
                f'[<a href="{html.escape(link)}">{html.escape(label)}</a>]'
                for label, link in links
            )
            lines.append(f'      <br />\n      <span class="links">{rendered_links}</span>')
        lines.append("    </td>")
        lines.append("  </tr>")
    lines.extend(["</tbody>", "</table>", ""])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the front-page papers include from BibTeX.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root.")
    parser.add_argument("--limit", type=int, default=None, help="Maximum number of papers to include.")
    args = parser.parse_args()

    root = args.root.resolve()
    limit = args.limit if args.limit is not None else read_front_page_papers_limit(root / "_config.yml")
    output_path = render_front_page_papers_include(root, limit)
    render_publication_count_include(root)
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
