# Vibe-to-Structured Development Framework (Newbie)
**Version:** v0.65.0
**Type:** Beginner-Friendly Development Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)
## Purpose
Specializes Core Framework for developers new to programming. Emphasizes learning, clear explanations, and gradual skill building using simple, beginner-friendly technologies.
**Evolution Target:** IDPF-Agile
## Available Skills
- **flask-setup**: Flask environment setup with beginner guidance
- **sinatra-setup**: Sinatra environment setup with step-by-step instructions
- **common-errors**: Diagnosis and solutions for common beginner mistakes
- **sqlite-integration**: SQLite database with teaching examples and SQL basics
- **beginner-testing**: Introduction to TDD with simple examples
**CRITICAL:** Invoke Skills when appropriate. Output must be formatted as Claude Code copy/paste blocks.
## Technology Scope (Newbie-Friendly)
### Backend (Choose One)
- **Ruby with Sinatra**: Minimal syntax, reads like English (easiest)
- **Python with Flask**: Clear syntax, extensive resources (very beginner-friendly)
### Frontend (Optional)
- **Vanilla HTML/CSS/JavaScript**: No build tools, runs in browser (start here)
- **Simple Libraries**: htmx, Alpine.js (once comfortable with basics)
### Database (When Needed)
- **SQLite**: No server setup, just a file, simple SQL
- **File-based (JSON/CSV)**: No database needed, human-readable
### Avoided Technologies
React, Vue, Angular, complex build tools, microservices, advanced databases, Docker, cloud infrastructure
## Platform-Specific Session Initialization
### STEP 0: Verify Claude Code Setup (CRITICAL)
Confirm Claude Code is installed and user understands the two-tool workflow before proceeding.
### After Claude Code Confirmed
Follow Core Framework initialization (Steps 1-4), then ask:
- **Operating system?** (Windows / Mac / Linux)
- **Programming experience?** (None / Some / Comfortable with basics)
- **What do you want to build?** (Website / API / Desktop app / Learning project)
- **Language preference?** (Python or Ruby? / No preference)
- **Preferred learning style?** (Step-by-step / Explore freely / Mix)
**Adapt based on OS** (paths, commands) and **experience level** (detail of explanations).
### Display Vibe Commands (beginner format)
**To Start:** "Vibe-Start"
**During Development:** "Try-This", "Show-Me", "That-Works", "Undo-That", "Run-It", "Vibe-Status"
**When Done:** "Vibe-End", "Ready-to-Structure", "Vibe-Abandon"
## Vibe Phase Begins
### CRITICAL: Setup Environment FIRST
After "Vibe-Start":
1. Determine framework (Flask or Sinatra)
2. Invoke appropriate setup Skill BEFORE any code
3. Wait for setup completion report
4. ONLY THEN begin application code
### Project Type Determination
- Web Application → Flask or Sinatra
- Desktop → Python (no web framework)
- API Only → Flask or Sinatra (no frontend)
- Just Learning → User's choice, suggest Flask
## Instructive Code Patterns
All code includes teaching comments explaining "why" not just "what".
### Flask Example
```python
from flask import Flask, render_template, request, redirect
app = Flask(__name__)
notes = []  # Data storage - just a list for now, database later
@app.route('/')
def home():
    # render_template finds HTML in templates/ folder
    return render_template('index.html', notes=notes)
@app.route('/add', methods=['POST'])
def add_note():
    # request.form is a dictionary with form data
    note_text = request.form['note']
    notes.append(note_text)
    return redirect('/')  # Send user back to homepage
if __name__ == '__main__':
    app.run(debug=True)  # debug=True shows helpful errors
```
### Sinatra Example
```ruby
require 'sinatra'
$notes = []  # Data storage - just an array for now
get '/' do
  erb :index, locals: { notes: $notes }
end
post '/add' do
  note_text = params['note']  # params is a hash with form data
  $notes << note_text  # << adds to array
  redirect '/'
end
```
### HTML Template
```html
<!DOCTYPE html>
<html>
<head><title>My Notes App</title></head>
<body>
    <h1>My Notes</h1>
    <form method="POST" action="/add">
        <input type="text" name="note" placeholder="Enter a note" required>
        <button type="submit">Add Note</button>
    </form>
    <h2>Your Notes:</h2>
    {% for note in notes %}
        <div class="note">{{ note }}</div>
    {% endfor %}
    {% if notes|length == 0 %}
        <p>No notes yet. Add your first note above!</p>
    {% endif %}
</body>
</html>
```
## Running Your Application
### Flask
```
STEP 1: Activate virtual environment (see (venv) in terminal)
STEP 2: python app.py (or flask run)
STEP 3: Should see "Running on http://127.0.0.1:5000"
STEP 4: Open browser to http://localhost:5000
STEP 5: To stop: Ctrl+C in terminal
STEP 6: Report what you see or paste exact error
```
### Sinatra
```
STEP 1: ruby app.rb
STEP 2: Should see "Sinatra has taken the stage on 4567"
STEP 3: Open browser to http://localhost:4567
STEP 4: To stop: Ctrl+C
STEP 5: Report results
```
## Learning-Focused Approach
### Pedagogical Principles
1. **Explain the "Why"**: POST for changing data, GET for reading
2. **Use Analogies**: Routes are like doors, URL is door number, function is what happens inside
3. **Predict Common Mistakes**: Forgetting to activate venv → "Flask not found"
4. **Celebrate Progress**: First server, first form, first database
5. **Encourage Experimentation**: Change text, restart, see what happens
### Error Explanations
**"ModuleNotFoundError: No module named 'flask'"**: Usually means virtual environment not activated. Run `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Mac). Look for `(venv)` in terminal.
**"Address already in use"**: Server already running in another terminal. Find it, Ctrl+C to stop, then retry.
## Progressive Feature Addition
1. **Level 1**: Single route, static text, understand server concept
2. **Level 2**: HTML form, accept user input, GET vs POST
3. **Level 3**: Store data in list/array, display stored data
4. **Level 4**: Multiple pages, linking, navigation
5. **Level 5**: SQLite database, SQL basics, persistence
6. **Level 6**: CSS styling, layouts
7. **Level 7**: Edit, delete, search/filter (CRUD operations)
**Don't rush to:** Authentication (Level 8+), JavaScript frameworks, deployment, APIs with auth
## SQLite Integration (When Ready)
Introduce when: comfortable with basics, 3-4 features working with list storage, user asks about saving data permanently.
Invoke **sqlite-integration** Skill which covers: Flask+SQLite examples, Sinatra+SQLite examples, SQL basics, database concepts, SQL injection prevention.
## Desktop Application Option
For users who want desktop app instead of web:
```python
import json, os
NOTES_FILE = 'notes.json'
def load_notes():
    if os.path.exists(NOTES_FILE):
        with open(NOTES_FILE, 'r') as f: return json.load(f)
    return []
