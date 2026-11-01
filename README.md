# Alphabots 16026 Schedule

A team schedule site for FTC team 16026 Alphabots, laid out like a project-management tool
(top bar, left menu, calendar, Gantt timeline, task board). It is plain HTML, CSS and JavaScript:
no build step, no dependencies, and it runs on **GitHub Pages**.

## What is in it

| Page | What it does |
|------|--------------|
| **Home** | Next events and deadlines, latest news, shopping list, overall progress |
| **Calendar** | Month and week views of events, deadlines, tasks and parts due. Click a day to add an event. Download everything as an `.ics` file for Google Calendar or Apple Calendar. |
| **Gantt chart** | Tasks, deadlines and (optionally) events on a day grid. **Drag a bar to move it, drag its right edge to change the finish date.** Zoom by day, week or month, filter by sub-team, collapse groups, print. |
| **Dependencies** | In a task's form, **Waits for** lists the tasks that must finish before it can start. The Gantt chart draws an arrow from each of them (red if the order is broken). A ⚠ marks a task that starts too early, and "Fix order" pushes such tasks later. With **Move later tasks automatically** on, moving or lengthening a task pushes the tasks that wait for it later too. Tasks only ever move later and keep their length. Loops (A waits for B, B waits for A) are refused. |
| **Tasks** | List or drag-and-drop board (New, In progress, On hold, Done). Every task has **Primary** people (the leads) and **Sub-people** (helpers). Each list takes any mix of individual students and whole teams: type a name and press Enter, click a name to move it between the lists, click the × to remove it. The same people show on the Gantt chart (hover a row for the full list). |
| **Parts & Supplies** | Shopping list with quantity, vendor, part number, cost, link and needed-by date. CSV download and print. |
| **News** | Team announcements, with pinned posts |

| **Accounts** *(admin)* | Approve sign-ups, set roles, reset passwords, turn accounts off |
| **Settings** *(admin)* | Team name and number, groups, backup and restore, example items |

## Accounts and roles

There is **one admin**, the highest authority. Everyone else signs up or is added by the admin,
and **only the admin can approve an account or give it more than student rights**.

| Role | Can do |
|------|--------|
| **Admin** (exactly one) | Everything, including Accounts and Settings |
| **Mentor** | Create, edit and delete events, tasks, parts and news |
| **Team lead** | Create and edit events, tasks, parts and their own news posts. Cannot delete. |
| **Student** (lowest) | View everything. Change the status and progress of tasks where they are a primary person or sub-person, or where their team is listed. |

- The first time the site is opened in a browser, it asks you to create the admin account and
  makes **15 student accounts** (`student01` to `student15`) with temporary passwords. The
  passwords are shown once, with Print and CSV buttons. Rename the accounts under Accounts > Edit.
- People can also use **Request access** on the sign-in page. They stay locked out until the admin approves
  them. New requests are always students. The admin can promote them afterwards.
- Everyone must choose their own password the first time they sign in with a temporary one.

### Read this: what "accounts" means on a static site

GitHub Pages only hosts files. It has no server and no database, so:

- **Everything is stored in each person's own browser.** Another device or browser starts with an empty copy and
  asks to set up its own admin. Accounts, approvals and schedule items are **not shared between devices.**
- The role rules decide what the *interface* allows. Anyone who can open the browser's developer tools on their own
  device can change their own copy of the data. Passwords are hashed (salted PBKDF2) and are never stored in plain text,
  but this is **not real security.**

That makes it a good fit for **one shared computer** (a team laptop at the workshop or a projector), or for one
person (the admin) who keeps the master copy and shares it with a backup file. For logins and data that really are shared
by the whole team on their own phones and laptops, the site needs a small online backend (for example Firebase or
Supabase). The code is arranged so the storage can be swapped (see `js/store.js` and `js/auth.js`).

## Backups and moving to another device

Settings > **Export backup** downloads one JSON file with the schedule *and* the accounts. On another device, choose
**Restore a backup file** on the first screen (or Settings > Import backup). Do this regularly. Clearing a browser's site
data erases the schedule.

If the admin forgets the password, restore a backup file made earlier, or clear this site's data in the browser
and start again.

## Run it on your computer

Open `index.html` in a browser, or serve the folder with any static server, for example
`python -m http.server` and then <http://localhost:8000>.

## Put it on GitHub Pages

1. Create a free account at <https://github.com> and click **New repository**. Name it, for example,
   `alphabots-schedule`. Make it **Public** (free Pages needs that), then **Create repository**.
2. On the new repository page click **uploading an existing file**. Drag in everything inside this folder:
   `index.html`, `README.md`, `.nojekyll`, and the `css`, `js` and `assets` folders. Click **Commit changes**.
   (With git instead: `git init`, `git add .`, `git commit -m "Schedule site"`, `git remote add origin <your repo URL>`,
   `git push -u origin main`.)
3. Open **Settings > Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*,
   **Branch** to `main` and the folder to `/ (root)`. Click **Save**.
4. After a minute the page shows your address: `https://YOUR-USERNAME.github.io/alphabots-schedule/`.
   Open it, create the admin account, and hand out the student logins.

To update the site later, upload the changed files the same way. Your schedule data is in your browser, so updating the
files does not erase it.

## Files

```
index.html          page shell
css/styles.css      all styles (light and dark mode)
js/store.js         data, saving, example items, import checks
js/auth.js          accounts, passwords, roles and what each role may do
js/ui.js            small UI helpers, forms and dialogs
js/forms.js         create and edit forms
js/views-main.js    home, calendar
js/deps.js          task dependencies: order rules, loop check, automatic shifting
js/views-gantt.js   Gantt chart and dependency arrows
js/views-lists.js   tasks, parts, news, search
js/views-admin.js   accounts, settings, password dialogs
js/app.js           sign-in screens, menu, routing, exports
```

Team names, groups, event kinds and statuses are lists at the top of `js/store.js`.
