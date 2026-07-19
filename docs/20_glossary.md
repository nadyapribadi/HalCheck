# HALCHECK — Glossary

## Document Control

- Project: HALCHECK
- Module: Compliance Trail
- Repository: `halcheck`
- Status: Design complete
- Version: 0.1.0-planning

Plain-language definitions for every term used across the document set, grouped by category.

## Business / Domain Terms

**Maklon** — Contract manufacturing arrangement where a brand pays a factory to produce their product, without owning the factory themselves.

**BPJPH** — Indonesia's halal product certification authority.

**JAKIM** — Malaysia's halal certification authority.

**CPKB** *(Cara Pembuatan Kosmetik yang Baik)* — Indonesia's mandatory cosmetics manufacturing standard (equivalent to GMP — Good Manufacturing Practice), regulated under BPOM Regulation No. 33/2021.

**BPOM** — Indonesia's food and drug regulatory agency; oversees cosmetics safety and manufacturing standards.

**COA** *(Certificate of Analysis)* — A document certifying a raw material batch's composition and safety, standard practice in this industry.

**PP 42/2024** — The Indonesian regulation this project's compliance engine is built against.

**Recognition-directionality** — The principle that one certifying body accepting another's certificate doesn't automatically work the other way around.

**Separation of duties (SoD)** — The rule that no single person can both create and approve a critical record.

## Blockchain / Technical Terms

**Blockchain** — A record-keeping system where entries are cryptographically linked in sequence, so altering an old entry breaks the link to everything after it, making tampering detectable.

**Hash** — A short code generated from exact content; even a tiny change to the content produces a completely different hash.

**Tamper-evident** — Alterations become detectable after the fact. (Different from tamper-*proof*, which prevents alteration from happening at all.)

**Permissioned blockchain** — A blockchain where only known, vetted participants can join.

**Hyperledger Fabric** — The specific open-source permissioned blockchain platform used in this project.

**Chaincode** — Fabric's term for a smart contract; the actual code that enforces business rules directly on the ledger.

**Ledger** — The actual chain of recorded entries; the source of truth for everything accountability-related in this system.

**Peer (node)** — A server that holds a copy of the ledger and participates in the network.

**Ordering service** — The Fabric component that sequences transactions before they're added to the ledger.

**Fabric CA** *(Certificate Authority)* — Issues the real cryptographic identity certificates each role uses to sign their submissions.

**MSP** *(Membership Service Provider)* — Fabric's mechanism for defining which certificates count as valid identities for an organization.

**Channel** — A private sub-network within Fabric where only specified participants can see certain data.

**CouchDB** — The database Fabric uses to store queryable ledger state.

**Fabric Gateway SDK** — The official library a backend server uses to actually submit and read data from a Fabric network.

**MVCC** *(Multi-Version Concurrency Control)* — Fabric's native mechanism for detecting when two transactions conflict by trying to modify the same data at the same time.

**Off-chain** — Data stored outside the ledger because it doesn't need tamper-evidence, or because the ledger is a poor fit for storing it.

**On-chain** — Data actually written to the ledger.

## Infrastructure Terms

**Docker** — Software that packages an application into a portable "container."

**Docker Compose** — A tool for running multiple Docker containers together as one coordinated system.

**Container** — A single packaged, runnable unit managed by Docker.

**Cloudflare Pages** — Free static website hosting, used for HALCHECK's main app.

**Cloudflare Tunnel** — A free service that creates a public link routing to something running on a local machine.

**MinIO** — Free, self-hosted file storage software, compatible with the same interface as Amazon S3.

**PostgreSQL** — A standard relational database, used here for non-authoritative cached data and the System Audit Log.

**JWT** *(JSON Web Token)* — A signed digital token used to verify a logged-in user's identity on each request.

**API** *(Application Programming Interface)* — The set of rules by which the frontend and backend communicate.

**Backend** — The server-side application that sits between the frontend and the blockchain.

**Frontend** — The part of the application the user actually sees and clicks in their browser.

## Project-Specific Terms

**HALCHECK** — The overall halal supply chain compliance screening product this feature is related to.

**Compliance Trail** — This project: the accountable, tamper-evident record-keeping layer.

**ADR** *(Architecture/Accepted Decision Record)* — A short, formal record of a decision made, why, and its consequences.

**PRD / BRD / FRD / TRD** — Product / Business / Functional / Technical Requirements Documents.

**ERD** *(Entity-Relationship Diagram)* — Formal definition of every data entity, its fields, and its relationships to other entities.

**System Admin** — The sixth role in this system; maintains reference data and reviews the audit log, with no batch-submission capability.

**Reference Data** — Controlled vocabularies (ingredients, suppliers, standards, fail reasons) that fields must be selected from rather than freely typed.

**System Audit Log** — A separate, insert-only record of system-level activity (logins, views, access attempts), distinct from the business-event ledger.

**Snapshot (data model)** — The pattern where a record stores the literal text of a referenced value at submission time, rather than a live pointer to a reference table that could later change.

**Two-shell navigation** — The structural separation between the operational-role interface (batch list, forms) and the System Admin governance interface (reference data, audit log) — the two never share routes beyond login.

**V1** — The current build target: real Hyperledger Fabric, self-hosted, no permanent cloud hosting.

**Phase 0–3** — Design, Build, Test, Deploy/Production — the four-stage plan this project follows, with only the first three currently in scope.

**Milestone 1 / Milestone 2** — Milestone 1 (end of Implementation Plan P6): the system is walkthrough-recordable. Milestone 2 (end of P11): every review finding is closed, full-scope-ready.
