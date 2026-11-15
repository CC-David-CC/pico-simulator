# Owned original reference tests

These2 original test files belong to pico-simulator because their imported source modules match this repository’s exact captured blobs. Current implementation files and assertions are unchanged. Import and proven fixture/resource URL locators are ported to this repository; no cross-repository private source imports or compatibility path shims are added.

Mechanical source-test baseline `b15cb87aa78cecf36ae3f338cb933c0c3ebb0ac7`; merge `2b76182d08edcdcb3411f533da9e922c2678dfae`. Private phase44 preserves earlier paths, explicit copy boundaries and source-to-result commit/ref maps. The locator-normalized complete AST is unchanged, not just selected assertions.

Run `npm run test:reference`. This is Node unit/reference qualification of the retained domain modules, not browser/worker/kernel/renderer/storage/authentication/human-agent acceptance. Current app hosting/build and shared-operation integration gates remain separately open.

Captured baseline and current port: 2 pass, 0 fail, 0 cancelled, 0 skipped across 2 reported Node subtests. Top-level assertion-only files count as one reported Node subtest, not individual assertions.
