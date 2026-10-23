"""
JARVIS Conversational AI - Dataset Validator and Partitioner

Validates dataset integrity, deduplicates entries, generates reproducible
80/10/10 train/val/test splits, and computes comprehensive quality reports.

Requirements: 10.1, 10.2, 10.3
"""

import os
import sys
import json
import random
import argparse
from collections import Counter
from typing import List, Dict, Any, Tuple

# Ensure UTF-8 output on Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_INPUT = os.path.join(BASE_DIR, 'data', 'training', 'raw_dataset.jsonl')
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, 'data', 'training')


class DatasetValidator:
    def __init__(self, input_file: str = DEFAULT_INPUT, output_dir: str = DEFAULT_OUTPUT_DIR,
                 seed: int = 42, train_ratio: float = 0.8, val_ratio: float = 0.1, test_ratio: float = 0.1):
        self.input_file = input_file
        self.output_dir = output_dir
        self.seed = seed
        self.train_ratio = train_ratio
        self.val_ratio = val_ratio
        self.test_ratio = test_ratio

        # Stats
        self.total_raw = 0
        self.malformed_json = 0
        self.missing_fields = 0
        self.empty_strings = 0
        self.duplicates_removed = 0
        self.valid_records: List[Dict[str, Any]] = []

    def validate_and_deduplicate(self) -> List[Dict[str, Any]]:
        """Validate every line in input_file and remove duplicates."""
        if not os.path.exists(self.input_file):
            raise FileNotFoundError(f"Input dataset file not found: {self.input_file}")

        seen_keys = set()
        clean_records = []

        with open(self.input_file, 'r', encoding='utf-8') as f:
            for line_idx, line in enumerate(f, 1):
                self.total_raw += 1
                line = line.strip()
                if not line:
                    continue

                try:
                    record = json.loads(line)
                except Exception as e:
                    self.malformed_json += 1
                    continue

                if not isinstance(record, dict):
                    self.malformed_json += 1
                    continue

                # Check required fields
                user_inp = record.get("input")
                assistant_out = record.get("output")

                if user_inp is None or assistant_out is None:
                    self.missing_fields += 1
                    continue

                if not isinstance(user_inp, str) or not isinstance(assistant_out, str):
                    self.missing_fields += 1
                    continue

                user_inp = user_inp.strip()
                assistant_out = assistant_out.strip()

                if not user_inp or not assistant_out:
                    self.empty_strings += 1
                    continue

                # Deduplication key based on normalized input
                dedup_key = (user_inp.lower(), assistant_out)
                if dedup_key in seen_keys:
                    self.duplicates_removed += 1
                    continue

                seen_keys.add(dedup_key)

                # Ensure 'text' field is present for causal LLM training
                if "text" not in record or not record["text"]:
                    record["text"] = (
                        f"<|system|>\nYou are JARVIS, an exceptionally capable and polite AI assistant.<|end|>\n"
                        f"<|user|>\n{user_inp}<|end|>\n"
                        f"<|assistant|>\n{assistant_out}<|end|>"
                    )

                clean_records.append(record)

        self.valid_records = clean_records
        return clean_records

    def partition(self) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Group by intent and partition into train, val, test sets."""
        random.seed(self.seed)

        # Stratify by intent to ensure balanced distributions
        by_intent: Dict[str, List[Dict[str, Any]]] = {}
        for record in self.valid_records:
            intent = record.get("intent", "other")
            if intent not in by_intent:
                by_intent[intent] = []
            by_intent[intent].append(record)

        train_set = []
        val_set = []
        test_set = []

        for intent, items in by_intent.items():
            random.shuffle(items)
            n = len(items)
            n_train = int(n * self.train_ratio)
            n_val = int(n * self.val_ratio)

            train_set.extend(items[:n_train])
            val_set.extend(items[n_train:n_train + n_val])
            test_set.extend(items[n_train + n_val:])

        # Final shuffle for each split
        random.shuffle(train_set)
        random.shuffle(val_set)
        random.shuffle(test_set)

        return train_set, val_set, test_set

    def compute_stats(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Compute lengths, intent distributions, and action coverage."""
        if not records:
            return {"count": 0}

        input_lengths = [len(r["input"]) for r in records]
        output_lengths = [len(r["output"]) for r in records]
        input_word_counts = [len(r["input"].split()) for r in records]
        output_word_counts = [len(r["output"].split()) for r in records]

        intents = Counter(r.get("intent", "unknown") for r in records)
        actions = Counter(r.get("action") for r in records if r.get("action"))

        return {
            "count": len(records),
            "char_lengths": {
                "input": {
                    "min": min(input_lengths),
                    "max": max(input_lengths),
                    "avg": round(sum(input_lengths) / len(input_lengths), 1)
                },
                "output": {
                    "min": min(output_lengths),
                    "max": max(output_lengths),
                    "avg": round(sum(output_lengths) / len(output_lengths), 1)
                }
            },
            "word_counts": {
                "input": {
                    "min": min(input_word_counts),
                    "max": max(input_word_counts),
                    "avg": round(sum(input_word_counts) / len(input_word_counts), 1)
                },
                "output": {
                    "min": min(output_word_counts),
                    "max": max(output_word_counts),
                    "avg": round(sum(output_word_counts) / len(output_word_counts), 1)
                }
            },
            "intent_distribution": dict(intents),
            "unique_actions_covered": len(actions),
            "top_actions": dict(actions.most_common(10))
        }

    def save_split(self, records: List[Dict[str, Any]], filename: str):
        filepath = os.path.join(self.output_dir, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            for record in records:
                f.write(json.dumps(record, ensure_ascii=False) + '\n')
        return filepath

    def run(self) -> Dict[str, Any]:
        """Execute validation, partitioning, and report generation."""
        print(f"[DatasetValidator] Loading and validating: {self.input_file}...")
        self.validate_and_deduplicate()

        print(f"[DatasetValidator] Raw entries: {self.total_raw}")
        print(f"[DatasetValidator] Duplicates removed: {self.duplicates_removed}")
        print(f"[DatasetValidator] Invalid entries: {self.malformed_json + self.missing_fields + self.empty_strings}")
        print(f"[DatasetValidator] Clean valid records: {len(self.valid_records)}")

        if len(self.valid_records) == 0:
            raise ValueError("No valid records found in dataset!")

        train_set, val_set, test_set = self.partition()

        os.makedirs(self.output_dir, exist_ok=True)
        train_path = self.save_split(train_set, "train.jsonl")
        val_path = self.save_split(val_set, "val.jsonl")
        test_path = self.save_split(test_set, "test.jsonl")

        report = {
            "validation_summary": {
                "total_raw": self.total_raw,
                "valid_records": len(self.valid_records),
                "duplicates_removed": self.duplicates_removed,
                "malformed_json": self.malformed_json,
                "missing_fields": self.missing_fields,
                "empty_strings": self.empty_strings,
                "data_integrity_score": round(len(self.valid_records) / max(1, self.total_raw) * 100, 2)
            },
            "splits": {
                "train": self.compute_stats(train_set),
                "val": self.compute_stats(val_set),
                "test": self.compute_stats(test_set)
            },
            "split_paths": {
                "train": train_path,
                "val": val_path,
                "test": test_path
            }
        }

        report_path = os.path.join(self.output_dir, "dataset_report.json")
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        print(f"[DatasetValidator] Partitions generated successfully:")
        print(f"  - Train: {len(train_set):>6} records -> {train_path}")
        print(f"  - Val:   {len(val_set):>6} records -> {val_path}")
        print(f"  - Test:  {len(test_set):>6} records -> {test_path}")
        print(f"[DatasetValidator] Report written to: {report_path}")

        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Validate and partition JARVIS training dataset.")
    parser.add_argument("--input", default=DEFAULT_INPUT, help="Path to raw dataset jsonl")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Directory to save splits and report")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic splits")
    args = parser.parse_args()

    validator = DatasetValidator(
        input_file=args.input,
        output_dir=args.output_dir,
        seed=args.seed
    )
    report = validator.run()

    valid_count = report["validation_summary"]["valid_records"]
    if valid_count >= 2000:
        print(f"✅ Dataset validation PASSED: {valid_count} clean records.")
        sys.exit(0)
    else:
        print(f"❌ Dataset validation FAILED: {valid_count} clean records < 2000.")
        sys.exit(1)
