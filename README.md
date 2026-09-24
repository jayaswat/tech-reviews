# Tech Reviews

A small internal website for storing and analyzing customer reviews of your technicians.
Admins upload the daily Excel export; everyone on the team can browse reviews, filter by
date range, and see average ratings per technician.

## How it's organized

- Every review is stored with a full date, plus its year and month, so it can always be
  grouped or filtered by day, month, or year — the Dashboard's monthly/yearly views and
  the Reviews page's date-range filter both read from this.
- One `reviews` table holds everything (rather than separate monthly/yearly tables), which
  keeps year-over-year and cross-month analytics simple and fast. If you'd rather have data
  physically split by month/year (e.g. for export or archiving), that's a straightforward
  addition later — just say so.
- Recognized Excel columns (first/last name, job ID, star rating, technician name, address,
  contact, date, comments) are matched automatically regardless of exact header wording.
  Any other columns in your spreadsheet are still saved (as extra details per review) so
  nothing gets lost even if a column isn't one of the "known" ones.

## First-time setup

Requires [Node.js](https://nodejs.org) 18 or later.

```bash
npm run install:all
```

Then create your server config:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and set `ADMIN_USERNAME` / `ADMIN_PASSWORD` to whatever you want the
first admin login to be, and change `SESSION_SECRET` to a random string. This account is
created automatically the first time the server starts.

## Running it locally

```bash
npm run dev
```

This starts the API on `http://localhost:4000` and the website on `http://localhost:5173`.
Open `http://localhost:5173` in your browser and log in with the admin account from your
`.env` file. From there, use the "Users" page to add accounts for the rest of the team
(pick "Admin" for anyone who should be able to upload, "Viewer" for everyone else).

Data is stored in `server/data/reviews.db` (SQLite) — this file is what holds all your
reviews and accounts, so back it up periodically.

## Uploading reviews

Go to **Upload** (admin only) and choose the day's `.xlsx`, `.xls`, or `.csv` file. Column
headers can be worded flexibly (e.g. "Tech", "Technician", or "Tech Name" all work). If a
row doesn't have a date column, it's stamped with the upload date.

## Moving to a hosted server later

When you're ready to host this beyond your PC:

1. Run `npm run build` — this builds the website into `client/dist`.
2. Deploy the `server/` folder (which now also serves the built website) to your host of
   choice, along with the `client/dist` folder next to it.
3. Set real environment variables on the host (`SESSION_SECRET`, `ADMIN_USERNAME`,
   `ADMIN_PASSWORD`, `PORT`), copy over `server/data/reviews.db` if you want to keep your
   existing data, and run `npm start` from the `server/` folder.

Come back for help when you get there — moving from SQLite to a larger database, adding
HTTPS, or picking a hosting provider are all reasonable next steps depending on how many
people will use it and how much data you expect.
