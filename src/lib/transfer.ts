import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { applicationSchema } from "./validation";
import type { AppDatabase } from "./database";
import { listStatuses } from "./database";

export type Backup = {
  format: "applyledger";
  version: 1;
  exportedAt?: string;
  statuses: Array<Record<string, unknown>>;
  applications: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
};

export function exportBackup(db: AppDatabase) {
  const statuses = db
    .prepare(
      "SELECT id, name, color, position, is_default AS isDefault, is_closed AS isClosed FROM statuses ORDER BY position",
    )
    .all();
  const applications = db
    .prepare(
      `SELECT a.id, a.company, a.role, a.location, a.url, a.status_id AS statusId, s.name AS statusName,
    a.applied_at AS appliedAt, a.created_at AS createdAt, a.updated_at AS updatedAt
    FROM applications a JOIN statuses s ON s.id = a.status_id ORDER BY a.applied_at DESC`,
    )
    .all();
  const events = db
    .prepare(
      "SELECT id, application_id AS applicationId, event_type AS type, message, created_at AS createdAt FROM timeline_events ORDER BY created_at",
    )
    .all();
  return {
    format: "applyledger",
    version: 1,
    exportedAt: new Date().toISOString(),
    statuses,
    applications,
    events,
  };
}

const text = (value: unknown, max = 1000) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const dateOnly = (value: unknown) => {
  const raw = text(value, 30);
  if (!raw) return new Date().toISOString().slice(0, 10);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d\d-\d\d$/.test(raw) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== raw
  )
    throw new Error("Invalid application date in import.");
  return raw;
};

const timestamp = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
};

export function parseCsv(source: string): Array<Record<string, string>> {
  const rows = parse(source, {
    bom: true,
    skip_empty_lines: true,
    max_record_size: 200_000,
  }) as string[][];
  const header = (rows.shift() ?? []).map((value) =>
    value.trim().toLowerCase(),
  );
  if (
    !header.includes("company") ||
    !header.includes("role") ||
    header.some((value) => !value) ||
    new Set(header).size !== header.length
  )
    throw new Error(
      "CSV needs unique non-empty headers including company and role.",
    );
  if (rows.length > 50_000) throw new Error("CSV exceeds 50,000 records.");
  return rows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) =>
      Object.fromEntries(
        header.map((key, index) => [key, values[index] ?? ""]),
      ),
    );
}

