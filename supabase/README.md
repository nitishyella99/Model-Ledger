# ModelLedger Supabase Setup

Configure Clerk as a native third-party authentication provider before using this app. See [Clerk setup and rollout](../docs/clerk-setup.md).

Apply every migration in timestamp order. The final ownership migration removes all demo policies, denies anonymous access, and restricts each application table to the project owner. Legacy projects remain unassigned.

If `20261002090000_clerk_project_ownership.sql` reports that `owner_user_id` already exists, use the updated migration in this repository and rerun the entire file. It reuses the existing text column, preserves assigned owners and project data, and safely replaces its policies, functions, and triggers. Do not delete the column or clear its values. An existing column with a different type requires inspection before migration; it is not converted automatically.

The app uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY with Clerk session tokens. Never put a service-role key in browser-facing configuration.
