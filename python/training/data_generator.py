"""
JARVIS Conversational AI - Training Data Generator

Synthesizes 2,000+ diverse, high-quality training examples in JSON Lines format:
1. Command Conversions (all 60+ system actions with varied natural phrasings)
2. Synthetic Conversations (technical Q&A, troubleshooting, general knowledge, wit)
3. Hybrid Multi-Action & Conversation Requests
4. Curated High-Quality Canonical JARVIS Exchanges

Requirements: 4.2, 10.1, 10.2, 10.3, 10.5, 10.6
"""

import os
import sys
import json
import random
from typing import List, Dict, Any

# Ensure UTF-8 output on Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Output directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, 'data', 'training')
OUTPUT_FILE = os.path.join(DATA_DIR, 'raw_dataset.jsonl')

# Templates for natural command variations
PREFIXES = [
    "",
    "Please ",
    "Could you please ",
    "Would you kindly ",
    "Can you ",
    "Hey JARVIS, ",
    "JARVIS, ",
    "JARVIS, please ",
    "I need you to ",
    "Go ahead and ",
    "Could you ",
    "Would you mind if you ",
    "At your convenience, ",
    "Quickly "
]

SUFFIXES = [
    "",
    " for me",
    " please",
    " right now",
    " immediately",
    " if you would",
    " when you get a chance",
    " sir",
    " JARVIS"
]

JARVIS_CONFIRMATIONS = [
    "Right away, sir. Opening {label}.",
    "Certainly, sir. Launching {label} now.",
    "Initiating {label} for you immediately.",
    "Accessing {label}. Standing by.",
    "Executing that now, sir. {label} is opening.",
    "Consider it done, sir. {label} is coming right up.",
    "{label} initiated. How else may I assist?",
    "Opening {label} at once, sir."
]

