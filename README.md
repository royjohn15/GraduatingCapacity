# Graduating Capacity

A web app for the department's graduating capacity report, hosted on GitHub Pages. All the data lives in
a Google Sheet, and every change made in the app is written to that Sheet straight away.

```
GitHub Pages (index.html, no data)  <->  Apps Script (Code.gs, in the Sheet)  <->  Google Sheet
```

The public page contains no student data. It shows only a connect screen until someone enters the script
link and passcode.

## First-time setup (about 15 minutes, one time only)

### 1. Prepare your existing data

```bash
python3 tools/build_initial_data.py
```

This writes `private/initial_data.json` (68 faculty, 187 graduated scholars, 202 current scholars).
It contains student data and is kept out of Git.

### 2. Create the Google Sheet and its script

1. Go to [sheets.new](https://sheets.new) and name the Sheet, for example `Graduating Capacity`.
2. Open **Extensions > Apps Script**. Delete what is there and paste in all of `apps-script/Code.gs`.
3. Change `CHANGE-ME` on the `PASSCODE` line to a passcode of your own, at least 8 characters.
   Do this only in Google's editor. **Never put the real passcode in the GitHub copy of the file.**
4. Click **Deploy > New deployment**, click the gear, and choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy** and allow access. If Google says the app isn't verified, choose
   **Advanced > Go to (project name)**: it is your own script.
6. Copy the **Web app URL**, which ends in `/exec`, and put it in `config.js`.

"Anyone" means the script can be reached without a Google login. It still refuses every request without the
passcode, and the Sheet itself stays private to you.

If your institute's Google account does not offer "Anyone", create the Sheet from a personal Google account.

### 3. Put the app on GitHub Pages

The `.gitignore` keeps the Excel files, `private/`, the old `GraduatingCapacity.html` and the tests out of the repo.
Create an empty repository on GitHub, then:

```bash
git init -b main
git add .
git status        # check: no .xlsx, .json or GraduatingCapacity.html in the list
git commit -m "Graduating Capacity app"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

On GitHub, open **Settings > Pages**, set Source to **Deploy from a branch**, and choose **main** and **/ (root)**.
The app appears at `https://YOUR-USERNAME.github.io/YOUR-REPO/` after a minute or two.

### 4. Connect and import

1. Open the app and enter the passcode. The `/exec` link comes from `config.js`, so it is never typed in.
2. It opens at **Settings & backup** and says the Sheet is empty. Click **Load data file** and choose
   `private/initial_data.json`.
3. Check the **Capacity** tab, then open the Sheet: the tabs below will be filled.

To give a colleague access, send them the app link and the passcode.

## Each admission cycle

1. Open **Admission cycle** and click **Choose .xlsx file**. **Download blank template** gives the expected layout.
2. The file needs the columns **Roll No.**, **Name of the Scholar** and **Guide**. **Co-Guide** is optional, and several
   co-guides go in one cell with a semicolon between them. Title rows above the headings are fine.
3. Read the preview. Nothing is saved yet.
   - **Names to confirm**: names that don't exactly match the Faculty tab. Check each one: likely matches are
     filled in for you, and a guide nobody recognises must be chosen or added as new faculty.
   - **Effect on each faculty member**: load before and after, with anyone going over CAP shown in red.
     This is a warning only; it does not stop the upload.
   - **Students in the file**: roll numbers already on the list, already graduated or repeated are skipped.
4. Name the cycle and click **Add ... scholars and update the Google Sheet**.

TOTAL on roll comes from the current scholars list. A sole guide gets 1 per scholar. If the scholar has any co-guide,
internal or external, the guide gets 0.5 and each department co-guide gets 0.5. External co-guides get nothing.
CAP itself depends on graduates and N1, so an admission changes TOTAL and Available slots, not CAP.

**Wrong file?** Use **Undo this cycle** in the Admission cycles table. It removes those scholars, and their load goes with them.
Any new faculty member it created stays, with 0 on roll.

When a scholar graduates, add them with **+ Graduated scholar** as usual. They leave the current list automatically.

### The 5-year and 3-year windows

IITM has two semesters a year: Jan–Jun (even) and Jul–Dec (odd). "Last 5 years" is the reference date's semester and
the 9 before it; "last 3 years" is that semester and the 5 before it. In Jul–Dec 2026 that is Jan–Jun 2022 to Jul–Dec 2026
and Jan–Jun 2024 to Jul–Dec 2026.

Each graduated scholar has a **Year of Graduation** (academic year, e.g. 2024-2025) and a **Semester of Graduation**
(`Jul-Dec` or `Jan-Jun`; Jul–Dec 2024 and Jan–Jun 2025 make up AY 2024-2025). A record with no semester is taken as
Jan–Jun of its academic year, or the current semester if that is later. It is marked *not set* in the app; pick
**Semester not set** in the year filter on the Graduated scholars tab to list them.

## The Google Sheet

| Tab | Holds | Edit by hand? |
| --- | --- | --- |
| Faculty | names, active, N1, on-roll counts | Yes, except the two On Roll columns, which the app rewrites from the Scholars tab |
| Graduated | graduated scholars, guides by name, year and semester of graduation | Yes |
| Scholars | current scholars, with their admission cycle; this list decides TOTAL on roll | Yes |
| Settings | department name, reference date, revision | Department name and reference date only |
| Capacity | the report table | No, the app rewrites it |
| Log | activity log | No |

Hand edits appear in the app when it is reopened or when you return to its browser tab. Keep the column headings,
and don't change the **ID** column. Leave ID blank on a new row and one is assigned.

If two people change data at the same moment, the second one is told, gets the latest data and repeats their change, so
nobody's changes are silently overwritten.

## Changing the script or passcode

Edit in Apps Script, then **Deploy > Manage deployments > pencil icon > Version: New version > Deploy**. The link stays
the same. Without this step the old version keeps running. After changing the passcode, everyone reconnects. A **New deployment**
instead creates a different link: put that in `config.js` and push it.

## Security

- The script link in `config.js` is public, so the passcode is the only lock on the data. Make it long and share it only with people who should have access.
- **Remember on this computer** stores the passcode in that browser. Untick it on shared computers. Other pages you host
  on the same `username.github.io` address could read it, so a separate GitHub account is safer if you host other sites there.
- Backups (`.json`) contain student details. Keep them private.

## Testing

```bash
python3 tools/build_initial_data.py && python3 tools/test_app.py
```

This drives the real page and the real `Code.gs` against a stand-in for Google Sheets, using your Excel files. It does not
contact Google. It needs `openpyxl` and `playwright`, and the private files, so it runs only on your computer.
