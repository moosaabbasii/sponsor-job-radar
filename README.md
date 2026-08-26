# Sponsor Job Radar

A local-first job tracker for finding recent openings at employers with historical H-1B sponsorship evidence.

It keeps a company universe sourced from the MyVisaJobs FY2025 IT/Math H-1B LCA report, maps companies to public ATS job boards, and presents openings in a simple local dashboard.

> H-1B LCA volume is historical evidence only. It does not guarantee that a current role sponsors a visa. Always confirm requirements in the employer's posting.

## Features

- 100 imported IT/Math H-1B employer leads with FY2025 filing volume
- Public job-board collectors for Greenhouse, Lever, and Ashby
- Search by keyword, employer, remote status, and first-seen date
- Tracks first seen, last seen, source update time, and closed jobs
- Add public ATS board tokens through the dashboard
- Stores data locally in `data/store.json`

## Run locally

Requirements: [Node.js](https://nodejs.org/) 20 or newer.

```powershell
cd "C:\path\to\Recent Job system"
npm start
```

Open [http://localhost:3000](http://localhost:3000).

There are no package dependencies to install.

## Add a company feed

1. Open the dashboard and choose **Add company**.
2. Choose the company’s public ATS: Greenhouse, Lever, or Ashby.
3. Enter its public board token (the identifier in the hosted job-board URL).
4. Click **Refresh all sources**.

Only public job-board feeds are supported. Do not add credentials or attempt to bypass a careers site's access controls.

## Data model

The application distinguishes three dates:

- **Source posting/update time** — when the ATS provides one.
- **First seen** — when this tracker first discovered the job.
- **Last seen** — when the job was most recently present in its source feed.

This means the “new” label accurately means new to your tracker, rather than claiming a job was newly posted by the employer.

## Project structure

```text
server.mjs          HTTP server, job collectors, and API
public/             Dashboard HTML, CSS, and browser logic
data/store.json     Local runtime database (ignored by Git)
```

## Limitations and next steps

- Workday needs a company-specific connector because public career sites vary.
- The initial H-1B universe is not automatically mapped to ATS boards yet.
- Refresh is manual in this MVP; scheduled refresh and notifications are natural next additions.

## Sources

- [MyVisaJobs H-1B IT/Math employer report](https://www.myvisajobs.com/reports/h1b/occupation/it-math-15/)
- [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html)
- [Ashby public job-posting API](https://developers.ashbyhq.com/docs/public-job-posting-api)

## License

No license has been selected yet. Add one before sharing or accepting contributions.
