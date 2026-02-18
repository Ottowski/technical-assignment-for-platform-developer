import { createServer, IncomingMessage, ServerResponse } from "http";
import { createAbsenceEvent, listAbsenceEvents } from "./db.js";

const port = Number(process.env.PORT ?? 3000);
const allowedReasons = new Set(["sick", "vacation", "other"]);

type AbsenceCreateBody = {
  from?: unknown;
  to?: unknown;
  reason?: unknown;
  note?: unknown;
  reportedBy?: unknown;
  idempotencyKey?: unknown;
};

type ValidatedAbsenceCreateBody = {
  from: string;
  to: string;
  reason: "sick" | "vacation" | "other";
  note?: string;
  reportedBy?: string;
  idempotencyKey?: string;
};

type ValidationIssue = {
  field: string;
  message: string;
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function isIsoDatetime(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) {
    throw new Error("Request body is required.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function validateCreateBody(payload: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [{ field: "body", message: "Body must be a JSON object." }];
  }

  const body = payload as AbsenceCreateBody;

  if (typeof body.from !== "string" || !isIsoDatetime(body.from)) {
    issues.push({ field: "from", message: "from must be an ISO-8601 datetime (UTC, e.g. 2026-02-02T08:30:00.000Z)." });
  }

  if (typeof body.to !== "string" || !isIsoDatetime(body.to)) {
    issues.push({ field: "to", message: "to must be an ISO-8601 datetime (UTC, e.g. 2026-02-02T12:00:00.000Z)." });
  }

  if (typeof body.from === "string" && typeof body.to === "string" && isIsoDatetime(body.from) && isIsoDatetime(body.to)) {
    if (new Date(body.to).getTime() <= new Date(body.from).getTime()) {
      issues.push({ field: "to", message: "to must be after from." });
    }
  }

  if (typeof body.reason !== "string" || !allowedReasons.has(body.reason)) {
    issues.push({ field: "reason", message: "reason must be one of: sick, vacation, other." });
  }

  if (body.note !== undefined && typeof body.note !== "string") {
    issues.push({ field: "note", message: "note must be a string when provided." });
  }

  if (body.reportedBy !== undefined && typeof body.reportedBy !== "string") {
    issues.push({ field: "reportedBy", message: "reportedBy must be a string when provided." });
  }

  if (body.idempotencyKey !== undefined && typeof body.idempotencyKey !== "string") {
    issues.push({ field: "idempotencyKey", message: "idempotencyKey must be a string when provided." });
  }

  return issues;
}

function validateListQuery(url: URL): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from) {
    issues.push({ field: "from", message: "from query parameter is required." });
  } else if (!isIsoDatetime(from)) {
    issues.push({ field: "from", message: "from must be an ISO-8601 datetime (UTC, e.g. 2026-02-02T08:30:00.000Z)." });
  }

  if (!to) {
    issues.push({ field: "to", message: "to query parameter is required." });
  } else if (!isIsoDatetime(to)) {
    issues.push({ field: "to", message: "to must be an ISO-8601 datetime (UTC, e.g. 2026-02-02T12:00:00.000Z)." });
  }

  if (from && to && isIsoDatetime(from) && isIsoDatetime(to)) {
    if (new Date(to).getTime() <= new Date(from).getTime()) {
      issues.push({ field: "to", message: "to must be after from." });
    }
  }

  return issues;
}

function getStudentId(urlPathname: string): string | null {
  const match = urlPathname.match(/^\/v1\/students\/([^/]+)\/absence-events$/);
  if (!match) {
    return null;
  }

  const studentId = decodeURIComponent(match[1] ?? "").trim();
  return studentId.length > 0 ? studentId : null;
}

const server = createServer((req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (method === "GET") {
    const studentId = getStudentId(url.pathname);

    if (studentId) {
      const issues = validateListQuery(url);
      if (issues.length > 0) {
        sendJson(res, 400, {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed.",
            details: issues,
          },
        });
        return;
      }

      const from = url.searchParams.get("from") as string;
      const to = url.searchParams.get("to") as string;

      void (async () => {
        try {
          const items = await listAbsenceEvents({
            studentId,
            from,
            to,
          });

          sendJson(res, 200, {
            studentId,
            items,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected database error.";
          sendJson(res, 500, {
            error: {
              code: "INTERNAL_ERROR",
              message,
            },
          });
        }
      })();

      return;
    }
  }

  if (method === "POST") {
    const studentId = getStudentId(url.pathname);

    if (studentId) {
      void (async () => {
        try {
          const payload = await readJsonBody(req);
          const issues = validateCreateBody(payload);

          if (issues.length > 0) {
            sendJson(res, 400, {
              error: {
                code: "VALIDATION_ERROR",
                message: "Request validation failed.",
                details: issues,
              },
            });
            return;
          }

          const body = payload as ValidatedAbsenceCreateBody;
          try {
            const created = await createAbsenceEvent({
              studentId,
              from: body.from,
              to: body.to,
              reason: body.reason,
              note: body.note ?? null,
              reportedBy: body.reportedBy ?? null,
              idempotencyKey: body.idempotencyKey ?? null,
            });

            sendJson(res, 201, created);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unexpected database error.";
            sendJson(res, 500, {
              error: {
                code: "INTERNAL_ERROR",
                message,
              },
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid request.";
          sendJson(res, 400, {
            error: {
              code: "BAD_REQUEST",
              message,
            },
          });
        }
      })();

      return;
    }
  }

  sendJson(res, 404, { error: { code: "NOT_FOUND", message: "Not Found" } });
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
