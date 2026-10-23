# Memory Storage Directory

This directory contains the conversation database and long-term memory storage.

## Purpose
- Store conversation history (SQLite database)
- Persist user preferences
- Maintain entity knowledge base
- Session management

## Files
- `conversations.db` - SQLite database for conversation history
- `preferences.json` - User preferences and settings
- `entities.json` - Known entities (people, places, concepts)

## Database Schema
See requirements.md section 3.5 for the SQLite schema definition.

## Notes
- This directory is excluded from git by default
- Database files contain user data and should be backed up
- Implements 30-day retention policy by default
