# Running Google Apps Script (Job Feed) — full guide

The Job Feed (`assets/job-feed.gs`, section 5e) runs on Google's servers every hour, for free, even when the computer is off. Claude prepares the code; the user pastes it and approves it once. Claude cannot press buttons in the Apps Script editor for them.

## 0. What Claude prepares first
1. Create an empty Google Sheet with the Google Drive connector (title e.g. "Job Feed"). Its ID is the long part of the URL between `/d/` and `/edit`.
2. Fill the placeholders in a copy of `assets/job-feed.gs`:
   - `{{SHEET_ID}}` = that ID;
   - `{{SENDERS}}` = the job sender domains, quoted and comma-separated (`'comeet.co', 'greenhouse.io'`), taken from the dashboard's `gmail_unread` filter.
3. Give the user the whole file in one piece (as a file, or copied to their clipboard), never in parts. Tell them the first two lines they should see, so they can check they pasted the right file.

## 1. Create the project (the user, once)
1. Open **https://script.google.com** → **New project**.
2. Rename it at the top (e.g. "Job Feed").
3. Delete the sample `function myFunction() {}` in `Code.gs`, paste the whole file, press **Save** (Ctrl+S).
4. If the project has more than one file, add each with **+** next to "Files" → **Script**, with the exact name you gave, and paste each into its own tab. Pasting into the wrong tab is the most common mistake; check the first lines of each tab.

## 2. Run the setup once and approve
1. In the toolbar, choose the function **`setup`** from the list next to **Run**, and press **Run**.
2. Google asks for permission: **Review permissions** → choose the account → "Google hasn't verified this app" → **Advanced** → **Go to Job Feed (unsafe)** → **Allow**. This warning appears for every personal script; it is the user's own code in the user's own account.
3. `setup` creates the hourly trigger and the sheet tabs. Check **Triggers** (the clock icon on the left): one `runFeed` trigger, "Hour timer".

Only functions without a trailing underscore appear in the Run list. Names ending in `_` (like `sheet_`) are private helpers and cannot be run from the editor; that is on purpose.

## 3. Check that it works
- **Executions** (the list icon on the left) shows every run, its time and any error.
- Open the Sheet: the tabs `מיילים`, `משרות`, `סטטוס` fill up after the first run. `סטטוס` shows the last run time.
- To run it right now instead of waiting an hour, choose `runFeed` and press **Run**.

## 4. Optional settings
- **Gemini key** (lead scoring): Project Settings → Script Properties → `GEMINI_KEY` (see `references/gemini-setup.md`, step 3).
- **Google services** such as Google Tasks or Calendar: left panel **Services** → **+** → pick the service (e.g. "Tasks API") → **Add**. Without this, code that uses the service fails with "Tasks is not defined".
- **Time zone**: Project Settings → Time zone, so trigger times match the user's day.

## 5. Updating the code later
1. Claude edits the file and hands over the whole new version, with its first two lines.
2. The user opens the project, selects all in the right tab (Ctrl+A), pastes, saves.
3. Triggers stay as they are; no need to run `setup` again unless Claude says the trigger list changed.
4. To confirm what is really in the project, Claude can export it with the Google Drive connector (`download_file_content` on the script's file id with export type `application/vnd.google-apps.script+json`) and compare it with the local copy.

## 6. Troubleshooting
| What you see | Fix |
|---|---|
| "Exception: You do not have permission to call …" | Run `setup` again and approve the new permission (new code asked for a new service) |
| "ReferenceError: Tasks is not defined" (or Calendar, Drive …) | Add the service under **Services** (section 4) |
| "Exception: Service invoked too many times for one day" | A daily Google quota (Gmail reads, UrlFetch) ran out; it resets the next day. Lower the lookback or the number of threads per run |
| A function is missing from the Run list | Its name ends in `_` (private), or the file has a syntax error: check the red marks in the editor |
| Runs stop after "Exceeded maximum execution time" | Each run may last 6 minutes; the feed saves its place and continues next hour |
| The Sheet stays empty | Check Executions for errors; confirm `SHEET_ID` is the Sheet's ID and the account that runs the script can open it |
| Two copies of every row | `setup` was run twice and created two triggers: delete one under Triggers |

## 7. Stopping it
Triggers → the three dots on the `runFeed` trigger → **Delete trigger**. Nothing runs after that; the Sheet and the code stay.

## Safety
The feed only reads mail, labels threads and writes to the user's own Sheet. It never sends, deletes or archives email, and stores no phone numbers or personal names. Script Properties hold the only secret (the optional Gemini key).