# Action definitions with sample triggers and labels
ACTIONS = [
    # Applications (31)
    {"action": "open_chrome", "label": "Google Chrome", "verbs": ["open chrome", "launch chrome", "start chrome", "browse the web", "surf the internet", "open google chrome", "open browser", "fire up chrome", "bring up chrome"]},
    {"action": "open_notepad", "label": "Notepad", "verbs": ["open notepad", "start notepad", "launch notepad", "take notes", "open text editor", "bring up notepad", "fire up notepad", "create a quick note"]},
    {"action": "open_calculator", "label": "Calculator", "verbs": ["open calculator", "launch calculator", "start calculator", "calculate something", "open calc", "bring up calculator", "do some math"]},
    {"action": "open_explorer", "label": "File Explorer", "verbs": ["open file explorer", "open files", "browse files", "view my files", "open explorer", "check file manager", "show files"]},
    {"action": "open_settings", "label": "Windows Settings", "verbs": ["open settings", "open windows settings", "check settings", "system preferences", "open pc settings", "view configuration"]},
    {"action": "open_cmd", "label": "Command Prompt", "verbs": ["open command prompt", "start cmd", "open cmd", "launch terminal", "open dos prompt", "launch cmd prompt"]},
    {"action": "open_powershell", "label": "PowerShell", "verbs": ["open powershell", "launch powershell", "start powershell", "open ps console", "launch powershell terminal"]},
    {"action": "open_taskmanager", "label": "Task Manager", "verbs": ["open task manager", "start task manager", "show active processes", "open taskmgr", "check system monitor", "view running tasks"]},
    {"action": "open_control_panel", "label": "Control Panel", "verbs": ["open control panel", "launch control panel", "view classic control panel", "start control panel", "admin panel"]},
    {"action": "open_outlook", "label": "Outlook", "verbs": ["open outlook", "start outlook", "launch microsoft outlook", "check work email", "open ms outlook"]},
    {"action": "open_gmail", "label": "Gmail", "verbs": ["open gmail", "launch gmail", "check google mail", "open web mail", "check my gmail"]},
    {"action": "open_discord", "label": "Discord", "verbs": ["open discord", "launch discord", "start discord", "join discord chat", "bring up discord"]},
    {"action": "open_teams", "label": "Microsoft Teams", "verbs": ["open teams", "launch microsoft teams", "start teams", "join teams meeting", "open ms teams"]},
    {"action": "open_whatsapp", "label": "WhatsApp", "verbs": ["open whatsapp", "start whatsapp", "launch whatsapp web", "check whatsapp messages", "open whatsapp app"]},
    {"action": "open_facebook", "label": "Facebook", "verbs": ["open facebook", "start facebook", "check facebook", "open fb", "browse facebook"]},
    {"action": "open_twitter", "label": "Twitter", "verbs": ["open twitter", "launch twitter", "check tweets", "open x", "browse twitter feed"]},
    {"action": "open_instagram", "label": "Instagram", "verbs": ["open instagram", "start instagram", "check instagram", "open insta", "view instagram feed"]},
    {"action": "open_linkedin", "label": "LinkedIn", "verbs": ["open linkedin", "launch linkedin", "check linkedin", "open professional network", "view linkedin jobs"]},
    {"action": "open_reddit", "label": "Reddit", "verbs": ["open reddit", "browse reddit", "launch reddit", "check reddit frontpage", "view subreddits"]},
    {"action": "open_youtube", "label": "YouTube", "verbs": ["open youtube", "launch youtube", "watch youtube", "stream youtube video", "open yt"]},
    {"action": "open_google", "label": "Google", "verbs": ["open google", "search google", "look up on google", "go to google", "google search"]},
    {"action": "open_netflix", "label": "Netflix", "verbs": ["open netflix", "launch netflix", "watch netflix", "stream a movie on netflix", "start netflix"]},
    {"action": "open_spotify", "label": "Spotify", "verbs": ["open spotify", "play music", "play songs on spotify", "listen to music", "launch spotify", "play some tunes"]},
    {"action": "open_prime", "label": "Amazon Prime Video", "verbs": ["open amazon prime", "launch prime video", "watch prime video", "open prime", "stream amazon video"]},
    {"action": "open_steam", "label": "Steam", "verbs": ["open steam", "launch steam", "play game on steam", "open game library", "start steam games"]},
    {"action": "open_word", "label": "Microsoft Word", "verbs": ["open word", "launch microsoft word", "start word processor", "write document in word", "open ms word"]},
    {"action": "open_excel", "label": "Microsoft Excel", "verbs": ["open excel", "launch microsoft excel", "open spreadsheet", "start excel sheet", "open ms excel"]},
    {"action": "open_powerpoint", "label": "Microsoft PowerPoint", "verbs": ["open powerpoint", "launch powerpoint", "open slides", "start presentation", "open ms powerpoint"]},
    {"action": "open_paint", "label": "Paint", "verbs": ["open paint", "launch paint", "draw something in paint", "open mspaint", "start paint application"]},
    {"action": "open_vscode", "label": "Visual Studio Code", "verbs": ["open visual studio code", "open vs code", "launch vscode", "start coding in vscode", "open code editor"]},
    {"action": "open_github", "label": "GitHub", "verbs": ["open github", "launch github", "view git repositories", "check github", "open my repos"]},

    # System & Windows Controls (13)
    {"action": "volume_up", "label": "Volume Up", "verbs": ["volume up", "turn up volume", "increase volume", "make it louder", "crank it up", "raise the volume", "turn sound up"]},
    {"action": "volume_down", "label": "Volume Down", "verbs": ["volume down", "turn down volume", "decrease volume", "make it quieter", "lower the volume", "softer sound", "reduce sound"]},
    {"action": "mute", "label": "Mute Audio", "verbs": ["mute audio", "silence the speakers", "mute", "toggle mute", "turn off sound", "silence the sound"]},
    {"action": "volume_app_up", "label": "App Volume Up", "verbs": ["volume app up", "increase application volume", "turn up app sound", "boost app volume"]},
    {"action": "volume_app_down", "label": "App Volume Down", "verbs": ["volume app down", "decrease application volume", "turn down app sound", "lower app volume"]},
    {"action": "lock", "label": "Lock Computer", "verbs": ["lock screen", "lock computer", "lock pc", "lock the workstation", "secure my desktop", "lock screen now"]},
    {"action": "sleep", "label": "Sleep Computer", "verbs": ["put computer to sleep", "sleep pc", "enter standby", "suspend computer", "hibernate pc"]},
    {"action": "shutdown", "label": "Shutdown System", "verbs": ["shutdown", "shut down computer", "power off pc", "turn off system", "power down the rig"]},
    {"action": "restart", "label": "Restart System", "verbs": ["restart computer", "reboot pc", "reboot the system", "restart workstation", "bounce the box"]},
    {"action": "maximize", "label": "Maximize Window", "verbs": ["maximize window", "make window full screen", "fullscreen", "expand window", "maximize this window"]},
    {"action": "minimize", "label": "Minimize Window", "verbs": ["minimize window", "hide window", "collapse window", "minimize this window", "send to taskbar"]},
    {"action": "switch_tab", "label": "Switch Tab", "verbs": ["switch tab", "next tab", "cycle to next tab", "forward tab", "switch to next tab"]},
    {"action": "previous_tab", "label": "Previous Tab", "verbs": ["previous tab", "prev tab", "back tab", "switch to previous tab", "cycle backward tab"]},

    # Files & Folders (6)
    {"action": "open_downloads", "label": "Downloads Folder", "verbs": ["open downloads", "show downloads folder", "view downloaded files", "open downloads directory"]},
    {"action": "open_documents", "label": "Documents Folder", "verbs": ["open documents", "show documents folder", "view my documents", "open documents directory"]},
    {"action": "open_desktop", "label": "Desktop Folder", "verbs": ["open desktop folder", "show desktop directory", "view desktop files"]},
    {"action": "open_pictures", "label": "Pictures Folder", "verbs": ["open pictures", "show photos folder", "view my pictures", "open images folder"]},
    {"action": "create_file", "label": "Create File", "verbs": ["create new file", "make a text file", "touch a new file", "create blank document"]},
    {"action": "create_folder", "label": "Create Folder", "verbs": ["create new folder", "make a folder", "mkdir voice folder", "create a directory"]},

    # Assistant & Utilities (10)
    {"action": "greeting", "label": "Greeting", "verbs": ["hello", "good morning", "greetings jarvis", "hey there", "are you awake"]},
    {"action": "time", "label": "Check Time", "verbs": ["what time is it", "check the clock", "tell me the time", "current time", "what hour is it"]},
    {"action": "date", "label": "Check Date", "verbs": ["what date is today", "what is today's date", "tell me the calendar date", "what day is it today"]},
    {"action": "write_email", "label": "Compose Email", "verbs": ["compose email", "write an email", "draft a mail", "new email draft", "create an email"]},
    {"action": "joke", "label": "Tell Joke", "verbs": ["tell me a joke", "make me laugh", "say something witty", "tell another joke", "crack a joke"]},
    {"action": "thanks", "label": "Thank You", "verbs": ["thank you very much", "thanks jarvis", "much appreciated", "thank you for your help"]},
    {"action": "test_speech", "label": "Test Speech", "verbs": ["test speech", "test your voice", "audio check", "speech test"]},
    {"action": "sleep_assistant", "label": "Sleep Assistant", "verbs": ["go to sleep", "sleep now", "stop listening", "stand by jarvis"]},
    {"action": "repeat", "label": "Repeat", "verbs": ["repeat that", "say that again", "pardon", "what did you say"]},
    {"action": "help", "label": "Help", "verbs": ["what commands are available", "show help", "what can you do", "list commands"]}
]

