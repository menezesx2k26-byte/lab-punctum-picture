export function prepareAudit(
  db: D1Database,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string | null,
  data?: unknown,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (
        id, actor_email, action, entity_type, entity_id, data_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorEmail,
      action,
      entityType,
      entityId,
      data === undefined ? null : JSON.stringify(data),
      new Date().toISOString(),
    );
}

export async function writeAudit(
  db: D1Database,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string | null,
  data?: unknown,
): Promise<void> {
  await prepareAudit(db, actorEmail, action, entityType, entityId, data).run();
}
