# AI code review policy

AI-assisted pull request review is advisory engineering signal. It supplements, but never replaces, GitHub Actions, tests, issue/spec intent, maintainer judgment, or understanding of the existing codebase.

## Current accepted reviewer

CodeRabbit is currently the only accepted AI pull-request reviewer for this repository.

It remains the broad, repository-aware baseline configured by `.coderabbit.yaml`. Its existing configuration should not be changed merely to accommodate another reviewer.

No other AI reviewer should be treated as enabled or approved until it passes the acceptance criteria in this document.

## Review authority

An AI review comment is evidence of a possible problem. It is not an instruction to change the code.

Before acting on a substantive AI finding, verify it against the strongest available sources of truth:

1. the originating issue, approved spec, or explicit maintainer decision;
2. surrounding code and established behavior;
3. tests that encode externally observable behavior or invariants;
4. repository documentation and agent instructions;
5. actual runtime, API, data-flow, authorization, database, and deployment semantics where relevant.

Agreement between multiple reviewers increases investigation priority, but it does not prove a finding is correct.

### Behavior-changing suggestions

Do not implement a reviewer suggestion automatically if it would materially change any of these areas unless the issue/spec clearly requires the change:

- user-visible functionality or UX flow;
- authentication, authorization, viewer/editor/owner, sharing, or other permission behavior;
- deletion, retention, ownership, persistence, or lifecycle semantics;
- API contracts;
- database constraints, migrations, or data interpretation;
- compatibility behavior or upstream-sync assumptions;
- deployment/runtime architecture or operator behavior;
- intentionally chosen edge-case behavior.

If issue/spec/code/tests/docs do not resolve the intended behavior, ask the maintainer instead of changing the code merely to satisfy a reviewer.

## Reviewer services stay read-only

The reviewer setup must never automatically modify repository code. This restriction applies to reviewer services and unattended reviewer-triggered automation. When the user invokes `address-pr-reviews`, that invocation authorizes the coding agent to verify findings and complete valid fixes, checks, commits, pushes, replies, and resolutions without intermediate approval. The agent follows maintainer intent and source evidence rather than treating reviewer suggestions as commands.

Do not enable:

- automatic commits;
- automatic pushes;
- automatic application of code suggestions;
- reviewer-driven coding/fixing agents;
- workflows that turn review comments into patches automatically;
- AI auto-approval as merge authority;
- reviewer-driven branch mutations.

Inline GitHub suggestion blocks are allowed because a human or coding agent must still choose to apply them deliberately.

## Merge and CI policy

AI review remains advisory.

- Do not make an AI reviewer a required merge check.
- Do not require a minimum number of AI approvals.
- Do not require every AI thread to be mechanically resolved before merge.
- Do not let a reviewer quota or outage become a merge dependency.
- Do not replace deterministic CI with AI judgment.

GitHub Actions remains authoritative for deterministic validation such as formatting, linting, typechecking, tests, generated-artifact checks, Knip, React Doctor, and other repository CI checks.

Serious AI findings should still be investigated. Advisory means the reviewer cannot become authority by itself, not that review feedback should be ignored.

## Noise control

AI review should focus on substantive engineering problems:

- correctness and logic bugs;
- regressions and edge cases;
- authorization, privacy, and security issues;
- data-loss or lifecycle risks;
- meaningful test gaps;
- maintainability/design issues with real impact;
- performance problems;
- unimplemented issue/spec requirements.

Avoid duplicating formatter/linter/typechecker output or producing generic style advice without demonstrated impact.

The current CodeRabbit generated-artifact exclusions are:

- `packages/open-api/karakeep-openapi-spec.json`
- `packages/sdk/src/karakeep-api.d.ts`
- `packages/db/drizzle/meta/**`

Future reviewers should receive equivalent exclusions where their free tier supports them.

## Acceptance criteria for any additional reviewer

A future reviewer must satisfy all of the following before it is approved for ongoing use.

### Cost and friction

- zero paid subscription cost for the intended repository usage;
- no silent paid upgrade if pricing, eligibility, or quotas change;
- no recurring administrative approval/application process merely to preserve the free tier unless the maintainer explicitly chooses to accept that trade-off.

### Repository scope

