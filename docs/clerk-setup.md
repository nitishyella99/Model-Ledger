# Clerk setup and rollout

ModelLedger uses personal Clerk accounts and native Supabase third-party authentication. Every project and its related records are private to the owner. There are no shared organizations or automatic legacy-data claims.

## Required configuration

1. Create a Clerk application. Enable public sign-up and email/password authentication in the Clerk dashboard. Configure production domains and callback URLs for your deployment before production rollout.
2. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `.env.local` and the deployment environment. Copy the routing settings from `.env.example`. Keep the secret key server-only. Missing keys stop the app; there is no anonymous fallback.
3. Activate the Supabase integration in Clerk, copy the Clerk instance domain, and add it as a Clerk third-party provider in Supabase's Authentication provider settings. Configure the matching development/production instance for each environment. Use native session tokens, not a legacy JWT template.
4. Keep the existing Supabase URL and public anon key. Application requests use that key plus the signed-in user's Clerk token; they never use a service-role key.

Official integration instructions: [Clerk and Supabase](https://clerk.com/docs/guides/development/integrations/databases/supabase).

## Coordinated deployment

1. Back up the existing database using your Supabase backup/export tooling and verify that the backup is recoverable. Pause public access to the old anonymous app during rollout.
2. Configure Clerk and Supabase as above. Apply all pending migrations in timestamp order, ending with `20261002090000_clerk_project_ownership.sql`. Do not rerun old demo-policy migrations after the ownership migration.
3. Deploy the matching application revision with Clerk keys. Restart local development after changing environment variables.
4. Run `npm test`, `npm run lint`, `npm run type-check`, and `npm run build`. The automated ownership test uses an isolated embedded PostgreSQL database and does not touch production.
5. In the configured preview, create two accounts. Each should start empty, create a project, import cases, edit a version, run an evaluation, inspect memory, and export a report. Try opening the other account's project/version/report IDs and modifying form IDs: no data should be exposed or changed. Check logout, expired sessions, return-to-page login, profile management, and an unauthenticated export (401). Check direct Supabase requests with each user's real token as well as the anon key.
6. Restore public traffic only after these checks pass. Monitor authentication failures, RLS denials, and evaluation persistence errors. If rollback is needed, retain the ownership policies; never restore anonymous database access.

## Existing data

The migration adds ownership without backfilling existing projects. Their `owner_user_id` remains null and no account can access them. Their versions, reports, tests, and project memory are preserved. A database administrator can later assign selected projects to an explicitly verified Clerk user ID using privileged SQL; no claim endpoint is exposed. Never assign all records to the first registrant. Seed data also remains unassigned when run without a Clerk token.

Deleting a Clerk account does not delete project data. It remains inaccessible under that user ID; data retention and account deletion cleanup are administrative operations.

The repository migration and automated tests do not configure hosted Clerk/Supabase, back up production, or deploy the app. Those operations require access to the respective dashboards.
