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

# -------- Latin-ish detection --------
LATIN_SUFFIXES = (
    "ae", "ii", "orum", "arum", "idae", "iscus", "ensis", "rix", "um", "us", "ix", "ex"
)

# very common English words with Latin-looking endings we KEEP
ALLOW_LATIN = {
    # -us / -um common in English
    "bonus","focus","status","virus","campus","apparatus",
    "album","forum","museum","stadium","premium","vacuum","minimum","maximum","medium","platinum",
    "momentum","quantum","spectrum",
    "fungus","census","thesaurus",
    # -ix that are mainstream English
    "matrix","prefix","suffix","affix","helix","remix","appendix","phoenix",
    # -ae that are mainstream
    "algae","larvae",
}

# stems from stripped contractions that we NEVER want
BAD_TARGETS = {
    "aint","arent","cant","couldnt","didnt","doesn","doesnt","dont","hadnt","hasnt","havent",
    "isn","isnt","shouldnt","wasnt","werent","wouldnt","wont","im","ive","youre","theyre","were","weve",
}

latin_pat = re.compile(r'[a-z]+')

def looks_latin(w: str) -> bool:
    if w in ALLOW_LATIN:
        return False
    # strong Latin-y endings
    for suf in LATIN_SUFFIXES:
        if w.endswith(suf):
            # relax for very short words like "bus", "gas", etc.
            if suf in ("us","um","ix","ex") and len(w) <= 4:
                return False
            return True
    return False

# -------- Heuristic English lemmatizer (no deps) --------
vowel = set("aeiou")
def _maybe(word, cand, vocab):
    """Return candidate if it exists in vocab, else None."""
    return cand if cand in vocab else None

def lemma_candidates(word: str):
    """Generate plausible base-form candidates for word."""
    w = word
    L = len(w)
    cands = set()

    # 1) Obvious no-go stems
    if w in BAD_TARGETS:
        cands.add("")  # forces drop later

    # 2) Plural -> singular
    if L > 3 and w.endswith("ies"):        # studies -> study
        cands.add(w[:-3] + "y")
    if L > 3 and w.endswith("ves"):        # leaves -> leaf / life -> lives handled by vocab check
        cands.add(w[:-3] + "f")
        cands.add(w[:-3] + "fe")
    if L > 3 and w.endswith("men"):        # women -> woman
        cands.add(w[:-3] + "man")
    if L > 3 and w.endswith("ses") or w.endswith("xes") or w.endswith("zes") or w.endswith("ches") or w.endswith("shes"):
        cands.add(w[:-2])                  # buses -> bus, boxes -> box, etc.
    if L > 2 and w.endswith("s"):          # cars -> car (but beware "as", "is")
        cands.add(w[:-1])

    irregular_plurals = {
        "children":"child","teeth":"tooth","feet":"foot","geese":"goose","mice":"mouse","men":"man","women":"woman",
    }
    if w in irregular_plurals:
        cands.add(irregular_plurals[w])

    # 3) Verb tenses
    if L > 4 and w.endswith("ing"):
        cands.add(w[:-3])                  # making -> mak
        cands.add(w[:-3] + "e")            # making -> make
        if L > 5 and w[-4] == w[-5]:       # running -> run
            cands.add(w[:-4])
    if L > 3 and w.endswith("ed"):
        cands.add(w[:-2])                  # played -> play
        cands.add(w[:-1])                  # planned -> plan
        if L > 4 and w[-3] == w[-4]:
            cands.add(w[:-3])              # stopped -> stop
        if L > 3 and w.endswith("ied"):    # studied -> study
            cands.add(w[:-3] + "y")
    if L > 2 and w.endswith("d"):
        cands.add(w[:-1])                  # loved -> love (falls back if base exists)

    # 4) Third-person singular verbs
    if L > 3 and (w.endswith("es")):
        cands.add(w[:-2])
    # 5) Adjective comparative/superlative
    if L > 3 and w.endswith("er"):
        cands.add(w[:-2])
        if w.endswith("ier"):
            cands.add(w[:-3] + "y")
        if L > 4 and w[-3] == w[-4]:
            cands.add(w[:-3])
    if L > 4 and w.endswith("est"):
        cands.add(w[:-3])
        if w.endswith("iest"):
            cands.add(w[:-4] + "y")
        if L > 5 and w[-4] == w[-5]:
            cands.add(w[:-4])

    # 6) Past participles -en (taken -> take) — risky but try both
    if L > 3 and w.endswith("en"):
        cands.add(w[:-2])
        cands.add(w[:-2] + "e")

    # 7) Default: itself (for base words)
    cands.add(w)
    return cands

def pick_base(word: str, vocab: set, allow_any: bool) -> str:
    """
    Return the base form to keep. If allow_any=False, we only keep candidates that exist in vocab.
    If allow_any=True, we pick the most plausible shorter candidate even if not present.
    """
    ws = word
    cands = lemma_candidates(ws)

    if not allow_any:
        ranked = sorted(cands, key=lambda x: (len(x), x))  # prefer shorter
        for c in ranked:
            if c in vocab:
                return c
        return ws

    # allow_any: prefer the shortest candidate; fallback to original
    ranked = sorted(cands, key=lambda x: (len(x), x))
    return ranked[0] if ranked else ws

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
        if w in BAD_TARGETS:
            continue
        if looks_latin(w):
            continue
        stage1.add(w)

    # Map each word to a base form
    base_map = {}
    for w in stage1:
        base = pick_base(w, stage1, allow_any=allow_any)
        base_map[w] = base

    # Keep only base forms; if both base and inflection exist, drop the longer inflection
    keep = set()
    for w in stage1:
        base = base_map[w]
        # if base still looks Latin and word doesn't, prefer non-Latin
        if looks_latin(base) and not looks_latin(w):
            base = w
        keep.add(base)

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