function csvCell(input: unknown): string {
  let value = String(input ?? "").replace(/\0/g, "");
  if (/^[\s]*[=+\-@]/.test(value)) value = `'${value}`;
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function exportCsv(db: AppDatabase): string {
  const records = db
    .prepare(
      `SELECT a.id, a.company, a.role, s.name AS status, a.applied_at AS appliedAt, a.location, a.url,
    (SELECT e.message FROM timeline_events e WHERE e.application_id = a.id AND e.event_type = 'note' ORDER BY e.created_at DESC LIMIT 1) AS latestNote
    FROM applications a JOIN statuses s ON s.id = a.status_id ORDER BY a.applied_at DESC`,
    )
    .all() as Array<Record<string, unknown>>;
  const columns = [
    "id",
    "company",
    "role",
    "status",
    "appliedAt",
    "location",
    "url",
    "latestNote",
  ];
  return (
    [
      columns.join(","),
      ...records.map((record) =>
        columns.map((column) => csvCell(record[column])).join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}

export function importCsv(
  records: Array<Record<string, string>>,
  db: AppDatabase,
) {
  let imported = 0;
  let duplicates = 0;
  const statusesByName = new Map(
    listStatuses(db).map((status) => [
      status.name.toLocaleLowerCase(),
      status.id,
    ]),
  );
  const run = db.transaction(() => {
    let position = (
      db
        .prepare("SELECT COALESCE(MAX(position), -1) AS position FROM statuses")
        .get() as { position: number }
    ).position;
    const createStatus = db.prepare(
      "INSERT INTO statuses (id, name, color, position, is_default, is_closed, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)",
    );
    const insertApp = db.prepare(
      "INSERT INTO applications (id, company, role, location, url, status_id, applied_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertEvent = db.prepare(
      "INSERT INTO timeline_events (id, application_id, event_type, message, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    const now = new Date().toISOString();
    for (const record of records) {
      const company = text(record.company, 160);
      const role = text(record.role, 160);
      if (!company || !role) continue;
      const sourceId = text(record.id, 100);
      if (
        sourceId &&
        db.prepare("SELECT 1 FROM applications WHERE id = ?").get(sourceId)
      ) {
        duplicates += 1;
        continue;
      }
      const statusName = text(record.status, 40) || "Wishlist";
      let statusId = statusesByName.get(statusName.toLocaleLowerCase());
      if (!statusId) {
        statusId = randomUUID();
        createStatus.run(statusId, statusName, "#75877A", ++position, now);
        statusesByName.set(statusName.toLocaleLowerCase(), statusId);
      }
      const id = sourceId || randomUUID();
      const fields = applicationSchema.parse({
        company,
        role,
        location: record.location ?? "",
        url: record.url ?? "",
        statusId,
        appliedAt: dateOnly(record.appliedat),
      });
      const appliedAt = fields.appliedAt;
      const createdAt = timestamp(now);
      insertApp.run(
        id,
        fields.company,
        fields.role,
        fields.location,
        fields.url,
        statusId,
        appliedAt,
        createdAt,
        createdAt,
      );
      const note = text(record.latestnote, 2000);
      insertEvent.run(
        randomUUID(),
        id,
        "import",
        note
          ? `Imported. Previous note: ${note}`
          : `Imported from CSV into ${statusName}.`,
        createdAt,
      );
      imported += 1;
    }
  });
  run();
  return { imported, duplicates };
}

export function importBackup(input: Backup, db: AppDatabase) {
  if (
    input.format !== "applyledger" ||
    input.version !== 1 ||
    !Array.isArray(input.applications)
  )
    throw new Error("Choose an ApplyLedger version 1 JSON backup.");
  let imported = 0;
  let duplicates = 0;
  const currentStatuses = listStatuses(db);
  const statusMap = new Map<string, string>();
  const statusByName = new Map(
    currentStatuses.map((status) => [
      status.name.toLocaleLowerCase(),
      status.id,
    ]),
  );
  const appIds = new Map<string, string>();
  const run = db.transaction(() => {
    let position = (
      db
        .prepare("SELECT COALESCE(MAX(position), -1) AS position FROM statuses")
        .get() as { position: number }
    ).position;
    const addStatus = db.prepare(
      "INSERT INTO statuses (id, name, color, position, is_default, is_closed, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
    );
    for (const row of input.statuses ?? []) {
      const name = text(row.name, 40);
      if (!name) continue;
      const sourceId = text(row.id, 100);
      let targetId = statusByName.get(name.toLocaleLowerCase());
      if (!targetId) {
        const idCandidate =
          sourceId &&
          !db.prepare("SELECT 1 FROM statuses WHERE id = ?").get(sourceId)
            ? sourceId
            : randomUUID();
        targetId = idCandidate;
        addStatus.run(
          targetId,
          name,
          /^#[0-9a-f]{6}$/i.test(String(row.color))
            ? String(row.color)
            : "#75877A",
          ++position,
          Number(Boolean(row.isClosed)),
          new Date().toISOString(),
        );
        statusByName.set(name.toLocaleLowerCase(), targetId);
      }
      if (sourceId) statusMap.set(sourceId, targetId);
    }
    const insertApp = db.prepare(
      "INSERT INTO applications (id, company, role, location, url, status_id, applied_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const row of input.applications) {
      const company = text(row.company, 160);
      const role = text(row.role, 160);
      if (!company || !role) continue;
      const sourceId = text(row.id, 100);
      if (
        sourceId &&
        db.prepare("SELECT 1 FROM applications WHERE id = ?").get(sourceId)
      ) {
        duplicates += 1;
        continue;
      }
      const id = sourceId || randomUUID();
      const statusName = text(row.statusName, 40);
      const targetStatus =
        (text(row.statusId, 100) && statusMap.get(text(row.statusId, 100))) ||
        statusByName.get(statusName.toLocaleLowerCase()) ||
        statusByName.get("wishlist");
      if (!targetStatus)
        throw new Error("The backup does not include a usable status.");
      const fields = applicationSchema.parse({
        company,
        role,
        location: row.location ?? "",
        url: row.url ?? "",
        statusId: targetStatus,
        appliedAt: dateOnly(row.appliedAt),
      });
      const createdAt = timestamp(row.createdAt);
      const updatedAt = timestamp(row.updatedAt);
      insertApp.run(
        id,
        fields.company,
        fields.role,
        fields.location,
        fields.url,
        targetStatus,
        fields.appliedAt,
        createdAt,
        updatedAt,
      );
      appIds.set(sourceId || id, id);
      imported += 1;
    }
    const insertEvent = db.prepare(
      "INSERT INTO timeline_events (id, application_id, event_type, message, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    for (const row of input.events ?? []) {
      const appId = appIds.get(text(row.applicationId, 100));
      if (!appId) continue;
      const type = ["created", "status", "note", "import"].includes(
        String(row.type),
      )
        ? String(row.type)
        : "import";
      const message = text(row.message, 2000);
      if (message)
        insertEvent.run(
          randomUUID(),
          appId,
          type,
          message,
          timestamp(row.createdAt),
        );
    }
    for (const appId of appIds.values()) {
      const eventExists = db
        .prepare("SELECT 1 FROM timeline_events WHERE application_id = ?")
        .get(appId);
      if (!eventExists)
        insertEvent.run(
          randomUUID(),
          appId,
          "import",
          "Imported from JSON backup.",
          new Date().toISOString(),
        );
    }
  });
  run();
  return { imported, duplicates };
}
