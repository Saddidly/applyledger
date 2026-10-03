# Architecture

The App Router renders a static shell. Client components own filters, forms,
selection, and pending/error states; route handlers exchange JSON. Database
modules are server-only, with erased type-only imports in client code.

`lib/http.ts` enforces origin/Host boundaries and reads bounded UTF-8 JSON.
`lib/validation.ts` validates mutations with Zod. Route handlers coordinate
validation, domain operations, and HTTP error responses.

`lib/database.ts` owns SQLite schema, foreign keys, indexes, and transactions.
Application changes and their events commit together. Status deletion is checked
in domain code and constrained by database references. WAL supports local
read/write overlap; one synchronous connection is shared within the process.

`lib/transfer.ts` owns the versioned JSON contract and CSV adapter. Imports use
transactions and map source status identities to local definitions. Existing
application IDs are skipped. CSV cannot reconstruct the full timeline.

Multi-user isolation, authentication, future schema migrations, remote sync,
and distributed writes need separate designs. Tests use isolated in-memory
databases and never read the developer's saved workspace.
