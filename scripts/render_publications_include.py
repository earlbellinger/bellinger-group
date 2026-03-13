from __future__ import annotations

import argparse
from pathlib import Path

from render_front_page_papers import ROOT, render_publications_include


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the publications include from BibTeX.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root.")
    args = parser.parse_args()

    output_path = render_publications_include(args.root.resolve())
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