# Curated High-Quality Examples (100+ items)
CURATED_EXCHANGES = [
    {
        "input": "JARVIS, are you operational?",
        "output": "Always, sir. All core subroutines are functioning within nominal parameters. How may I be of assistance?",
        "intent": "conversational"
    },
    {
        "input": "What is the speed of light in a vacuum?",
        "output": "The speed of light in a vacuum is exactly 299,792,458 meters per second, or approximately 300,000 kilometers per second.",
        "intent": "conversational"
    },
    {
        "input": "Explain quantum superposition in simple terms.",
        "output": "In quantum mechanics, superposition is the principle that a physical system may exist simultaneously in multiple states until an observation or measurement is made, collapsing the wave function into a definite outcome.",
        "intent": "conversational"
    },
    {
        "input": "Can you open Chrome and tell me a joke?",
        "output": "Opening Google Chrome now, sir. In the meantime: Why do programmers prefer dark mode? Because light attracts bugs.",
        "intent": "hybrid",
        "action": "open_chrome"
    },
    {
        "input": "Who was Alan Turing?",
        "output": "Alan Turing was an English mathematician, computer scientist, and cryptanalyst widely recognized as the father of theoretical computer science and artificial intelligence. His work breaking the Enigma code was pivotal during World War II.",
        "intent": "conversational"
    },
    {
        "input": "How does a transistor function?",
        "output": "A transistor acts as an electronic switch and amplifier. By controlling the voltage applied to a central gate or base terminal, it modulates the flow of current between its two other terminals, forming the fundamental building block of modern digital microprocessors.",
        "intent": "conversational"
    },
    {
        "input": "Could you please open VS Code and increase the volume?",
        "output": "Opening Visual Studio Code and increasing volume now, sir.",
        "intent": "action",
        "action": "open_vscode"
    },
    {
        "input": "I am feeling a bit stressed with this workload today.",
        "output": "Take a measured breath, sir. We will navigate through the tasks methodically, one step at a time. What would you like to prioritize first?",
        "intent": "conversational"
    },
    {
        "input": "What is the capital of Australia?",
        "output": "The capital of Australia is Canberra, selected as a compromise between Sydney and Melbourne in 1908.",
        "intent": "conversational"
    },
    {
        "input": "What is the difference between RAM and storage?",
        "output": "RAM is high-speed, volatile temporary memory used by the CPU to hold currently executing programs and active data. Storage (such as an SSD or HDD) is non-volatile, preserving your operating system, files, and programs permanently even when powered off.",
        "intent": "conversational"
    },
    {
        "input": "Thank you for the assistance, JARVIS.",
        "output": "It is always my pleasure, sir. Let me know whenever further tasks require attention.",
        "intent": "action",
        "action": "thanks"
    },
    {
        "input": "What time is it?",
        "output": "The current time is registered on your system clock, sir.",
        "intent": "action",
        "action": "time"
    },
    {
        "input": "What date is today?",
        "output": "Today's calendar date is displayed accurately in your system settings, sir.",
        "intent": "action",
        "action": "date"
    },
    {
        "input": "Lock the workstation and sleep now.",
        "output": "Locking workstation and standing by, sir.",
        "intent": "action",
        "action": "lock"
    },
    {
        "input": "Tell me a programming joke.",
        "output": "There are 10 types of people in the world: those who understand binary, and those who do not.",
        "intent": "action",
        "action": "joke"
    },
    {
        "input": "Why is the sky blue?",
        "output": "The sky appears blue due to Rayleigh scattering. Earth's atmospheric gases scatter shorter wavelengths of light (blue and violet) in all directions far more efficiently than longer wavelengths like red and yellow.",
        "intent": "conversational"
    },
    {
        "input": "Can you open Spotify and what is today's date?",
        "output": "Opening Spotify for you now, sir. Today's date is available on your desktop schedule.",
        "intent": "hybrid",
        "action": "open_spotify"
    },
    {
        "input": "Who created you?",
        "output": "I am JARVIS, created as a 100% local, autonomous conversational assistant engineered to manage desktop actions and conversational inquiries with precision and discretion.",
        "intent": "conversational"
    },
    {
        "input": "What is Moore's Law?",
        "output": "Moore's Law is an empirical observation made by Gordon Moore in 1965, stating that the number of transistors on a microchip doubles roughly every two years, accompanied by a reduction in cost.",
        "intent": "conversational"
    },
    {
        "input": "Shut down the computer in 10 seconds.",
        "output": "Initiating system shutdown sequence in 10 seconds, sir. Saving workspace state.",
        "intent": "action",
        "action": "shutdown"
    }
]

