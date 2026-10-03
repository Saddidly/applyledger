"use client";

import { useState } from "react";
import type { Application } from "@/lib/database";
import { api } from "@/lib/client";

export function Timeline({
  application,
  onChanged,
}: {
  application: Application;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = String(new FormData(form).get("message") ?? "");
    setBusy(true);
    setError("");
    try {
      await api(`/api/applications/${application.id}/events`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      form.reset();
      await onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not add note.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="timeline">
      <h2>Activity & notes</h2>
      <form onSubmit={add}>
        <label>
          Add a note
          <textarea
            name="message"
            required
            maxLength={2000}
            rows={3}
            placeholder="Interview details, next steps, contact…"
          />
        </label>
        <button disabled={busy}>{busy ? "Adding…" : "Add note"}</button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ol>
        {application.events?.map((event) => (
          <li key={event.id}>
            <span className="event-kind">{event.type}</span>
            <p>{event.message}</p>
            <time dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
