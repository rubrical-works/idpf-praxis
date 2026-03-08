# Contract Testing Review Criteria
**Source:** Extracted from IDPF-Contract-Testing framework
**Domain:** Consumer-driven contracts, provider verification, API compatibility

## Proposal Review Questions
- Does the proposal identify consumer/provider service pairs affected by the change?
- Are breaking contract changes explicitly flagged with a coordination plan?
- Does the proposal specify whether consumer-driven or provider-driven contracts apply?
- Are contract versioning strategy requirements defined (Git SHA, semantic, branch-based)?
- Does the proposal consider the can-i-deploy safety check for deployment gating?

## PRD Review Questions
- Do user stories define consumer expectations as testable contract interactions?
- Are provider state requirements documented for each consumer/provider pair?
- Does the test plan include both consumer test generation and provider verification steps?
- Are Pact Broker or equivalent contract repository integration points specified?
- Does the PRD include CI/CD pipeline gates for contract verification on PR and deploy?
- Are pending pact (WIP) workflows addressed for new contracts under development?

## Issue Review Questions
- Does the issue specify whether it affects the consumer side, provider side, or both?
- Are contract interaction changes defined with request/response format details?
- Does the issue include provider state setup requirements for verification?
- Is the breaking change process followed (consumer publishes → provider verifies → coordinate)?
- Are can-i-deploy checks included as pre-deployment acceptance criteria?
