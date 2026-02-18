import { createHash } from "node:crypto";
import { Pool } from "pg";
let pool = null;
export function getDbConfig() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || databaseUrl.trim().length === 0) {
        throw new Error("Missing required environment variable DATABASE_URL.");
    }
    return { databaseUrl };
}
function getPool() {
    if (pool) {
        return pool;
    }
    const { databaseUrl } = getDbConfig();
    pool = new Pool({
        connectionString: databaseUrl,
    });
    return pool;
}
function buildDedupHash(input) {
    const normalizedNote = input.note ?? "";
    const normalizedReportedBy = input.reportedBy ?? "";
    return createHash("sha256")
        .update(`${input.studentId}|${input.from}|${input.to}|${input.reason}|${normalizedNote}|${normalizedReportedBy}`, "utf8")
        .digest("hex");
}
function mapRow(row) {
    return {
        id: row.id,
        studentId: row.student_id,
        from: row.from_at.toISOString(),
        to: row.to_at.toISOString(),
        reason: row.reason,
        note: row.note,
        reportedBy: row.reported_by,
        idempotencyKey: row.idempotency_key,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}
export async function checkDbConnection() {
    await getPool().query("SELECT 1");
    return { ok: true };
}
export async function createAbsenceEvent(input) {
    const currentPool = getPool();
    const dedupHash = buildDedupHash(input);
    if (input.idempotencyKey && input.idempotencyKey.trim().length > 0) {
        const insertWithIdempotency = await currentPool.query(`
      INSERT INTO absence_events (
        student_id,
        from_at,
        to_at,
        reason,
        note,
        reported_by,
        idempotency_key,
        dedup_hash
      )
      VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6, $7, $8)
      ON CONFLICT ON CONSTRAINT uq_absence_events_student_idempotency_key
      DO NOTHING
      RETURNING
        id,
        student_id,
        from_at,
        to_at,
        reason,
        note,
        reported_by,
        idempotency_key,
        created_at,
        updated_at
      `, [
            input.studentId,
            input.from,
            input.to,
            input.reason,
            input.note ?? null,
            input.reportedBy ?? null,
            input.idempotencyKey,
            dedupHash,
        ]);
        if (insertWithIdempotency.rows.length > 0) {
            return mapRow(insertWithIdempotency.rows[0]);
        }
        const existing = await currentPool.query(`
      SELECT
        id,
        student_id,
        from_at,
        to_at,
        reason,
        note,
        reported_by,
        idempotency_key,
        created_at,
        updated_at
      FROM absence_events
      WHERE student_id = $1 AND idempotency_key = $2
      LIMIT 1
      `, [input.studentId, input.idempotencyKey]);
        if (existing.rows.length === 0) {
            throw new Error("Idempotency conflict occurred but existing row could not be loaded.");
        }
        return mapRow(existing.rows[0]);
    }
    const insertWithDedup = await currentPool.query(`
    INSERT INTO absence_events (
      student_id,
      from_at,
      to_at,
      reason,
      note,
      reported_by,
      idempotency_key,
      dedup_hash
    )
    VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6, NULL, $7)
    ON CONFLICT ON CONSTRAINT uq_absence_events_student_dedup_hash
    DO NOTHING
    RETURNING
      id,
      student_id,
      from_at,
      to_at,
      reason,
      note,
      reported_by,
      idempotency_key,
      created_at,
      updated_at
    `, [
        input.studentId,
        input.from,
        input.to,
        input.reason,
        input.note ?? null,
        input.reportedBy ?? null,
        dedupHash,
    ]);
    if (insertWithDedup.rows.length > 0) {
        return mapRow(insertWithDedup.rows[0]);
    }
    const existingByDedup = await currentPool.query(`
    SELECT
      id,
      student_id,
      from_at,
      to_at,
      reason,
      note,
      reported_by,
      idempotency_key,
      created_at,
      updated_at
    FROM absence_events
    WHERE student_id = $1 AND dedup_hash = $2
    LIMIT 1
    `, [input.studentId, dedupHash]);
    if (existingByDedup.rows.length === 0) {
        throw new Error("Deduplication conflict occurred but existing row could not be loaded.");
    }
    return mapRow(existingByDedup.rows[0]);
}
export async function listAbsenceEvents(input) {
    const result = await getPool().query(`
    SELECT
      id,
      student_id,
      from_at,
      to_at,
      reason,
      note,
      reported_by,
      idempotency_key,
      created_at,
      updated_at
    FROM absence_events
    WHERE student_id = $1
      AND from_at >= $2::timestamptz
      AND to_at <= $3::timestamptz
    ORDER BY from_at ASC, to_at ASC
    `, [input.studentId, input.from, input.to]);
    return result.rows.map(mapRow);
}
export async function closeDb() {
    if (!pool) {
        return;
    }
    await pool.end();
    pool = null;
}
