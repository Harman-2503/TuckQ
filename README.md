# TuckQ

TuckQ is a school tuck shop operating system for TISB. It includes separate
student, operator, POS, and admin workflows in one hosted app.

Live site:
https://tuckq-tisb-shop.monicamiglani1980.chatgpt.site

## Features

- Student login with ID and password
- Same-day slot booking between 3:45 PM and 4:45 PM
- Slot cancellation and queue ticket generation
- Student pre-ordering with online bill viewing and download
- POS billing by student ID, with automatic student name lookup
- Daily purchase limit of Rs 280 per student
- Student account view with daily, weekly, monthly, and item-level bills
- Operator controls for opening and closing the tuck shop
- Admin student login creation/import flow
- Day-wise menu management, including everyday chips items
- Downloadable reports for sales, students, and billing
- Email receipt/warning flow through the hosted `/api/mail` endpoint
- Cloudflare D1-backed state persistence on the hosted Site

## Demo Access

Use these seeded accounts for presentation and testing:

- Student: `TISB1042` / `student1042`
- Operator: `STAFF01` / `staff123`
- Admin: `ADMIN01` / `admin123`

## Email Setup

The hosted version sends email through Resend when these production environment
variables are configured in Sites:

- `MAIL_MODE=live`
- `RESEND_API_KEY`
- `MAIL_FROM`

The app records all mail attempts in the `mail_outbox` D1 table. If mail is not
configured, messages are saved as drafts instead of being sent.

For a real school sender address, verify the school's sending domain in Resend
and update `MAIL_FROM` to that verified address.

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

Role mapping supports Microsoft app roles, email allowlists, or group IDs:

- Admin: `TuckQ.Admin` / `admin`, `AZURE_ADMIN_EMAILS`, or `AZURE_ADMIN_GROUP_IDS`
- Teacher: `TuckQ.Teacher` / `teacher`, `AZURE_TEACHER_EMAILS`, or `AZURE_TEACHER_GROUP_IDS`
- Operator: `TuckQ.Operator` / `operator`, `AZURE_OPERATOR_EMAILS`, or `AZURE_OPERATOR_GROUP_IDS`
- Student: default role for signed-in school users

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

## Project Shape

- `public/tuckq.html`: production TuckQ interface
- `app/page.tsx`: hosts the TuckQ interface
- `app/api/state/route.ts`: D1-backed app state persistence
- `app/api/mail/route.ts`: email sending and outbox persistence
- `app/api/tuckq/route.ts`: TuckQ API surface
- `drizzle/`: database migrations
- `.openai/hosting.json`: Sites hosting configuration

## Notes

This repository is configured for the existing public Sites deployment. Do not
commit `.env` files or private API keys.
