# Privacy Compliance Review Criteria
**Source:** Extracted from privacy-compliance skill
**Domain:** Consent management, cookie compliance, dark pattern avoidance, GDPR/CCPA/LGPD
## Charter Review Questions
- Does the project collect, process, or store personal data?
- Are target jurisdictions identified for regulatory compliance (GDPR, CCPA, LGPD)?
- Is a consent management strategy defined for analytics, tracking, and marketing features?
- Does the tech stack include third-party scripts that process user data?
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
## Code Review Questions
- Does the code enforce consent-before-load for analytics, tracking, and marketing scripts?
- Are cookies classified correctly (strictly necessary vs. optional) and set with appropriate attributes?
- Does the code avoid loading third-party scripts until explicit user consent is granted?
- Are personal data fields encrypted at rest and masked in logs and error messages?
- Does the consent UI provide equal prominence to accept and reject options (no dark patterns)?
- Are data retention policies implemented in code (TTL on stored data, scheduled cleanup)?
- Does the code support data subject rights (export, deletion) for personal data it processes?