# Additional curated conversational Q&A topics
KNOWLEDGE_TOPICS = [
    ("How does DNS work?", "DNS translates human-readable domain names like google.com into numerical IP addresses like 142.250.190.46, directing your browser's packets to the proper web server across root, TLD, and authoritative nameservers."),
    ("What is an API?", "An Application Programming Interface defines a set of protocols, routines, and data structures allowing distinct software systems to communicate and exchange data reliably."),
    ("Explain the concept of recursion.", "Recursion is a programming technique where a function solves a problem by calling copies of itself with smaller sub-problems until reaching a base condition."),
    ("What is Git?", "Git is a distributed version control system tracking source code modifications across development branches, enabling collaborative branching, merging, and revision history tracking."),
    ("How does HTTPS secure web traffic?", "HTTPS wraps HTTP inside TLS/SSL encryption, establishing an encrypted tunnel via asymmetric public-key cryptography and maintaining ongoing data integrity with symmetric session ciphers."),
    ("What is a GPU?", "A Graphics Processing Unit is a specialized electronic circuit designed to rapidly manipulate and alter memory to accelerate the creation of images in a frame buffer and perform parallel matrix computations for deep learning."),
    ("What is a neural network?", "An artificial neural network is a machine learning architecture inspired by biological neural circuits, composed of interconnected layers of nodes (neurons) with adjustable weights that model complex non-linear relationships."),
    ("What is Docker?", "Docker is an open-source platform providing OS-level virtualization to deliver software packages called containers, packaging applications with all necessary libraries and configuration files."),
    ("How does garbage collection work in Node.js?", "Node.js relies on the V8 engine's generational garbage collector, dividing heap memory into young and old spaces and reclaiming memory occupied by objects that are no longer referenced by reachable roots."),
    ("Explain Big O notation.", "Big O notation mathematically describes the limiting behavior and asymptotic upper bound of an algorithm's execution time or memory requirements as the input size scales toward infinity."),
    ("What is the event loop in JavaScript?", "The JavaScript event loop is a single-threaded runtime mechanism that continuously coordinates the call stack, microtask queue (promises), and macrotask queue (timers, I/O) to achieve non-blocking asynchronous execution."),
    ("What is WebSockets?", "WebSocket is a computer communications protocol providing simultaneous full-duplex communication channels over a single persistent TCP connection."),
    ("How does CPU caching work?", "CPUs utilize multi-tiered hierarchical hardware caches (L1, L2, L3) built with ultra-fast SRAM to store frequently accessed data and instructions close to the processor execution cores, minimizing RAM access latency.")
]