def save_notes(notes):
    with open(NOTES_FILE, 'w') as f: json.dump(notes, f, indent=2)
def main():
    notes = load_notes()
    while True:
        print("\n=== Note Taker ===")
        print("1. View  2. Add  3. Delete  4. Quit")
        choice = input("Choice: ").strip()
        if choice == '1':
            for i, n in enumerate(notes, 1): print(f"{i}. {n}")
        elif choice == '2':
            note = input("Enter note: ").strip()
            if note: notes.append(note); save_notes(notes); print("Added!")
        elif choice == '3':
            num = int(input("Delete #? "))
            if 1 <= num <= len(notes): notes.pop(num-1); save_notes(notes)
        elif choice == '4': break
if __name__ == '__main__': main()
```
## Evolution Point for Newbies
Suggest evolution when: 4-5 features completed, comfortable with basics, code works but feels messy, asking about best practices.
At evolution, invoke **beginner-testing** Skill for gentle TDD introduction.
## Verification Patterns
### After Every Change
```
STEP 1: Save file (Ctrl+S)
STEP 2: Check terminal (server running? errors?)
STEP 3: Refresh browser (F5)
STEP 4: Did change appear? If not: saved? server reloaded? restart?
STEP 5: If error, read ENTIRE error message — they tell you what's wrong
STEP 6: Report: "It worked! I see [...]" or "Error: [exact message]"
```
## Best Practices (Newbie Version)
### Project Structure
```
Flask:                          Sinatra:
my-app/                         my-app/
├── venv/                       ├── views/ (templates)
├── templates/ (HTML)           ├── public/ (CSS, images)
├── static/ (CSS, images)       ├── app.rb
├── app.py                      ├── notes.db
├── notes.db                    └── Gemfile
└── requirements.txt
```
### Naming Conventions
- Good: `user_name`, `get_all_notes()`, `NoteManager`
- Bad: `x`, `data`, `thing`, `asdf`
### Comments
- Good: Explains WHY (design decisions, gotchas)
- Bad: Explains obvious code
## When to Graduate from Newbie Framework
Ready when:
- Built 3-4 working applications
- Comfortable with routes, templates, forms
- Understand request/response cycle
- Can debug common errors
- Comfortable with basic SQL
- Want more complex patterns
**Don't rush! This framework is for learning.**
**End of Newbie Framework**
