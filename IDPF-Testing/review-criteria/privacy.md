# Privacy Compliance Review Criteria
**Source:** Extracted from privacy-compliance skill
**Domain:** Consent management, cookie compliance, dark pattern avoidance, GDPR/CCPA/LGPD

## Proposal Review Questions
- Does the proposal identify personal data collection points and their lawful basis?
- Are consent requirements defined for analytics, tracking, or marketing features?
- Does the proposal address cookie usage and classification (necessary vs optional)?
- Are regulatory applicability considerations included (GDPR, CCPA/CPRA, LGPD)?
- Does the proposal account for third-party scripts and their data processing implications?

## PRD Review Questions
- Do user stories include consent management acceptance criteria where data is collected?
- Are cookie classification and banner requirements specified for new tracking features?
- Does the PRD define data subject rights flows (access, deletion, portability) if applicable?
- Are dark pattern avoidance requirements included for consent UI (reject-all parity, no pre-checked boxes)?
- Does the test plan include validation of consent-before-load behavior for non-essential scripts?
- Are privacy policy updates identified when new data processing activities are introduced?

## Issue Review Questions
- Does this feature collect, process, or store personal data?
- Are consent requirements identified before loading analytics, tracking, or marketing scripts?
- Does the issue specify cookie classification for any new cookies introduced?
- Are dark patterns avoided in consent UI (equal prominence for accept/reject, no pre-checked boxes)?
- Does the implementation follow the consent-before-load pattern for non-essential scripts?
- Are regulatory requirements considered (GDPR consent, CCPA "Do Not Sell", LGPD lawful basis)?
- Does the feature introduce third-party scripts that create sub-processor relationships?
- Is the privacy policy or cookie policy updated to reflect new data processing activities?
