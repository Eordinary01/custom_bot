# Training Data Directory

This directory contains training datasets for fine-tuning the JARVIS model.

## Purpose
- Store training data in JSON Lines format
- Organize datasets by type and version
- Maintain training/validation/test splits

## Data Format
Training data should be in JSON Lines (.jsonl) format:
```json
{"input": "user message", "output": "assistant response", "intent": "action|conversational|hybrid"}
```

## Organization
- `raw/` - Original unprocessed data
- `processed/` - Cleaned and formatted data
- `synthetic/` - Generated training examples
- `splits/` - Train/validation/test splits

## Notes
- This directory is excluded from git by default
- Add .gitkeep files to track subdirectories
- See design.md for data generation strategies
