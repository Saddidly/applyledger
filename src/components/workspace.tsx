"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Application, Status } from "@/lib/database";
import { api } from "@/lib/client";
import { ApplicationForm } from "./application-form";
import { Timeline } from "./timeline";
import { StatusManager } from "./statuses";
import Link from "next/link";

async function readWorkspace() {
  return Promise.all([
    api<{ applications: Application[] }>("/api/applications"),
    api<{ statuses: Status[] }>("/api/statuses"),
  ]);
}

export function Workspace() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const selectionRequest = useRef(0);
  const load = useCallback(async () => {
    const [apps, stages] = await readWorkspace();
    setApplications(apps.applications);
    setStatuses(stages.statuses);
    setReady(true);
  }, []);
  useEffect(() => {
    let active = true;
    readWorkspace()
      .then(([apps, stages]) => {
        if (active) {
          setApplications(apps.applications);
          setStatuses(stages.statuses);
          setReady(true);
        }
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not open workspace.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  const visible = useMemo(
    () =>
      applications.filter(
        (application) =>
          (filter === "all" || application.statusId === filter) &&
          `${application.company} ${application.role} ${application.location}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [applications, filter, query],
  );
  const closed = new Set(
    statuses.filter((status) => status.isClosed).map((status) => status.id),
  );
  const active = applications.filter(
    (application) => !closed.has(application.statusId),
  ).length;
  async function choose(application: Application) {
    const request = ++selectionRequest.current;
    setError("");
    try {
      const result = await api<{ application: Application }>(
        `/api/applications/${application.id}`,
      );
      if (request === selectionRequest.current) {
        setSelected(result.application);
        setEditing(true);
        setManaging(false);
      }
    } catch (failure) {
      if (request === selectionRequest.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not open application.",
        );
    }
  }
  async function saved(application: Application) {
    await load();
    setSelected(application);
    setEditing(true);
    setNotice("Application saved.");
  }
  async function refreshSelected() {
    await load();
    if (selected) {
      const result = await api<{ application: Application }>(
        `/api/applications/${selected.id}`,
      );
      setSelected(result.application);
    }
  }
  async function remove() {
    if (
      !selected ||
      !confirm(
        `Delete ${selected.role} at ${selected.company}, including its notes?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/applications/${selected.id}`, { method: "DELETE" });
      setSelected(null);
      setEditing(false);
      await load();
      setNotice("Application deleted.");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not delete.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 10_000_000) {
      setError("Choose a backup under 10 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const text = await file.text();
      const payload = file.name.toLowerCase().endsWith(".csv")
        ? { format: "csv", contents: text }
        : { format: "json", payload: JSON.parse(text) };
      const result = await api<{ imported: number; duplicates: number }>(
        "/api/import",
        { method: "POST", body: JSON.stringify(payload) },
      );
      await load();
      setNotice(
        `Imported ${result.imported} applications; skipped ${result.duplicates} existing IDs.`,
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not import.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace">
      <header className="masthead">
        <Link href="/" className="brand">
          <span className="brand-mark">A</span>ApplyLedger
        </Link>
        <span className="local-badge">● Private local workspace</span>
        <nav aria-label="Data tools">
          <button
            disabled={busy || !ready}
            onClick={() => importInput.current?.click()}
          >
            Import
          </button>
          <a className="button" href="/api/export?format=json">
            JSON backup
          </a>
          <a className="button" href="/api/export?format=csv">
            Export CSV
          </a>
        </nav>
        <input
          ref={importInput}
          className="file-input"
          type="file"
          accept=".json,.csv"
          onChange={(event) => void importFile(event)}
          aria-label="Import applications"
        />
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR NEXT CHAPTER</p>
            <h1>Keep your search moving.</h1>
            <p>Applications, conversations, and next steps — in one place.</p>
          </div>
          <button
            className="primary"
            disabled={!ready}
            onClick={() => {
              selectionRequest.current++;
              setSelected(null);
              setEditing(true);
              setManaging(false);
            }}
          >
            + Add application
          </button>
        </div>
        <section className="metrics" aria-label="Application summary">
          <article>
            <span>Total applications</span>
            <strong>{applications.length}</strong>
          </article>
          <article>
            <span>Active pipeline</span>
            <strong>{active}</strong>
          </article>
          <article>
            <span>Interview statuses</span>
            <strong>
              {
                applications.filter((application) =>
                  /interview/i.test(application.statusName),
                ).length
              }
            </strong>
          </article>
          <article>
            <span>Open offer statuses</span>
            <strong>
              {
                applications.filter(
                  (application) =>
                    /offer/i.test(application.statusName) &&
                    !closed.has(application.statusId),
                ).length
              }
            </strong>
          </article>
        </section>
        {notice && (
          <div role="status" className="notice">
            {notice}
            <button className="quiet" onClick={() => setNotice("")}>
              Dismiss
            </button>
          </div>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
            <button
              onClick={() =>
                void load()
                  .then(() => setError(""))
                  .catch((failure) => setError(String(failure)))
              }
            >
              Retry loading
            </button>
          </div>
        )}
        <div
          className={`content-grid ${editing || managing ? "with-panel" : ""}`}
        >
          <section className="application-list">
            <div className="list-heading">
              <h2>
                Applications <span>{visible.length}</span>
              </h2>
              <button
                className="quiet"
                disabled={!ready}
                onClick={() => {
                  setManaging(!managing);
                  setEditing(false);
                }}
              >
                Manage statuses
              </button>
            </div>
            <div className="filters">
              <input
                type="search"
                aria-label="Search applications"
                placeholder="Search company, role, location…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                aria-label="Filter by status"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name} ({status.applicationCount})
                  </option>
                ))}
              </select>
            </div>
            {!ready ? (
              <p className="empty">Opening your workspace…</p>
            ) : visible.length === 0 ? (
              <div className="empty">
                <h3>
                  {applications.length
                    ? "No matching applications"
                    : "Your next opportunity starts here."}
                </h3>
                <p>
                  {applications.length
                    ? "Try a different search or status."
                    : "Add an application or import your existing CSV."}
                </p>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Company & role</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Location</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((application) => (
                      <tr
                        key={application.id}
                        className={
                          selected?.id === application.id && editing
                            ? "selected"
                            : ""
                        }
                      >
                        <td>
                          <strong>{application.company}</strong>
                          <span>{application.role}</span>
                        </td>
                        <td>
                          <span className="status-chip">
                            <i
                              style={{
                                backgroundColor: application.statusColor,
                              }}
                            />
                            {application.statusName}
                          </span>
                        </td>
                        <td>{application.appliedAt}</td>
                        <td>{application.location || "—"}</td>
                        <td>
                          <button
                            onClick={() => void choose(application)}
                            aria-label={`Open ${application.role} at ${application.company}`}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {editing && (
            <aside className="editor" aria-label="Application details">
              <ApplicationForm
                key={selected?.id ?? "new"}
                application={selected}
                statuses={statuses}
                onSaved={saved}
                onCancel={() => setEditing(false)}
              />
              {selected && (
                <>
                  <Timeline
                    application={selected}
                    onChanged={refreshSelected}
                  />
                  {selected.url && (
                    <a
                      className="job-link"
                      href={selected.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open job posting ↗
                    </a>
                  )}
                  <button
                    className="danger delete-application"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    Delete application
                  </button>
                </>
              )}
            </aside>
          )}
          {managing && (
            <aside className="editor">
              <StatusManager
                statuses={statuses}
                onChanged={load}
                onClose={() => setManaging(false)}
              />
            </aside>
          )}
        </div>
        <footer>
          Stored on this computer. Export a JSON backup to keep your full
          timeline.
        </footer>
      </main>
    </div>
  );
}
