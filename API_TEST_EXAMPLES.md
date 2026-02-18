# API Test Examples

Use these PowerShell-friendly commands to quickly demo different API outcomes.

## PowerShell note

Avoid Bash-style `\` continuation. Use one-line commands or PowerShell variables.

## Prerequisite (PowerShell)

```powershell
docker compose up --build
```

## 1) Health check (200)

```powershell
curl.exe -i http://localhost:3000/health
```

Expected: `HTTP/1.1 200 OK` and body containing `{"status":"ok"}`.

## 2) Create valid event (201)

```powershell
$body = '{"from":"2026-02-10T08:30:00.000Z","to":"2026-02-10T12:00:00.000Z","reason":"sick","note":"fever","reportedBy":"user:test","idempotencyKey":"demo-1"}'; curl.exe -i -X POST "http://localhost:3000/v1/students/student-demo/absence-events" -H "Content-Type: application/json" -d "$body"
```

Expected: `HTTP/1.1 201 Created` and JSON with `id`, `studentId`, `from`, `to`, `reason`, timestamps.

## 3) Retry same request (idempotency behavior)

```powershell
$body = '{"from":"2026-02-10T08:30:00.000Z","to":"2026-02-10T12:00:00.000Z","reason":"sick","note":"fever","reportedBy":"user:test","idempotencyKey":"demo-1"}'; curl.exe -i -X POST "http://localhost:3000/v1/students/student-demo/absence-events" -H "Content-Type: application/json" -d "$body"
```

Expected (current implementation): same event returned again. Status is still `201` in current code.

## 4) Invalid reason (400)

```powershell
$body = '{"from":"2026-02-10T08:30:00.000Z","to":"2026-02-10T12:00:00.000Z","reason":"holiday"}'; curl.exe -i -X POST "http://localhost:3000/v1/students/student-demo/absence-events" -H "Content-Type: application/json" -d "$body"
```

Expected: `HTTP/1.1 400 Bad Request` with `error.code = "VALIDATION_ERROR"`.

## 5) Invalid datetime format (400)

```powershell
$body = '{"from":"not-a-date","to":"2026-02-10T12:00:00.000Z","reason":"sick"}'; curl.exe -i -X POST "http://localhost:3000/v1/students/student-demo/absence-events" -H "Content-Type: application/json" -d "$body"
```

Expected: `HTTP/1.1 400 Bad Request` with `error.code = "VALIDATION_ERROR"`.

## 6) List valid range (200)

```powershell
curl.exe -i "http://localhost:3000/v1/students/student-demo/absence-events?from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.000Z"
```

Expected: `HTTP/1.1 200 OK` and `items` array.

## 7) Invalid list range (400)

```powershell
curl.exe -i "http://localhost:3000/v1/students/student-demo/absence-events?from=2026-02-28T23:59:59.000Z&to=2026-02-01T00:00:00.000Z"
```

Expected: `HTTP/1.1 400 Bad Request` with `error.code = "VALIDATION_ERROR"`.

## 8) Unknown route (404)

```powershell
curl.exe -i http://localhost:3000/does-not-exist
```

Expected: `HTTP/1.1 404 Not Found` with error object containing `code = "NOT_FOUND"`.
