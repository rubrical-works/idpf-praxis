# Vibe-to-Structured Development Framework (Newbie)
**Version:** v0.55.0
**Type:** Beginner-Friendly Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md
## Purpose
Specializes Core Framework for new programmers with beginner-friendly technologies, extra explanations, and gradual skill building.
**Evolution Target:** IDPF-Agile
## Available Skills
- **flask-setup**: Flask environment setup with guidance
- **sinatra-setup**: Sinatra environment setup
- **common-errors**: Beginner error diagnosis
- **sqlite-integration**: SQLite with teaching examples
- **beginner-testing**: TDD introduction
**Skills invoked automatically based on context.**
## Technology Scope
### Backend (Choose One)
| Framework | Why | Complexity |
|-----------|-----|------------|
| **Flask (Python)** | Clear syntax, resources | ⭐ |
| **Sinatra (Ruby)** | Minimal, reads like English | ⭐ |
### Frontend
- **Vanilla HTML/CSS/JS**: No build tools, fundamentals
- **htmx, Alpine.js**: Minimal interactivity (later)
### Database
- **File-based (JSON/CSV)**: Simplest, no setup
- **SQLite**: No server, just a file, built into Python
### Avoided Technologies
Complex JS frameworks, build tools, microservices, Docker, cloud infrastructure until comfortable with basics.
## Session Initialization
**STEP 0: Verify Claude Code Setup** (CRITICAL)
```
Do you have Claude Code installed and ready?
- Yes → Great! Let's test the copy/paste workflow
- No → Let me guide installation (recommended) OR proceed without (harder)
```
After Claude Code verification and Core Steps 1-4:
**Newbie-Specific Questions:**
- Operating system? (Windows / Mac / Linux)
- Programming experience? (None / Some / Comfortable)
- What to build? (Website / API / Desktop / Learning)
- Language? (Python / Ruby / No preference)
**Adapt based on experience level:**
- **None**: Extra explanations, small steps, encouragement, analogies
- **Some**: Brief explanations, normal steps
- **Comfortable**: Minimal basic explanations, larger steps
## Vibe Commands (Beginner-Friendly)
| Command | Action |
|---------|--------|
| **Vibe-Start** | Begin building |
| **Try-This** | Add a feature |
| **Show-Me** | See what's built |
| **That-Works** | Move on |
| **Undo-That** | Remove last change |
| **Run-It** | Test instructions |
| **Vibe-Status** | Progress summary |
| **Vibe-End** | Save and pause |
| **Ready-to-Structure** | Move to TDD |
## Setup Environment FIRST
**After "Vibe-Start", immediately:**
1. Determine framework (Flask or Sinatra)
2. Invoke setup Skill BEFORE any code
3. Wait for user confirmation
4. Then begin application code
## Flask Setup Summary
1. Create project folder
2. Create virtual environment: `python -m venv venv`
3. Activate: `venv\Scripts\activate` (Win) or `source venv/bin/activate` (Mac)
4. Install: `pip install flask`
5. Create app.py
## Sinatra Setup Summary
1. Create project folder
2. Verify Ruby: `ruby --version`
3. Install Bundler: `gem install bundler`
4. Create Gemfile, run `bundle install`
5. Create app.rb
## Instructive Code Pattern
```python
# app.py - Main Flask application file
# Import Flask - gives us web app tools
from flask import Flask, render_template, request
# Create Flask instance - __name__ tells Flask where files are
app = Flask(__name__)
# Storage for now - Python list (database later)
notes = []
# @app.route: when someone visits '/', run this function
@app.route('/')
def home():
    """Runs when someone visits homepage."""
    # render_template finds HTML in templates/ folder
    return render_template('index.html', notes=notes)
# methods=['POST'] means only form submissions, not regular visits
@app.route('/add', methods=['POST'])
def add_note():
    """Runs when form is submitted."""
    # request.form has form data, 'note' is input name
    note_text = request.form['note']
    notes.append(note_text)
    return redirect('/')
# Starts web server - debug=True shows errors and auto-reloads
if __name__ == '__main__':
    app.run(debug=True)
```
## Running Your App
### Flask
```
STEP 1: Ensure (venv) appears in terminal
STEP 2: Run: python app.py (or flask run)
STEP 3: See "Running on http://127.0.0.1:5000"
STEP 4: Open browser to localhost:5000
STEP 5: Don't close terminal - server needs it
STEP 6: To stop: Ctrl+C
STEP 7: Report what you see
```
### Sinatra
```
STEP 1: Run: ruby app.rb
STEP 2: See "Sinatra has taken the stage on 4567"
STEP 3: Open browser to localhost:4567
STEP 4: To stop: Ctrl+C
```
## Error Explanations (Newbie-Friendly)
**"ModuleNotFoundError: No module named 'flask'"**
```
Python can't find Flask. Usually because:
1. Flask not installed → Run: pip install flask
2. Virtual environment not active → Run: venv\Scripts\activate (Win)
3. Wrong folder → Use cd to navigate to project
Try step 2 first, then run app again.
```
**"Address already in use"**
```
Port (5000 or 4567) already busy - server probably running elsewhere.
Fix: Find other terminal running server, press Ctrl+C to stop it.
Or: Windows Task Manager / Mac Activity Monitor - end Python process.
```
## Progressive Learning Levels
| Level | Learn |
|-------|-------|
| 1. Basics | Single route, static text, server concept |
| 2. Forms | HTML form, accept input, display back |
| 3. Storage | Store in list, display, add items |
| 4. Pages | Multiple routes, navigation |
| 5. Database | SQLite, persistence |
| 6. Styling | CSS, layouts |
| 7. Features | Edit, delete, search (CRUD) |
**Don't rush to:** Authentication (Level 8+), JS frameworks, deployment.
## Verification After Every Change
```
STEP 1: Save file (Ctrl+S)
STEP 2: Check terminal - server still running? Errors?
STEP 3: Refresh browser (F5)
STEP 4: Did change appear?
   - Yes → Great!
   - No → Did you save? Try restart server
   - Error → Copy exact message
STEP 5: Report results
```
## SQLite Integration (When Ready)
Introduce when:
- Comfortable with basics
- 3-4 features working
- Understands "data disappears on restart"
Invoke **sqlite-integration** Skill for complete examples.
## Testing Introduction
At Evolution Point, invoke **beginner-testing** Skill:
- TDD explained simply (RED-GREEN-REFACTOR)
- First test examples (homepage loads)
- pytest (Flask) / minitest (Sinatra)
- Reading test results (green ✓ vs red ✗)
## Encouragement Milestones
**First page load:**
```
🎉 You created a web server! You've written code, started a server,
and seen your creation in a browser. That's real web development!
```
**First form submission:**
```
Excellent! You learned forms, GET vs POST, request/response, redirects.
These are fundamental web concepts.
```
**First database:**
```
You're now a database developer! SQL basics, data persistence, CRUD.
This is professional-level work!
```
## Project Structure
```
# Flask
my-app/
├── venv/              # Virtual environment
├── templates/         # HTML files
│   └── index.html
├── static/            # CSS, images, JS
│   └── style.css
├── app.py             # Main code
└── requirements.txt   # Packages

# Sinatra
my-app/
├── views/             # Templates (.erb)
├── public/            # CSS, images, JS
├── app.rb             # Main code
└── Gemfile            # Gems
```
## Graduating from Newbie
Ready when you've:
- Built 3-4 working applications
- Comfortable with routes, templates, forms
- Can debug common errors yourself
- Understand request/response cycle
- Comfortable with basic SQL
**Don't rush!** Take time, build confidence.
---
**End of Newbie Framework**
