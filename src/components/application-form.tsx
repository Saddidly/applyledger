"use client";

import { useState } from "react";
import type { Application, Status } from "@/lib/database";
import { api, today } from "@/lib/client";

type Props = {
  application: Application | null;
  statuses: Status[];
  onSaved: (application: Application) => Promise<void>;
  onCancel: () => void;
};

export function ApplicationForm({
  application,
  statuses,
  onSaved,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(data.entries());
    setBusy(true);
    setError("");
    try {
      const result = await api<{ application: Application }>(
        application
          ? `/api/applications/${application.id}`
          : "/api/applications",
        {
          method: application ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      await onSaved(result.application);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="editor-form">
      <div className="panel-heading">
        <h2>{application ? "Edit application" : "Add application"}</h2>
        <button type="button" className="quiet" onClick={onCancel}>
          Close
        </button>
      </div>
      <label>
        Company
        <input
          name="company"
          required
          maxLength={160}
          defaultValue={application?.company}
          autoFocus
        />
      </label>
      <label>
        Role
        <input
          name="role"
          required
          maxLength={160}
          defaultValue={application?.role}
        />
      </label>
      <div className="form-pair">
        <label>
          Status
          <select
            name="statusId"
            defaultValue={application?.statusId ?? "applied"}
          >
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Applied / planned date
          <input
            name="appliedAt"
            type="date"
            required
            defaultValue={application?.appliedAt ?? today()}
          />
        </label>
      </div>
      <label>
        Location
        <input
          name="location"
          maxLength={160}
          defaultValue={application?.location}
          placeholder="Remote, Cairo…"
        />
      </label>
      <label>
        Job URL
        <input
          name="url"
          type="url"
          maxLength={2048}
          defaultValue={application?.url}
          placeholder="https://…"
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Save application"}
      </button>
    </form>
  );
}