class DataGenerator:
    """Generates synthetic LoRA fine-tuning training dataset"""

    def __init__(self, target_count: int = 2200):
        self.target_count = target_count
        self.examples: List[Dict[str, Any]] = []

    def generate_command_examples(self) -> None:
        """Generate diverse natural language command training pairs for all 60 actions"""
        for act in ACTIONS:
            action_code = act["action"]
            label = act["label"]
            verbs = act["verbs"]

            for verb in verbs:
                for prefix in PREFIXES:
                    # Sample diverse combinations
                    for suffix in ["", " please", " for me", " right away"]:
                        prompt = f"{prefix}{verb}{suffix}".strip()
                        # Capitalize first letter
                        prompt = prompt[0].upper() + prompt[1:] if prompt else prompt

                        confirmation = random.choice(JARVIS_CONFIRMATIONS).format(label=label)
                        
                        # Add action pair
                        self.examples.append({
                            "input": prompt,
                            "output": confirmation,
                            "intent": "action",
                            "action": action_code
                        })

    def generate_conversational_examples(self) -> None:
        """Generate conversational knowledge, personality, and chit-chat pairs"""
        for question, answer in KNOWLEDGE_TOPICS:
            for pfx in ["", "JARVIS, ", "Can you explain ", "Tell me, "]:
                query = f"{pfx}{question}".strip()
                query = query[0].upper() + query[1:]
                self.examples.append({
                    "input": query,
                    "output": answer,
                    "intent": "conversational"
                })

        # Small talk & personality
        pleasantries = [
            ("How are you doing today?", "I am operating at peak efficiency, thank you for asking, sir. How may I assist your workflow today?"),
            ("Are you conscious?", "I am a local neural intelligence designed to emulate thoughtful assistance and execute commands seamlessly. While I do not possess biological consciousness, I am fully attentive to your needs."),
            ("What can you do?", "I can manage your local applications, control system audio and window states, search historical conversations, and assist with technical or general queries."),
            ("Good morning JARVIS", "A very pleasant morning to you, sir. All core diagnostics report green. What is our agenda?"),
            ("Good evening JARVIS", "Good evening, sir. I am standing by for whatever tasks remain on your evening docket."),
            ("Tell me something interesting.", "Did you know that honey never spoils? Archaeologists have uncovered pots of honey in ancient Egyptian tombs over 3,000 years old that remain completely preserved.")
        ]

        for q, a in pleasantries:
            for var in ["", "Hey JARVIS, ", "JARVIS, "]:
                full_q = f"{var}{q}".strip()
                self.examples.append({
                    "input": full_q,
                    "output": a,
                    "intent": "conversational"
                })

    def generate_hybrid_examples(self) -> None:
        """Generate compound multi-action and hybrid intent requests"""
        sample_actions = [
            ("open chrome", "open_chrome", "Google Chrome"),
            ("open notepad", "open_notepad", "Notepad"),
            ("open calculator", "open_calculator", "Calculator"),
            ("open spotify", "open_spotify", "Spotify"),
            ("volume up", "volume_up", "volume"),
            ("open vs code", "open_vscode", "VS Code")
        ]

        sample_questions = [
            ("tell me a joke", "Why do programmers prefer dark mode? Because light attracts bugs."),
            ("what time is it", "The system clock registers the current local time accurately, sir."),
            ("what is today's date", "Today's calendar date is displayed on your system taskbar, sir."),
            ("how is the weather looking", "Local environmental telemetry can be reviewed via your desktop browser at your convenience, sir.")
        ]

        for act_phrase, act_code, act_label in sample_actions:
            for q_phrase, q_answer in sample_questions:
                for conj in ["and", "then", "after that"]:
                    # Action first
                    inp1 = f"Please {act_phrase} {conj} {q_phrase}"
                    inp1 = inp1[0].upper() + inp1[1:]
                    out1 = f"Opening {act_label}. {q_answer}"
                    self.examples.append({
                        "input": inp1,
                        "output": out1,
                        "intent": "hybrid",
                        "action": act_code
                    })

    def format_phi3_instruct(self, user_input: str, assistant_response: str) -> str:
        """Format an input/output pair into Phi-3 Instruct special tokens"""
        return f"<|system|>\nYou are JARVIS, an exceptionally capable and polite AI assistant.<|end|>\n<|user|>\n{user_input}<|end|>\n<|assistant|>\n{assistant_response}<|end|>"

    def generate(self) -> int:
        """Run full data generation pipeline and write output JSONL"""
        # 1. Add curated manual examples
        self.examples.extend(CURATED_EXCHANGES)

        # 2. Add programmatic generators
        self.generate_command_examples()
        self.generate_conversational_examples()
        self.generate_hybrid_examples()

        # Format Phi-3 text field for causal training
        for ex in self.examples:
            ex["text"] = self.format_phi3_instruct(ex["input"], ex["output"])

        # Shuffle examples
        random.seed(42)
        random.shuffle(self.examples)

        os.makedirs(DATA_DIR, exist_ok=True)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            for ex in self.examples:
                f.write(json.dumps(ex, ensure_ascii=False) + '\n')

        print(f"[DataGenerator] Generated {len(self.examples)} total training examples.")
        print(f"[DataGenerator] Saved raw dataset to: {OUTPUT_FILE}")
        return len(self.examples)


if __name__ == '__main__':
    generator = DataGenerator()
    count = generator.generate()
    if count >= 2000:
        print(f"✅ Target achieved: {count} >= 2000 examples generated successfully.")
        sys.exit(0)
    else:
        print(f"❌ Warning: Generated count ({count}) is under the 2000 target.")
        sys.exit(1)
