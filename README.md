# TuckQ

TuckQ is a school tuck shop operating system for TISB. It includes separate
student, operator, POS, and admin workflows in one hosted app.

Live site:
https://tuckq-tisb-shop.monicamiglani1980.chatgpt.site

## Features

- Student login with ID and password
- Same-day slot booking between 3:45 PM and 4:45 PM
- Admin-configurable day-wise opening and closing times, followed automatically by the live queue
- Slot cancellation and queue ticket generation
- Student pre-ordering with online bill viewing and download
- POS billing by student ID, with automatic student name lookup
- Daily purchase limit of Rs 280 per student
- Student account view with daily, weekly, monthly, and item-level bills
- Operator controls for manual opening/closing, with the admin timetable resuming automatically
- Admin student login creation/import flow with reusable Excel/CSV URL sync
- Paged admin roster and login views with inline student editing
- Admin-created POS PIN access for tuck shop counter staff
- Day-wise menu management, including everyday chips items
- Downloadable reports for sales, students, and billing
- Optional bill email flow through the hosted `/api/mail` endpoint, triggered only when a user clicks Email Bill
- Cloudflare D1-backed state persistence on the hosted Site
- Structured database tables for students, sales, sale items, queue, bookings,
  preorders, menu items, mail events, and settings

## Launch Access

The production launch build ships with only one local admin account:

- Admin: `ADMIN01` / `admin123`

Students must be imported or created by Admin before they can use password
login. POS staff must use a POS PIN created by Admin. Teacher/staff SSO access
should be assigned through Microsoft Entra roles.

## Email Setup

The hosted version sends email through Resend when these production environment
variables are configured in Sites:

- `MAIL_MODE=live`
- `RESEND_API_KEY`
- `MAIL_FROM`

The app records manual bill email attempts in the `mail_outbox` D1 table. If mail is not
configured, messages are saved as drafts instead of being sent.

For a real school sender address, verify the school's sending domain in Resend
and update `MAIL_FROM` to that verified address.

## Database

TuckQ uses Cloudflare D1, a SQLite-compatible hosted database that is already
attached to the Sites deployment. This is the best free fit for the current app
because there is no separate server, no extra database account, and the data is
available from the Sites database viewer.

The app keeps the original full-state backup in `tuckq_state` and mirrors the
same data into proper operational tables:

- `tuckq_students`
- `tuckq_catalogue`
- `tuckq_queue`
- `tuckq_bookings`
- `tuckq_sales`
- `tuckq_sale_items`
- `tuckq_preorders`
- `tuckq_mail_events`
- `tuckq_settings`

Other free database options considered:

- Supabase: good free Postgres, but adds another external account/service.
- Neon: good free serverless Postgres, but adds another external account/service.
- MySQL providers: usable, but less natural for this Cloudflare-hosted app.

For this version, D1 gives the fastest and cleanest working production database.

## Azure SSO Setup

The app includes Microsoft Entra ID / Azure sign-in. Keep the redirect URI in
Azure as:

```text
https://tuckq-tisb-shop.monicamiglani1980.chatgpt.site/api/auth/azure/callback
```

Configure these production environment variables in Sites:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET` for confidential web-app registrations, optional for PKCE public-client setups
- `AZURE_SESSION_SECRET` with a long random value
- `AZURE_REDIRECT_URI` if the final domain changes

Role mapping supports Microsoft app roles, email allowlists, or group IDs.
The button a person clicks does not grant access; it only starts sign-in.
After Microsoft confirms the user, TuckQ assigns the highest matching role in
this order: Admin, POS Operator, Teacher, then Student.

- Admin: `TuckQ.Admin` / `admin`, `AZURE_ADMIN_EMAILS`, or `AZURE_ADMIN_GROUP_IDS`
- Operator: `TuckQ.Operator` / `operator`, `AZURE_OPERATOR_EMAILS`, or `AZURE_OPERATOR_GROUP_IDS`
- Teacher: `TuckQ.Teacher` / `teacher`, `AZURE_TEACHER_EMAILS`, or `AZURE_TEACHER_GROUP_IDS`
- Student: default role for signed-in school users

Recommended school setup:

1. In Microsoft Entra, create app roles named `TuckQ.Admin`,
   `TuckQ.Operator`, and `TuckQ.Teacher`.
2. Assign those app roles only to the correct staff members or security groups.
3. Leave students without any TuckQ staff role. They automatically enter the
   Student portal.
4. Use `AZURE_ADMIN_EMAILS`, `AZURE_OPERATOR_EMAILS`, and
   `AZURE_TEACHER_EMAILS` only for emergency/manual overrides.
5. If using group IDs instead of app roles, put the Entra object IDs in
   `AZURE_ADMIN_GROUP_IDS`, `AZURE_OPERATOR_GROUP_IDS`, and
   `AZURE_TEACHER_GROUP_IDS`.

Students whose Azure email starts with their school ID, such as
`tisb1042@tisb.ac.in`, are matched automatically to the same TuckQ student
account.

## Local Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

## Build And Test

```bash
npm test
```

This builds the production bundle and runs a rendered HTML smoke test.

## Cloudflare Deployment

For the school-owned Cloudflare/GitHub launch process, use:

```text
CLOUDFLARE_DEPLOYMENT.md
```

That guide covers GitHub setup, D1 database creation, migrations, Cloudflare
build commands, Azure SSO variables, custom domain setup, and launch checks.

## Project Shape

- `public/tuckq.html`: production TuckQ interface
- `app/page.tsx`: hosts the TuckQ interface
- `app/api/state/route.ts`: D1-backed app state persistence
- `app/api/mail/route.ts`: email sending and outbox persistence
- `app/api/tuckq/route.ts`: TuckQ API surface
- `drizzle/`: database migrations
- `.openai/hosting.json`: current preview Sites hosting configuration
- `CLOUDFLARE_DEPLOYMENT.md`: school Cloudflare deployment guide
- `scripts/prepare-cloudflare-deploy.mjs`: patches the built Worker config with the real D1 database ID before Cloudflare deploy

## Notes

This repository is configured for the existing public Sites deployment. Do not
commit `.env` files or private API keys.
