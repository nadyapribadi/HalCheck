# Security Policy

## What this project is, before anything else

HALCHECK is a **demonstration** of halal-compliance accountability. It runs on a
single laptop, with one organisation operating every node, against fictional
data. It is not a hosted service, and no real certification or personal data is
involved. Please read the scope notes below before reporting anything: several
things that would be serious in a production system are deliberate,
documented properties here.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting instead: go to the
[Security tab](https://github.com/nadyapribadi/HalCheck/security) and choose
*"Report a vulnerability"*. That opens a private channel visible only to the
maintainer.

If that is unavailable, contact the maintainer directly through GitHub
([@nadyapribadi](https://github.com/nadyapribadi)).

Useful reports include:

- the file, endpoint or chaincode function involved, and the commit you tested;
- what an attacker gains, and what they need to start (a login? network access?
  the ability to run Docker on the host?);
- a reproduction - a request, a test, or a transcript - rather than a description.

**Expected response:** this is a personal demo project, so there is no service
level agreement. Reports are read and, if they are real, fixed in the open with
credit unless you ask otherwise.

## Supported versions

There are no releases: the default branch (`main`) is the only supported
version. Older commits are history, not versions to patch.

## What is in scope

This is the list worth attacking, roughly in order of how much it would matter:

1. **Chaincode rule enforcement** - a way to record a batch state that the rules
   forbid: submitting without the role, skipping a step, recording a verdict
   that does not match the records, exporting without a current Pass.
2. **Identity and role separation** - impersonating another role, or reaching a
   chaincode function with an identity that should not be able to.
3. **Tamper-evidence** - anything that lets a record be changed after the fact
   without the verification path noticing, or that makes the proof verifier
   report `VERIFIED` for a bundle that was altered.
4. **The verdict attestation** - forging a signed verdict, or a stale
   attestation being accepted against changed records.
5. **The audit log** - altering or deleting entries, or a covered action that
   leaves no trace (the insert-only grant is the control; a way around it is a
   real finding).
6. **Exposure** - reaching the database, object storage, Fabric peer or orderer
   ports through the public tunnel, or reaching anything at all without a login
   other than the intended public verification page.
7. **Evidence handling** - serving a certificate whose bytes do not match the
   hash on its immutable ledger record.

## What is out of scope (or already known)

- **The demo data and the demo credentials.** Fictional products, fictional
  suppliers and locally generated logins are not secrets. Publishing a working
  demo password is not a vulnerability; publishing the *mechanism* that leaks a
  real credential would be.
- **Single-operator trust.** One organisation runs all nodes by design, and the
  README says so. "The operator could have changed the data before it was
  written" is a documented limitation of this version, not a bug.
- **Restarts and outages.** A backend process does not recover from a ledger
  interruption on its own (ADR-CT-032) and must be restarted; that is recorded
  as a known limitation, not a finding.
- **The AI explanation feature cannot write**, by construction; it is grounded
  in one batch's records and refuses when a question needs anything else. A
  prompt-injection report is interesting only if it makes it state a compliance
  status that is not in that batch's trail.
- **Dependency findings with no reachable path.** Open a Dependabot alert
  discussion instead if you want to talk about severity.

## How the system is built to resist this

The design is written down rather than implied, and the security-relevant parts
are:

- `docs/08_security_threat_model.md` - 25 threats (T-001...T-025) with their
  mitigations and the test that covers each;
- `docs/18_vibe_coding_guardrails.md` - the rules any change to chaincode,
  identity or the audit log has to follow;
- `docs/21_decisions.md` - each security-relevant decision and the rejected
  alternatives (for example: expected business rejections map to 4xx, never
  500; COA hashes are computed server-side only);
- `docs/14_developer_setup.md` - the negative tests run against the live
  network for each of those mitigations.

Short version: every business rule is enforced in chaincode, not in the UI;
corrections are new linked records rather than edits; the audit log is
insert-only at the database grant level; verdicts are signed attestations bound
to a digest of the batch's own records; and any batch can be verified offline
by someone with no account at all.
