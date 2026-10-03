import "server-only";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type AppDatabase = SqliteDatabase;
export type Status = {
  id: string;
  name: string;
  color: string;
  position: number;
  isDefault: boolean;
  isClosed: boolean;
  applicationCount: number;
};
export type TimelineEvent = {
  id: string;
  applicationId: string;
  type: string;
  message: string;
  createdAt: string;
};
export type Application = {
  id: string;
  company: string;
  role: string;
  location: string;
  url: string;
  statusId: string;
  statusName: string;
  statusColor: string;
  appliedAt: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  events?: TimelineEvent[];
};
export type ApplicationInput = {
  company: string;
  role: string;
  location?: string;
  url?: string | null;
  statusId: string;
  appliedAt: string;
};
export type ApplicationPatch = Partial<ApplicationInput>;

const defaultStatuses = [
  ["wishlist", "Wishlist", "#82968A", 0, 0],
  ["applied", "Applied", "#587A9C", 0, 0],
  ["screening", "Screening", "#9B7CB1", 0, 0],
  ["interview", "Interview", "#C28B40", 0, 0],
  ["offer", "Offer", "#528264", 0, 0],
  ["rejected", "Rejected", "#B96B65", 1, 1],
  ["withdrawn", "Withdrawn", "#919894", 1, 1],
] as const;

export function openDatabase(
  filename = process.env.APPLYLEDGER_DB_PATH ||
    path.join(process.cwd(), "data", "applyledger.sqlite"),
): AppDatabase {
  if (filename !== ":memory:")
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (filename !== ":memory:") db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS statuses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      is_closed INTEGER NOT NULL DEFAULT 0 CHECK (is_closed IN (0, 1)),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      status_id TEXT NOT NULL REFERENCES statuses(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      applied_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN ('created', 'status', 'note', 'import')),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS applications_status_date_idx ON applications(status_id, applied_at DESC);
    CREATE INDEX IF NOT EXISTS applications_company_role_idx ON applications(company, role);
    CREATE INDEX IF NOT EXISTS events_application_date_idx ON timeline_events(application_id, created_at DESC);
  `);
  const count = (
    db.prepare("SELECT COUNT(*) AS count FROM statuses").get() as {
      count: number;
    }
  ).count;
  if (count === 0) {
    const insert = db.prepare(
      "INSERT INTO statuses (id, name, color, position, is_default, is_closed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const now = new Date().toISOString();
    const seed = db.transaction(() =>
      defaultStatuses.forEach(([id, name, color, , isClosed], position) =>
        insert.run(id, name, color, position, 1, isClosed, now),
      ),
    );
    seed();
  }
  return db;
}

let sharedDatabase: AppDatabase | undefined;

export function getDatabase(): AppDatabase {
  if (!sharedDatabase) sharedDatabase = openDatabase();
  return sharedDatabase;
}

export function closeSharedDatabase() {
  sharedDatabase?.close();
  sharedDatabase = undefined;
}

export function listStatuses(db: AppDatabase = getDatabase()): Status[] {
  return (
    db
      .prepare(
        `SELECT s.id, s.name, s.color, s.position, s.is_default AS isDefault, s.is_closed AS isClosed, COUNT(a.id) AS applicationCount
    FROM statuses s LEFT JOIN applications a ON a.status_id = s.id GROUP BY s.id ORDER BY s.position, s.name`,
      )
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    color: String(row.color),
    position: Number(row.position),
    isDefault: Boolean(row.isDefault),
    isClosed: Boolean(row.isClosed),
    applicationCount: Number(row.applicationCount),
  }));
}

export function listApplications(
  db: AppDatabase = getDatabase(),
): Application[] {
  return (
    db
      .prepare(
        `SELECT a.*, s.name AS status_name, s.color AS status_color,
      COALESCE((SELECT MAX(e.created_at) FROM timeline_events e WHERE e.application_id = a.id), a.updated_at) AS last_activity_at
    FROM applications a JOIN statuses s ON s.id = a.status_id
    ORDER BY a.applied_at DESC, a.created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>
  ).map(toApplication);
}

export function getApplication(
  id: string,
  db: AppDatabase = getDatabase(),
): Application | null {
  const row = db
    .prepare(
      `SELECT a.*, s.name AS status_name, s.color AS status_color,
      COALESCE((SELECT MAX(e.created_at) FROM timeline_events e WHERE e.application_id = a.id), a.updated_at) AS last_activity_at
    FROM applications a JOIN statuses s ON s.id = a.status_id WHERE a.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const events = db
    .prepare(
      "SELECT id, application_id AS applicationId, event_type AS type, message, created_at AS createdAt FROM timeline_events WHERE application_id = ? ORDER BY created_at DESC, rowid DESC",
    )
    .all(id) as TimelineEvent[];
  return { ...toApplication(row), events };
}

function toApplication(row: Record<string, unknown>): Application {
  return {
    id: String(row.id),
    company: String(row.company),
    role: String(row.role),
    location: String(row.location),
    url: String(row.url),
    statusId: String(row.status_id),
    statusName: String(row.status_name),
    statusColor: String(row.status_color),
    appliedAt: String(row.applied_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastActivityAt: String(row.last_activity_at),
  };
}

function addEvent(
  db: AppDatabase,
  applicationId: string,
  type: TimelineEvent["type"],
  message: string,
  createdAt = new Date().toISOString(),
) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO timeline_events (id, application_id, event_type, message, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, applicationId, type, message, createdAt);
  return id;
}

export function createApplication(
  input: ApplicationInput,
  db: AppDatabase = getDatabase(),
): Application {
  const now = new Date().toISOString();
  const id = randomUUID();
  const status = db
    .prepare("SELECT name FROM statuses WHERE id = ?")
    .get(input.statusId) as { name: string } | undefined;
  if (!status) throw new Error("Choose an existing status.");
  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO applications (id, company, role, location, url, status_id, applied_at, created_at, updated_at)
      VALUES (@id, @company, @role, @location, @url, @statusId, @appliedAt, @now, @now)`,
    ).run({
      id,
      company: input.company.trim(),
      role: input.role.trim(),
      location: input.location?.trim() ?? "",
      url: input.url ?? "",
      statusId: input.statusId,
      appliedAt: input.appliedAt,
      now,
    });
    addEvent(db, id, "created", `Added to ${status.name}.`, now);
  });
  insert();
  return getApplication(id, db)!;
}

