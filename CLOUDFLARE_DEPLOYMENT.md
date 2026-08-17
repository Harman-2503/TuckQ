# TuckQ Cloudflare Deployment Guide

This repository is ready to deploy TuckQ to a school-owned Cloudflare account.
Use this when moving from the temporary preview URL to the final school domain.

## 1. Create The GitHub Repository

Push this project to GitHub, for example:

```bash
git remote add origin https://github.com/Harman-2503/TuckQ.git
git push -u origin main
```

Do not commit `.env` files, API keys, Azure secrets, or Cloudflare tokens.

## 2. Create The Cloudflare D1 Database

In the Cloudflare dashboard:

1. Go to **Workers & Pages**.
2. Open **D1 SQL Database**.
3. Create a database named `tuckq-db`.
4. Copy the database ID.

Save these values for the deploy environment:

```text
CLOUDFLARE_D1_DATABASE_NAME=tuckq-db
CLOUDFLARE_D1_DATABASE_ID=<database id from Cloudflare>
```

## 3. Apply Database Tables

Run each migration file against the production D1 database, in order:

```bash
npx wrangler d1 execute tuckq-db --remote --file=drizzle/0000_tuckq_state.sql
npx wrangler d1 execute tuckq-db --remote --file=drizzle/0001_tuckq_operating_tables.sql
npx wrangler d1 execute tuckq-db --remote --file=drizzle/0002_tuckq_student_card_uid.sql
npx wrangler d1 execute tuckq-db --remote --file=drizzle/0003_tuckq_catalogue_purchase_limit.sql
```

Cloudflare login is required before running these commands:

```bash
npx wrangler login
```

## 4. Configure Cloudflare Build

In Cloudflare, create a Workers project connected to the GitHub repository.

Use these build settings:

```text
Install command: npm ci
Build command: npm run build && node scripts/prepare-cloudflare-deploy.mjs
Deploy command: cd dist/server && npx wrangler deploy --config wrangler.json
Output directory: dist/client
Node version: 22.13.0 or newer
```

If Cloudflare asks for only one command, use:

```bash
npm ci && npm run build && node scripts/prepare-cloudflare-deploy.mjs && cd dist/server && npx wrangler deploy --config wrangler.json
```

## 5. Set Cloudflare Environment Variables

Set these as Cloudflare build/runtime environment variables:

```text
CLOUDFLARE_WORKER_NAME=tuckq
CLOUDFLARE_D1_DATABASE_NAME=tuckq-db
CLOUDFLARE_D1_DATABASE_ID=<database id>
```

For Microsoft SSO:

```text
AZURE_TENANT_ID=<tenant id>
AZURE_CLIENT_ID=<client id>
AZURE_CLIENT_SECRET=<client secret>
AZURE_SESSION_SECRET=<long random string>
AZURE_REDIRECT_URI=https://tuckq.yourschool.edu/api/auth/azure/callback
```

For roles, use app roles or these fallback allowlists:

```text
AZURE_ADMIN_EMAILS=
AZURE_OPERATOR_EMAILS=
AZURE_TEACHER_EMAILS=
AZURE_ADMIN_GROUP_IDS=
AZURE_OPERATOR_GROUP_IDS=
AZURE_TEACHER_GROUP_IDS=
```

For manual bill email sending:

```text
MAIL_MODE=draft
RESEND_API_KEY=
MAIL_FROM=TuckQ <tuckq@yourschool.edu>
```

Change `MAIL_MODE` to `live` only after the school sender domain is verified
with the email provider.

## 6. Configure Microsoft Entra ID

In Microsoft Entra ID:

1. Create an App Registration named `TuckQ`.
2. Add this redirect URI:

```text
https://tuckq.yourschool.edu/api/auth/azure/callback
```

3. Create app roles:

```text
TuckQ.Admin
TuckQ.Operator
TuckQ.Teacher
```

4. Assign those roles only to approved staff.
5. Leave students without staff roles; they enter as Student.

## 7. Connect The School Domain

Recommended final URL:

```text
https://tuckq.yourschool.edu
```

If the domain is on GoDaddy, school IT can either:

- keep DNS on GoDaddy and add a CNAME for `tuckq`, or
- move DNS nameservers to Cloudflare and manage the subdomain there.

The record normally looks like:

```text
Type: CNAME
Name: tuckq
Target: <Cloudflare worker/pages hostname>
Proxy: On
```

After the domain changes, update the Azure redirect URI and
`AZURE_REDIRECT_URI` to the final school domain.

## 8. Student Master Sync

Use a SharePoint/OneDrive Excel or CSV file with these columns:

```text
Student ID, Name, Email, Class, Card UID, Limit, Status
```

Admin can paste the published CSV/Excel URL in TuckQ and enable auto-sync.
NFC card taps in POS should provide the same `Card UID` stored in this file.

## 9. Local Verification

Before deploying:

```bash
npm install
npm test
```

For a Cloudflare deploy dry run:

```bash
CLOUDFLARE_D1_DATABASE_ID=<database id> npm run deploy:cloudflare:dry
```

For production deploy from local:

```bash
CLOUDFLARE_D1_DATABASE_ID=<database id> npm run deploy:cloudflare
```

## 10. Launch Checklist

- GitHub repo is private or school-approved public.
- Cloudflare D1 database exists.
- Migrations are applied.
- Azure SSO variables are set.
- Staff roles are assigned in Entra.
- Student Excel/CSV sync URL is ready.
- Final domain points to Cloudflare.
- `npm test` passes.
- Admin logs in and creates POS PINs.
- POS can bill by student ID/card UID.
- Student bill view/download works.
- Manual email stays draft until school sender approval is complete.
