import { LumibaseError } from '../lumibase/errors';
import type { MigrationContext } from './context';

const ROLES_COLLECTION = 'directus_roles';
const PERMISSIONS_COLLECTION = 'directus_permissions';

/**
 * Migrate roles then permissions. Like flows, Lumibase exposes no role/permission CRUD
 * in the SDK, so definitions are written as items into `directus_roles` /
 * `directus_permissions` collections, preserving them for reconciliation. Permission
 * rows reference a role id, which is rewritten through the id-map after roles are synced.
 * Fails soft on missing collections (404).
 */
export async function migratePermissions(ctx: MigrationContext): Promise<void> {
  const { source, lumibase, state, log } = ctx;

  // Roles first, so permission.role can be remapped.
  const roles = await source.listRoles();
  for (const role of roles) {
    const directusId = String(role.id);
    const { id: _drop, ...payload } = role as unknown as Record<string, unknown>;
    const existing = state.getLumibaseId(ROLES_COLLECTION, directusId);
    try {
      if (existing) await lumibase.updateOne(ROLES_COLLECTION, existing, payload);
      else {
        const created = await lumibase.createOne(ROLES_COLLECTION, payload);
        if (created.id != null) state.setLumibaseId(ROLES_COLLECTION, directusId, String(created.id));
      }
    } catch (err) {
      if (err instanceof LumibaseError && err.isNotFound) {
        log.warn(`permissions: collection "${ROLES_COLLECTION}" not found — skipping roles+permissions.`);
        return;
      }
      throw err;
    }
  }

  const permissions = await source.listPermissions();
  for (const perm of permissions) {
    const directusId = String(perm.id);
    const { id: _drop, role, ...rest } = perm as unknown as Record<string, unknown>;
    // Remap the role FK to the Lumibase role id when known (public perms have null role).
    const mappedRole = role ? (state.getLumibaseId(ROLES_COLLECTION, String(role)) ?? role) : null;
    const payload: Record<string, unknown> = { ...rest, role: mappedRole };
    const existing = state.getLumibaseId(PERMISSIONS_COLLECTION, directusId);
    try {
      if (existing) await lumibase.updateOne(PERMISSIONS_COLLECTION, existing, payload);
      else {
        const created = await lumibase.createOne(PERMISSIONS_COLLECTION, payload);
        if (created.id != null)
          state.setLumibaseId(PERMISSIONS_COLLECTION, directusId, String(created.id));
      }
    } catch (err) {
      if (err instanceof LumibaseError && err.isNotFound) {
        log.warn(`permissions: collection "${PERMISSIONS_COLLECTION}" not found — skipping.`);
        return;
      }
      throw err;
    }
  }

  log.info(`permissions: synced ${roles.length} role(s), ${permissions.length} permission(s)`);
}