- install only for `absolutepraya/marka`, not all repositories on the account;
- review non-draft pull requests targeting `main` where the service supports scope controls;
- avoid wasting review quota on generated output and pure dependency-bot PRs where controls exist.

### Permission ceiling

Reasonable permissions include:

- repository contents: read;
- pull requests/reviews/comments: write when required to publish review feedback;
- issues/comments: write only when required for review interaction;
- checks/statuses: read/write when required to publish review state;
- metadata: read.

Reject the reviewer if its GitHub App requires any of these capabilities for installation or normal review operation:

- repository contents: write;
- GitHub Actions/workflows: write;
- repository administration;
- secrets or environments;
- equivalent broad code-mutation privileges.

A vendor promise that review mode will not use an excessive permission does not override this rule. Capability matters as well as intended behavior.

### Behavior

- review/comments only;
- no automatic commits, pushes, fix application, branch mutation, or autonomous coding agents;
- no required merge status;
- deterministic CI remains independent and authoritative.

### Quality

New reviewers are probationary. Findings should be classified as:

1. **Confirmed defect**: evidence shows the problem is real and within intended scope. Fix it.
2. **Valid but optional**: technically reasonable but outside the requested scope. Normally leave it out of the PR.
3. **Intentional behavior**: the reviewer misunderstood a deliberate choice. Reject it.
4. **False positive**: the factual claim does not hold after inspection. Reject it.
5. **Ambiguous or behavior-changing**: the proposed change could alter intended semantics and available sources do not resolve intent. Ask the maintainer.

Two or more reviewers independently flagging the same concern increases investigation priority but does not change these classification rules.

## Evaluated candidates

The following services were evaluated during issue #40 and PR #41. They are not approved active reviewers.

| Reviewer | Result | Reason |
| --- | --- | --- |
| Qodo | Rejected | Its permanent zero-cost path requires open-source qualification/application, which did not fit the low-friction free-plan requirement for this rollout. |
| Sourcery | Rejected | Live installation exposed GitHub App permissions including repository contents write plus Actions/workflows write. This exceeds the approved least-privilege ceiling. Its first review also produced one intentional/optional documentation suggestion and one clear false claim about the dated spec files being future-dated. |
| Graphite Agent | Rejected | Graphite's GitHub App permission model includes read/write access to repository contents and workflows/Actions as part of its broader PR product. This exceeds the approved review-only permission ceiling even if AI Reviews themselves are configured not to mutate code. |

These rejections are not claims that the vendors are malicious. They mean the integrations do not fit this repository's chosen risk model.

Do not re-enable one of these candidates without a new explicit maintainer decision based on materially changed pricing, permissions, or product behavior.

## Current research target

Issue #40 remains open as the search for an additional reviewer that is:

> free + useful + review-only + least privilege

A smaller safe reviewer set is preferable to an "AI reviewer army" that requires broad write access.

## Manual reviewer interaction

Use manual re-review only when it adds value after meaningful changes.

Current accepted example:

```text
@coderabbitai review
```

## Maintainer evaluation checklist

For any future candidate:

1. Confirm current official pricing/free-tier terms.
2. Confirm the App can be scoped only to `absolutepraya/marka`.
3. Inspect the exact GitHub App permissions before treating the integration as accepted.
4. Reject contents-write, Actions/workflows-write, administration, secrets/environment, or equivalent mutation capability.
5. Enable review-only behavior only.
6. Use a real non-draft PR as a smoke test.
7. Confirm the reviewer comments but does not commit, push, apply changes, or mutate the branch.
8. Confirm no reviewer check is required by branch protection/rulesets.
9. Inspect the first reviews for false positives, generic advice, duplication, and behavior-changing suggestions.
10. Record the evaluation result in the issue/spec before adopting the reviewer.

## Design and implementation history

The complete decision history and evaluation are preserved in:

- `docs/superpowers/specs/2026-08-15-ai-reviewer-army-design.md`
- `docs/superpowers/plans/2026-08-15-ai-reviewer-army.md`
- `docs/superpowers/plans/2026-08-15-ai-reviewer-army-live-rollout.md`

Vendor behavior changes over time. Re-check official vendor documentation before reconsidering a rejected integration.
