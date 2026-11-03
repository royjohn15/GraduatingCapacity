#!/usr/bin/env python3
"""Prepares private/initial_data.json, the one-time import that fills a new Google Sheet.

Takes faculty, graduated scholars, settings and activity log as stored in GraduatingCapacity.html,
and the current scholars from 'PhD Scholars List.xlsx' (sheet CURRENT). The app works out each faculty
member's on-roll numbers from that list.

The output contains student data. It stays in private/, which .gitignore keeps out of the public repo.

Run from anywhere:  python3 tools/build_initial_data.py
"""
import json
import re
import warnings
from datetime import datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "private" / "initial_data.json"
warnings.filterwarnings("ignore", message="Workbook contains no default style")


def norm(raw):
    n = re.sub(r"^(Dr|Prof)\.?\s*", "", str(raw or "").strip(), flags=re.I)
    n = re.sub(r",.*$", "", re.sub(r"\(.*?\)", "", n))
    return re.sub(r"\s+", " ", n).strip().upper()


def tokens(name):
    return frozenset(t for t in name.split() if len(t) > 1)


def main():
    html = (ROOT / "GraduatingCapacity.html").read_text()
    data = json.loads(re.search(r'<script id="seed"[^>]*>(.*?)</script>', html, re.S).group(1))
    for f in data["faculty"]:
        if f["name"] == "RAHUL KUMAR BARMAN":   # the old app's spelling; the correct name is RAHOOL
            f["name"] = "RAHOOL KUMAR BARMAN"
    exact = {f["name"]: f["id"] for f in data["faculty"]}
    by_tokens = {tokens(f["name"]): f["id"] for f in data["faculty"]}

    def match(raw):
        n = norm(raw)
        t = tokens(n)
        hit = exact.get(n) or by_tokens.get(t)
        if hit:
            return hit
        # Same rule as the app: one name wholly inside the other, at least 2 shared words, one candidate only.
        near = [fid for ft, fid in by_tokens.items() if len(t & ft) >= 2 and (t <= ft or ft <= t)]
        return near[0] if len(near) == 1 else None

    ws = openpyxl.load_workbook(ROOT / "PhD Scholars List.xlsx", data_only=True)["CURRENT"]
    head = [str(c or "").strip() for c in next(ws.iter_rows(min_row=3, max_row=3, values_only=True))]
    col = {name: head.index(name) for name in
           ["Roll No.", "Name of the Scholar", "Gender", "Scheme", "Programme", "Guide", "Co-Guide", "Date of Joining", "Remarks"]}
    next_id = data["nextId"]
    scholars, guides_unmatched = [], set()
    for row in ws.iter_rows(min_row=4, values_only=True):
        if not row[col["Roll No."]]:
            continue
        guide_raw = str(row[col["Guide"]] or "").strip()
        guide_id = match(guide_raw)
        if not guide_id:
            guides_unmatched.add(guide_raw)
        coguides = []
        for c in re.split(r";", str(row[col["Co-Guide"]] or "")):
            c = c.strip()
            if c:
                fid = match(c)
                coguides.append({"faculty_id": fid} if fid else {"external_name": c})
        joined = row[col["Date of Joining"]]
        scholars.append({
            "id": next_id,
            "roll_no": str(row[col["Roll No."]]).strip().upper(),
            "name": re.sub(r"\s+", " ", str(row[col["Name of the Scholar"]]).strip()).upper(),
            "gender": str(row[col["Gender"]] or "").strip(),
            "scheme": str(row[col["Scheme"]] or "").strip(),
            "programme": str(row[col["Programme"]] or "").strip(),
            "guide_id": guide_id,
            "guide_name": "" if guide_id else guide_raw,
            "coguides": coguides,
            "date_of_joining": joined.strftime("%Y-%m-%d") if isinstance(joined, datetime) else str(joined or ""),
            "cycle": "Before this app",
            "remarks": str(row[col["Remarks"]] or "").strip(),
            "added_on": "",
        })
        next_id += 1
    data["scholars"] = scholars
    data["nextId"] = next_id
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1))
    print(f"faculty {len(data['faculty'])}, graduated {len(data['students'])}, scholars {len(scholars)}, log {len(data['log'])}")
    print("guides on the scholars list with no faculty record:", sorted(guides_unmatched) or "none")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
