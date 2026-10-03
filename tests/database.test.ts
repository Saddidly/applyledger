import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  openDatabase,
  createApplication,
  updateApplication,
  addNote,
  getApplication,
  deleteApplication,
  createStatus,
  deleteStatus,
  listStatuses,
  listApplications,
  type AppDatabase,
} from "../src/lib/database";
import {
  exportBackup,
  importBackup,
  exportCsv,
  importCsv,
  parseCsv,
  type Backup,
} from "../src/lib/transfer";
import { applicationSchema } from "../src/lib/validation";
import { localRequestError, readJson } from "../src/lib/http";

let db: AppDatabase;
beforeEach(() => {
  db = openDatabase(":memory:");
});
afterEach(() => {
  db.close();
});
const input = {
  company: "Example",
  role: "Engineer",
  location: "Remote",
  url: "https://example.com/jobs",
  statusId: "applied",
  appliedAt: "2026-01-03",
};

describe("application ledger", () => {
  it("persists changes and preserves a status timeline", () => {
    const app = createApplication(input, db);
    updateApplication(app.id, { statusId: "interview" }, db);
    addNote(app.id, "Talk with team on Thursday", db);
    const result = getApplication(app.id, db)!;
    expect(result.statusName).toBe("Interview");
    expect(result.events).toHaveLength(3);
    expect(
      result.events?.some((event) => event.message.includes("Thursday")),
    ).toBe(true);
  });
  it("rejects unknown statuses without leaving partial records", () => {
    expect(() =>
      createApplication({ ...input, statusId: "missing" }, db),
    ).toThrow();
    expect(listApplications(db)).toHaveLength(0);
  });
  it("protects built-in and occupied statuses and cascades deleted notes", () => {
    expect(listStatuses(db).every((status) => status.isDefault)).toBe(true);
    expect(() => deleteStatus("applied", db)).toThrow();
    const status = createStatus(
      { name: "Awaiting steps", color: "#334455", isClosed: false },
      db,
    );
    const app = createApplication({ ...input, statusId: status.id }, db);
    expect(() => deleteStatus(status.id, db)).toThrow();
    deleteApplication(app.id, db);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM timeline_events").get(),
    ).toEqual({ n: 0 });
    expect(deleteStatus(status.id, db)).toBe(true);
  });
  it("round-trips JSON notes and skips already imported IDs", () => {
    const app = createApplication(input, db);
    addNote(app.id, "One note", db);
    const backup = exportBackup(db) as Backup;
    const other = openDatabase(":memory:");
    try {
      expect(importBackup(backup, other).imported).toBe(1);
      expect(getApplication(app.id, other)?.events).toHaveLength(2);
      expect(importBackup(backup, other).duplicates).toBe(1);
      expect(getApplication(app.id, other)?.events).toHaveLength(2);
    } finally {
      other.close();
    }
  });
  it("handles multiline CSV and rejects malformed fields atomically", () => {
    const rows = parseCsv(
      'company,role,status,appliedAt,url\r\n"Example, Inc","Engineer\nII",Applied,2026-01-03,https://example.com\r\n',
    );
    expect(importCsv(rows, db).imported).toBe(1);
    expect(listApplications(db)[0].role).toBe("Engineer\nII");
    expect(() =>
      importCsv(
        parseCsv(
          "company,role,url\nGood,Role,https://example.com\nBad,Role,javascript:alert(1)",
        ),
        db,
      ),
    ).toThrow();
    expect(listApplications(db)).toHaveLength(1);
    expect(() => parseCsv('company,role\n"unterminated')).toThrow();
  });
  it("escapes spreadsheet formulas in CSV exports", () => {
    createApplication({ ...input, company: "=1+1" }, db);
    expect(exportCsv(db)).toContain("'=1+1");
  });
});

describe("request and field boundaries", () => {
  it("rejects impossible dates, credential URLs, and unsafe URL schemes", () => {
    expect(
      applicationSchema.safeParse({ ...input, appliedAt: "2026-02-30" })
        .success,
    ).toBe(false);
    expect(
      applicationSchema.safeParse({
        ...input,
        url: "https://user:secret@example.com",
      }).success,
    ).toBe(false);
    expect(
      applicationSchema.safeParse({ ...input, url: "javascript:alert(1)" })
        .success,
    ).toBe(false);
  });
  it("blocks remote hosts, DNS lookalikes, and foreign origins", () => {
    const request = (host: string, origin?: string) =>
      new Request("http://localhost/api", {
        headers: { host, ...(origin ? { origin } : {}) },
      });
    expect(localRequestError(request("127.0.0.1:3000"))).toBeNull();
    expect(localRequestError(request("127.attacker.example"))?.status).toBe(
      403,
    );
    expect(localRequestError(request("example.com"))?.status).toBe(403);
    expect(
      localRequestError(request("localhost:3000", "https://example.com"))
        ?.status,
    ).toBe(403);
  });
  it("enforces JSON content type and streaming byte limits", async () => {
    await expect(
      readJson(new Request("http://localhost", { method: "POST", body: "{}" })),
    ).rejects.toThrow("application/json");
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"x":"large"}',
    });
    await expect(readJson(request, 5)).rejects.toThrow("larger");
  });
});
