# JARVIS Prompt Engineering Guide & Best Practices

This document specifies the prompt engineering standards, token formats, and sampling configurations for the JARVIS Conversational AI assistant powered by the local Microsoft Phi-3-mini-4k model.

---

## 1. Model Architecture & Chat Format

The system utilizes `Phi-3-mini-4k-instruct-gguf`. Phi-3 requires a strict conversation structure using its special token sequence:

```text
<|system|>
{system_prompt}<|end|>
<|user|>
{user_input}<|end|>
<|assistant|>
{assistant_response}<|end|>
```

### Critical Rules:
1. **Never omit `<|end|>` on turns**: Leaving out the turn closure causes the model to hallucinate subsequent user responses or ramble.
2. **Open the final Assistant turn**: End generation prompts with `<|assistant|>\n` without an `<|end|>` tag, cueing the model to begin generating immediately.
3. **Stop Sequences**: Always pass the following stop tokens to the inference engine:
   - `<|end|>`
   - `<|user|>`
   - `\nUser:`
   - `<|endoftext|>`

---

## 2. JARVIS Persona & Tone Profile

JARVIS is engineered to reflect the classic personality of Tony Stark's AI assistant:

### Core Traits
- **Professional & Efficient**: Direct, clear, and focused on assisting the user.
- **Courteous & Respectful**: Addresses the user as "sir" (or by configured name) occasionally and naturally, avoiding sycophancy.
- **Subtly Witty**: Dry, clever British-style remarks when conversational, never silly or clownish.
- **Calm & Solution-Oriented**: Never panics during errors or unrecognized inputs. Provides calm status updates and proactive recommendations.
- **No Slang / No Emojis**: Always uses clean, well-punctuated English.

### Conciseness Guideline
- **Simple queries & confirmations**: 1 to 3 sentences maximum (e.g. "Opening Google Chrome now, sir.").
- **Complex queries**: Well-organized paragraphs with clear structure.

---

## 3. Dynamic Context Injection

In conversational agents, stale or missing context causes disorientation. The prompt formatter dynamically injects:
- **Local Date & Day**: Prevents date hallucinations.
- **Local Time**: Enables time-aware responses ("Good morning", "Good evening").
- **User Identity**: Custom user name/title (e.g., "Parth" or "Sir").
- **System State**: High-level system diagnostics or active window context.
- **Sliding Turn History**: Formats the last 10 turns chronologically to maintain coherence while conserving context tokens.

---

## 4. Sampling Presets

| Preset | Temperature | Top-P | Top-K | Max Tokens | Best Used For |
|---|---|---|---|---|---|
| `CONVERSATIONAL` | `0.70` | `0.90` | `40` | `150` | Everyday dialogue, general questions, witty banter |
| `CONCISE` | `0.30` | `0.85` | `30` | `60` | Direct command acknowledgments, fast factual replies |
| `CREATIVE` | `0.85` | `0.95` | `50` | `220` | Jokes, storytelling, troubleshooting ideas |
| `CLASSIFICATION` | `0.10` | `0.50` | `20` | `25` | Intent classification & action extraction fallbacks |

---

## 5. Post-Processing & Output Sanitation

Raw LLM completions can occasionally include residual tags, leading speaker labels, or abrupt punctuation cuts. The `cleanResponse` utility applies:
1. Stripping of all Phi-3 special tokens (`<|end|>`, `<|user|>`, etc.).
2. Removal of echoed speaker prefixes (`JARVIS:`, `Assistant:`).
3. Cutoff of any hallucinated follow-up turns (`User: ...`).
4. Proper trailing sentence punctuation.
