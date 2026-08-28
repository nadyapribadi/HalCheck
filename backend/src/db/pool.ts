// The one shared Postgres connection pool. Always connects as the
// restricted halcheck_app role (db/init/002_app_role.sh) via DATABASE_URL
// -- SELECT-only on users, INSERT+SELECT-only on audit_log. The app itself
// has no path to a more privileged role; user provisioning happens out of
// band (backend/scripts/seed-users.ts), never through the running server.
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const pool = new pg.Pool({ connectionString: DATABASE_URL });
