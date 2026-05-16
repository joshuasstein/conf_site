# Review Visibility is single-blind; no toggle

Reviewers always see Presenter and Co-Author names. There is no double-blind mode and no admin toggle for it.

## Reason

This conference has never run blind review. The toggle was added speculatively during initial design. In practice it introduced a per-request database lookup, two separate response schemas (`SubmissionRead` / `SubmissionReadBlind`), and conditional serialization logic that every reviewer-facing endpoint would have had to replicate. The complexity was not earning its keep.

If a future conference run on this system requires blind review, the right approach is to add it explicitly at that point — not to carry the machinery indefinitely for a requirement that may never arise.
