# Changelog

## v2.0.1 - Continuous Conversation Fix (September 22, 2026)

### 🐛 Bug Fixes
- **FIXED**: Assistant now maintains continuous conversation instead of disconnecting after one message
- **FIXED**: Changed from `process.stdin.readable` event to `readline` interface for proper continuous input

### 🔧 Technical Changes
- Replaced `process.stdin.on('readable')` with `readline.createInterface()`
- Added `rl.prompt()` to show `>` prompt after each command
- Added `exit` and `quit` commands to gracefully close the assistant
- Improved Ctrl+C handling for clean shutdown

### ✨ Improvements
- Better user experience with visual prompt (`>`)
- Commands can now be typed continuously without disconnection
- Clear exit instructions in startup message

### 📝 Usage
```bash
npm start

> open chrome
✅ Opening Chrome

> what time is it
✅ The time is 5:19:10 pm

> joke
✅ Why do programmers prefer dark mode? Because light attracts bugs!

> exit
👋 Goodbye!
```

---

## v2.0.0 - Major Refactor (September 22, 2026)

### ✨ New Features
- Complete modular architecture (Router, Executor, Assistant)
- JSON-based command configuration
- Comprehensive test suite (34 tests)
- Longest-first pattern matching
- Full documentation

### 🎯 Improvements
- 60+ commands across 8 categories
- Edge case handling throughout
- Error handling on all operations
- Case-insensitive command matching
- Partial phrase matching

### 🧪 Testing
- Router tests: 11/11 passing
- Executor tests: 13/13 passing
- Integration tests: 10/10 passing
- Interactive tests: Added

### 📚 Documentation
- README.md - Complete user guide
- REFACTOR_COMPLETE.md - Refactor summary
- VERIFICATION_REPORT.md - Detailed verification

---

## v1.0.0 - Initial Release

### Features
- Basic voice command recognition (Windows Speech Recognition)
- Text input fallback
- ~60 command patterns
- Windows system integration

### Known Issues (Fixed in v2.0)
- Monolithic codebase
- No tests
- Pattern matching bugs
- Voice recognition issues
- Missing command implementations
