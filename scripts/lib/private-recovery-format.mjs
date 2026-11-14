export const RECOVERY_TABLES = Object.freeze(["client_accounts", "client_galleries", "client_gallery_images", "client_gallery_upload_intents", "client_gallery_favorites"]);
export function recoverySelection(clientIds) {
  if (!clientIds.length || clientIds.length > 20 || new Set(clientIds).size !== clientIds.length || clientIds.some((id) => !/^[a-f0-9-]{36}$/i.test(id)))
    throw new Error("Explicit client scope required");
  const marks = clientIds.map(() => "?").join(",");
  return {
    client_accounts: `SELECT * FROM client_accounts WHERE id IN (${marks})`,
    client_galleries: `SELECT * FROM client_galleries WHERE client_id IN (${marks})`,
    client_gallery_images: `SELECT i.* FROM client_gallery_images i JOIN client_galleries g ON g.id=i.gallery_id WHERE g.client_id IN (${marks})`,
    client_gallery_upload_intents: `SELECT i.* FROM client_gallery_upload_intents i JOIN client_galleries g ON g.id=i.gallery_id WHERE g.client_id IN (${marks})`,
    client_gallery_favorites: `SELECT * FROM client_gallery_favorites WHERE client_id IN (${marks})`,
  };
}
export function recoveryInsert(table, source) {
  if (!RECOVERY_TABLES.includes(table)) throw new Error("Invalid recovery table");
  const row = { ...source };
  if (table === "client_accounts") {
    if (!Number.isSafeInteger(row.session_version) || row.session_version < 1 || row.session_version >= Number.MAX_SAFE_INTEGER)
      throw new Error("Invalid recovery session version");
    row.session_version++;
    // Quarantine is mandatory; increment alone can collide with a post-backup session.
    row.disabled_at = new Date().toISOString();
  }
  const columns = Object.keys(row);
  if (!columns.length || columns.some((c) => !/^[a-z_]+$/.test(c))) throw new Error("Invalid recovery column");
  return { sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`, params: columns.map((c) => row[c]) };
}
