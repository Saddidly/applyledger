"use client";

import { useState } from "react";
import type { Status } from "@/lib/database";
import { api } from "@/lib/client";

export function StatusManager({
  statuses,
  onChanged,
  onClose,
}: {
  statuses: Status[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await api(id ? `/api/statuses/${id}` : "/api/statuses", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify({
          name: data.get("name"),
          color: data.get("color"),
          isClosed: data.has("isClosed"),
        }),
      });
      if (!id) form.reset();
      await onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not save status.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(status: Status) {
    if (!confirm(`Delete the empty status “${status.name}”?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/statuses/${status.id}`, { method: "DELETE" });
      await onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not delete.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="status-manager">
      <div className="panel-heading">
        <h2>Manage statuses</h2>
        <button className="quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <p>
        Closed statuses leave the active pipeline. Built-in statuses can be
        edited; empty custom statuses can be removed.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {statuses.map((status) => (
        <form
          key={`${status.id}-${status.name}-${status.color}-${status.isClosed}`}
          onSubmit={(event) => save(event, status.id)}
          className="status-row"
        >
          <input
            name="name"
            aria-label={`Name for ${status.name}`}
            defaultValue={status.name}
            maxLength={40}
            required
          />
          <input
            name="color"
            aria-label={`Color for ${status.name}`}
            type="color"
            defaultValue={status.color}
          />
          <label className="checkbox">
            <input
              name="isClosed"
              type="checkbox"
              defaultChecked={status.isClosed}
            />
            Closed
          </label>
          <button disabled={busy}>Save</button>
          <button
            type="button"
            disabled={busy || status.isDefault || status.applicationCount > 0}
            className="danger"
            onClick={() => void remove(status)}
          >
            Delete
          </button>
        </form>
      ))}
      <h3>Create a status</h3>
      <form onSubmit={(event) => save(event)} className="status-row">
        <input
          name="name"
          aria-label="New status name"
          placeholder="Awaiting steps"
          maxLength={40}
          required
        />
        <input
          name="color"
          aria-label="New status color"
          type="color"
          defaultValue="#55796b"
        />
        <label className="checkbox">
          <input name="isClosed" type="checkbox" />
          Closed
        </label>
        <button disabled={busy}>Create</button>
      </form>
    </section>
  );
}
