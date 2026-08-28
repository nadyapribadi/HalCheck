// Shared across auth, RBAC, and every route -- one definition of "role",
// matching docs/06_erd.md's IDENTITY.role enum and the exact string values
// chaincode's cid.AssertAttributeValue checks against.
export const ROLES = [
  "ingredient_qa",
  "production_qa",
  "compliance_officer",
  "export_officer",
  "brand_owner",
  "system_admin",
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export interface AuthenticatedUser {
  userId: number;
  username: string;
  role: Role;
  personaName: string;
  fabricIdentity: string;
}
