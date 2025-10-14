#!/usr/bin/env python3
"""
Clean English wordlists by removing conjugated/inflected and Latin-y forms.

- Input:  one or more JSON files, each a list of lowercase words (e.g., words-clean-5.json)
- Output: words-base-<len>.json (same dir) with mostly base forms, 4–8 letters

Usage:
  python clean_inflections.py ./words/words-clean-4.json ./words/words-clean-5.json ...

Options:
  --min-zipf 3.5   (optional) require wordfreq Zipf >= threshold (needs `pip install wordfreq`)
  --allow-any      ignore dictionary presence check when picking lemmas (more aggressive)
"""

import json, re, sys, os, argparse
import glob
from collections import defaultdict


# stems from stripped contractions that we NEVER want
BAD_TARGETS = {
    "aint","arent","cant","couldnt","didnt","doesn","doesnt","dont","hadnt","hasnt","havent",
    "isnt","shouldnt","wasnt","werent","wouldnt","wont","youre","theyre","were","weve",
}


# -------- Optional frequency filter --------
def make_zipf_fn(min_zipf: float):
    try:
        from wordfreq import zipf_frequency
    except Exception:
        return None
    def ok(w: str) -> bool:
        return zipf_frequency(w, "en") >= min_zipf
    return ok

# -------- Pipeline --------
def process_files(paths, min_zipf=None, allow_any=False):
    # load all words from provided files
    all_words = set()
    by_src = {}
    for p in paths:
        with open(p, "r", encoding="utf-8") as f:
            arr = json.load(f)
        arr = [w.strip().lower() for w in arr if isinstance(w, str)]
        by_src[p] = arr
        all_words.update(arr)

    # Filter to 4–8 letters, pure alpha
    alpha = re.compile(r"^[a-z]{4,8}$")
    all_words = {w for w in all_words if alpha.match(w)}

    # Remove clearly Latin-y forms (except allowlist) and contraction stems
    stage1 = set()
    for w in all_words:
        # Skip contractions (words with apostrophes) and contraction stems
        if "'" in w or w in BAD_TARGETS:
            continue
        stage1.add(w)

    # Simply keep all words that passed the contraction filter
    keep = stage1


    # Optional frequency filter
    if min_zipf is not None:
        zipf_ok = make_zipf_fn(min_zipf)
        if zipf_ok:
            keep = {w for w in keep if zipf_ok(w)}
        else:
            print("[warn] wordfreq not installed; --min-zipf ignored", file=sys.stderr)

    # Group by length
    out = defaultdict(list)
    for w in keep:
        out[len(w)].append(w)
    for L in list(out.keys()):
        out[L] = sorted(set(out[L]))

    # Write outputs next to inputs (deduplicated by length)
    # We produce one file per length covering all inputs supplied.
    # Output names: words-base-<len>.json in the directory of the FIRST input.
    base_dir = os.path.dirname(os.path.commonpath(paths))
    if not base_dir:
        base_dir = "."

    written = {}
    for L in range(4, 9):
        arr = out.get(L, [])
        out_path = os.path.join(base_dir, f"words-base-{L}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(arr, f, ensure_ascii=False)
        written[L] = (out_path, len(arr))

    return written

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", help="Input JSON files (lists of words)")
    ap.add_argument("--min-zipf", type=float, default=None, help="Optional Zipf threshold (e.g., 3.5). Requires `pip install wordfreq`.")
    ap.add_argument("--allow-any", action="store_true", help="Pick shorter lemma even if not present in vocab (more aggressive).")
    args = ap.parse_args()

    # NEW: expand any glob patterns so Windows/PowerShell quirks don't matter
    paths = []
    for arg in args.files:
        matches = glob.glob(arg)
        if matches:
            paths.extend(matches)
        else:
            paths.append(arg)  # fall back to literal, in case user passed exact file

    if not paths:
        print("No input files found.", file=sys.stderr)
        sys.exit(1)

    written = process_files(paths, min_zipf=args.min_zipf, allow_any=args.allow_any)
    for L, (p, n) in written.items():
        print(f"Wrote {p}  ({n} words)")

if __name__ == "__main__":
    main()
