#!/usr/bin/env python3
"""Apply explicitly reviewed Hinata source updates against a pinned source snapshot.

No fetching/publishing. Requires a separate output path. The manifest approves
only its exact old/new features; later source changes need another review.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone

from promote_shimizu_hinata import MAP_ID, KEY_PREFIX, load, atomic_write, normalise_candidate, promote, is_managed


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode()).hexdigest()


def key(row):
    return row.get("properties", {}).get("sourceKey")


def indexed(rows):
    result = {}
    ids = set()
    for row in rows:
        props = row.get("properties", {})
        public_id = props.get("id")
        source_key = key(row)
        if not source_key or not public_id or source_key in result or public_id in ids:
            raise ValueError("missing or duplicate sourceKey/public id")
        result[source_key] = row
        ids.add(public_id)
    return result


def reconcile(current, candidate, manifest):
    if manifest.get("mapId") != MAP_ID or manifest.get("schemaVersion") != 1:
        raise ValueError("invalid manifest schema or map")
    if fingerprint(candidate) != manifest["candidateSnapshotFingerprint"]:
        raise ValueError("source snapshot fingerprint mismatch; this approval is not reusable")
    rows = indexed(current["features"])
    source = indexed(candidate["features"])
    operations = manifest["operations"]
    old_keys = [op["oldSourceKey"] for op in operations if op["oldSourceKey"]]
    new_keys = [new["sourceKey"] for op in operations for new in op["newFeatures"]]
    if len(old_keys) != len(set(old_keys)) or len(new_keys) != len(set(new_keys)) or set(old_keys) & set(new_keys):
        raise ValueError("manifest has repeated or overlapping old/new endpoints")
    for op in operations:
        for new in op["newFeatures"]:
            if new["sourceKey"] not in source or fingerprint(source[new["sourceKey"]]) != new["sourceFingerprint"]:
                raise ValueError("approved source feature fingerprint mismatch")
    for held in manifest["holdFeatures"]:
        if held["sourceKey"] not in rows or fingerprint(rows[held["sourceKey"]]) != held["fingerprint"]:
            raise ValueError("held feature changed or missing")
        if held["candidateSourceKey"] in rows:
            raise ValueError("held candidate must not be published")
    # The ordinary promoter's full source identity, continuity, coordinate,
    # minimum-size and image checks remain prerequisites, not bypassed flags.
    promote(copy.deepcopy(current), copy.deepcopy(candidate), min_features=3500,
            max_additions=50, max_removals=10)
    if not any(k in rows for k in old_keys):
        if all(new["sourceKey"] in rows and fingerprint(rows[new["sourceKey"]]) == new["outputFingerprint"]
               for op in operations for new in op["newFeatures"]):
            return copy.deepcopy(current), {"status": "already-applied", "reviewId": manifest["reviewId"],
                                           "currentFeatures": len(rows), "promotedFeatures": len(rows)}
        raise ValueError("old endpoints absent but approved outputs differ")
    if not all(k in rows for k in old_keys) or any(k in rows for k in new_keys):
        raise ValueError("partial application or new endpoint already exists; refuse duplicate publication")
    replacements = {}
    additions = []
    mappings = []
    for op in operations:
        previous = rows.get(op["oldSourceKey"])
        if previous is not None and fingerprint(previous) != op["oldFingerprint"]:
            raise ValueError("old feature fingerprint mismatch")
        produced = []
        for number, new in enumerate(op["newFeatures"]):
            # Only the first source scene inherits the old ID/images. The
            # second scene of a split has its own genuine source ID/images.
            prior = previous if number == 0 else None
            feature, _ = normalise_candidate(copy.deepcopy(source[new["sourceKey"]]), prior)
            if prior is not None:
                feature["properties"]["id"] = prior["properties"]["id"]
            if fingerprint(feature) != new["outputFingerprint"]:
                raise ValueError("normalised approved output fingerprint mismatch")
            produced.append(feature)
            mappings.append({"oldSourceKey": op["oldSourceKey"], "newSourceKey": new["sourceKey"],
                             "publicId": feature["properties"]["id"], "basis": "author-source-update",
                             "independentLocationVerified": False})
        if previous is not None:
            replacements[op["oldSourceKey"]] = produced
        else:
            additions.extend(produced)
    output = []
    for row in current["features"]:
        output.extend(replacements.get(key(row), [copy.deepcopy(row)]))
    output.extend(additions)
    by_key = indexed(output)
    # Match normal promoter ordering now, avoiding a later ordering-only commit.
    output = ([row for row in output if not is_managed(row)]
              + [by_key[k] for k in source if k in by_key and is_managed(by_key[k])]
              + [row for row in output if is_managed(row) and key(row) not in source])
    result = {**copy.deepcopy(current), "features": output}
    for held in manifest["holdFeatures"]:
        assert indexed(output)[held["sourceKey"]] == rows[held["sourceKey"]]
    return result, {"status": "applied", "reviewId": manifest["reviewId"],
                    "basis": "author-source-update", "independentLocationVerified": False,
                    "currentFeatures": len(rows), "promotedFeatures": len(output),
                    "replacedOldFeatures": len(old_keys), "replacementFeatures": len(new_keys)-len(additions),
                    "addedFeatures": len(additions), "heldFeatures": len(manifest["holdFeatures"]),
                    "idMappings": mappings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("current", "candidate", "manifest", "output", "report"):
        parser.add_argument("--"+name, type=Path, required=True)
    args = parser.parse_args()
    try:
        inputs = {args.current.resolve(), args.candidate.resolve(), args.manifest.resolve()}
        if args.output.resolve() in inputs or args.report.resolve() in inputs or args.report.resolve() == args.output.resolve():
            raise ValueError("output/report must be separate from all inputs and each other")
        manifest = json.loads(args.manifest.read_text())
        if hashlib.sha256(args.candidate.read_bytes()).hexdigest() != manifest["candidateFileSha256"]:
            raise ValueError("pinned source file SHA256 mismatch")
        result, report = reconcile(load(args.current), load(args.candidate), manifest)
        report["reviewedAt"] = datetime.now(timezone.utc).isoformat()
        atomic_write(args.output, result)
        atomic_write(args.report, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError) as exc:
        print(f"apply_hinata_review.py: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
