"""Download the MSEDCL Go-Live Town Reports and pull out the rows about Pune.

Run on your own computer (it needs internet):
    python -m pip install pdfplumber
    python -m backend.pipeline.fetch_msedcl

What the source contains: monthly PDF reports per town (D1 AT&C loss, D2 new connections,
D3 complaints, D4 high-loss feeders, D5 reliability indices, D6 feeder meter communication,
D7 online collection). They have NO hourly or per-place load, so they cannot train the
30-minute model. The dashboard shows the Pune rows found here as town-level context.

Output: data/msedcl_pune.json
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

PAGE = "https://www.mahadiscom.in/en/consumer/go-live-town-reports/"
ROOT = Path(__file__).resolve().parents[2] / "data"
PDF_DIR = ROOT / "msedcl_pdfs"
OUT = ROOT / "msedcl_pune.json"
PUNE = re.compile(r"pune|pimpri|chinchwad|ganeshkhind|rastapeth|bhosari|hadapsar", re.I)
REPORTS = {"D1": "AT&C loss", "D2": "New connections", "D3": "Complaint redressal", "D4": "High-loss feeders",
           "D5": "Reliability indices", "D6": "Feeder reading communication", "D7": "Online collection"}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Pune Power Brain student project)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def pdf_links(html: str) -> list[str]:
    """Every .pdf link on the page, in page order, without duplicates."""
    links = re.findall(r'href=["\']([^"\']+?\.pdf)["\']', html, re.I)
    return list(dict.fromkeys(links))


def report_code(name: str) -> str:
    m = re.match(r"(D\d)", name, re.I)
    return m.group(1).upper() if m else "?"


def pune_rows(pdf_path: Path) -> list[dict]:
    import pdfplumber  # optional dependency, only needed here

    rows = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                header = [c or "" for c in table[0]] if table else []
                for row in table[1:]:
                    cells = [(c or "").replace("\n", " ").strip() for c in row]
                    if any(PUNE.search(c) for c in cells):
                        rows.append({"header": header, "row": cells})
    return rows


def main(limit: int | None = None):
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    print("Reading", PAGE)
    links = pdf_links(fetch(PAGE).decode("utf-8", "ignore"))
    print(f"Found {len(links)} PDF reports")
    results = []
    for url in links[:limit]:
        name = url.rsplit("/", 1)[-1]
        path = PDF_DIR / name
        if not path.exists():
            print("  downloading", name)
            path.write_bytes(fetch(url))
        try:
            rows = pune_rows(path)
        except Exception as err:  # a PDF without tables should not stop the rest
            print("  could not read", name, "-", err)
            rows = []
        code = report_code(name)
        results.append({"file": name, "url": url, "report": code, "title": REPORTS.get(code, ""), "pune_rows": rows})
        print(f"  {name}: {len(rows)} Pune rows")
    OUT.write_text(json.dumps({"source": PAGE, "reports": results}, indent=1))
    print("Saved", OUT)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
