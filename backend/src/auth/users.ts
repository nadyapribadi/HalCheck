import { pool } from "../db/pool.js";
import { isRole, type AuthenticatedUser } from "../types.js";

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  persona_name: string;
  fabric_identity: string;
}

export async function findUserByUsername(
  username: string,
): Promise<(AuthenticatedUser & { passwordHash: string }) | undefined> {
  const result = await pool.query<UserRow>(
    `SELECT id, username, password_hash, role, persona_name, fabric_identity
     FROM users WHERE username = $1`,
    [username],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  if (!isRole(row.role)) {
    throw new Error(`user ${username} has an unrecognized role in the database: ${row.role}`);
  }
  return {
    userId: row.id,
    username: row.username,
    role: row.role,
    personaName: row.persona_name,
    fabricIdentity: row.fabric_identity,
    passwordHash: row.password_hash,
  };
}