export function updateApplication(
  id: string,
  patch: ApplicationPatch,
  db: AppDatabase = getDatabase(),
): Application | null {
  const current = getApplication(id, db);
  if (!current) return null;
  const next = {
    company: patch.company?.trim() ?? current.company,
    role: patch.role?.trim() ?? current.role,
    location: patch.location?.trim() ?? current.location,
    url: patch.url === undefined ? current.url : (patch.url ?? ""),
    statusId: patch.statusId ?? current.statusId,
    appliedAt: patch.appliedAt ?? current.appliedAt,
  };
  const nextStatus = listStatuses(db).find(
    (status) => status.id === next.statusId,
  );
  if (!nextStatus) throw new Error("Choose an existing status.");
  const now = new Date().toISOString();
  const update = db.transaction(() => {
    db.prepare(
      "UPDATE applications SET company = ?, role = ?, location = ?, url = ?, status_id = ?, applied_at = ?, updated_at = ? WHERE id = ?",
    ).run(
      next.company,
      next.role,
      next.location,
      next.url,
      next.statusId,
      next.appliedAt,
      now,
      id,
    );
    if (next.statusId !== current.statusId)
      addEvent(
        db,
        id,
        "status",
        `Moved from ${current.statusName} to ${nextStatus.name}.`,
        now,
      );
  });
  update();
  return getApplication(id, db);
}

export function deleteApplication(
  id: string,
  db: AppDatabase = getDatabase(),
): boolean {
  return (
    db.prepare("DELETE FROM applications WHERE id = ?").run(id).changes > 0
  );
}

export function addNote(
  id: string,
  message: string,
  db: AppDatabase = getDatabase(),
): TimelineEvent | null {
  if (!getApplication(id, db)) return null;
  const now = new Date().toISOString();
  const eventId = addEvent(db, id, "note", message.trim(), now);
  return db
    .prepare(
      "SELECT id, application_id AS applicationId, event_type AS type, message, created_at AS createdAt FROM timeline_events WHERE id = ?",
    )
    .get(eventId) as TimelineEvent;
}

export function createStatus(
  input: { name: string; color: string; isClosed: boolean },
  db: AppDatabase = getDatabase(),
): Status {
  const position =
    (
      db
        .prepare("SELECT COALESCE(MAX(position), -1) AS position FROM statuses")
        .get() as { position: number }
    ).position + 1;
  const status = {
    id: randomUUID(),
    name: input.name.trim(),
    color: input.color,
    position,
    isDefault: false,
    isClosed: input.isClosed,
    applicationCount: 0,
  };
  db.prepare(
    "INSERT INTO statuses (id, name, color, position, is_default, is_closed, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
  ).run(
    status.id,
    status.name,
    status.color,
    position,
    Number(status.isClosed),
    new Date().toISOString(),
  );
  return status;
}

export function updateStatus(
  id: string,
  patch: { name?: string; color?: string; isClosed?: boolean },
  db: AppDatabase = getDatabase(),
): Status | null {
  const current = listStatuses(db).find((status) => status.id === id);
  if (!current) return null;
  const next = {
    ...current,
    name: patch.name?.trim() ?? current.name,
    color: patch.color ?? current.color,
    isClosed: patch.isClosed ?? current.isClosed,
  };
  db.prepare(
    "UPDATE statuses SET name = ?, color = ?, is_closed = ? WHERE id = ?",
  ).run(next.name, next.color, Number(next.isClosed), id);
  return listStatuses(db).find((status) => status.id === id) ?? null;
}

export function deleteStatus(
  id: string,
  db: AppDatabase = getDatabase(),
): boolean {
  const status = listStatuses(db).find((item) => item.id === id);
  if (!status) return false;
  if (status.isDefault) throw new Error("Built-in statuses cannot be deleted.");
  if (status.applicationCount > 0)
    throw new Error("Move applications out of this status before deleting it.");
  db.prepare("DELETE FROM statuses WHERE id = ?").run(id);
  return true;
}

export function snapshot(db: AppDatabase = getDatabase()) {
  const statuses = listStatuses(db);
  const applications = listApplications(db);
  const terminalIds = new Set(
    statuses.filter((item) => item.isClosed).map((item) => item.id),
  );
  return {
    statuses,
    applications,
    summary: {
      total: applications.length,
      active: applications.filter((item) => !terminalIds.has(item.statusId))
        .length,
      interviews: applications.filter((item) =>
        /interview/i.test(item.statusName),
      ).length,
      offers: applications.filter(
        (item) =>
          /offer/i.test(item.statusName) && !terminalIds.has(item.statusId),
      ).length,
    },
  };
}
