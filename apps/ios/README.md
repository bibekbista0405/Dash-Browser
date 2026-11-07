# DASH — iOS (not started)

This folder is a placeholder, not a scaffolded app. No iOS code exists yet.
Same approach as apps/android/README.md: depend on `@dash/browser-core` for
all domain logic, implement its repository interfaces against native iOS
storage, host tabs via `WKWebView`, and implement blocking via
`WKContentRuleList` (compiled from the same `BLOCKLIST_DOMAINS` data) rather
than reimplementing the classifier.
