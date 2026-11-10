---
description: "Use when changing the React and TypeScript frontend, UI components, hooks, frontend API client, or frontend tests."
applyTo: "frontend/src/**/*.{ts,tsx}"
---

# Frontend Instructions

- Prefer functional React components and hooks. Keep components focused, and
  separate presentation from complex business logic when that improves clarity.
- Keep state as local as practical. Avoid unnecessary `useEffect` calls and
  state that duplicates derived values; update state immutably.
- Extract reusable hooks when stateful behavior is genuinely shared. Avoid
  speculative abstractions.
- Use explicit TypeScript types at API and component boundaries. Avoid `any`
  unless there is no reasonable typed alternative.
- Keep API calls in the API client (`frontend/src/api.ts`) rather than
  presentation components when practical. Handle backend errors explicitly and
  do not expose backend implementation details in the UI.
- Test user-visible behavior: render components, interact as a user would, and
  assert visible results. Prefer accessible roles, labels, and visible text
  with React Testing Library. Do not couple tests to private functions,
  internal state, or unnecessary implementation details.
- Keep UI text available in German and English using the existing translation
  approach. German remains the default.
- For API changes, coordinate backend schemas and behavior, frontend types and
  client methods, and tests on both sides.
- When changing an API, update backend tests, the API implementation and
  schemas, frontend types and client, affected frontend tests, then run both
  backend and frontend tests.
- After frontend changes, run the relevant tests, `npm run lint`, and
  `npm run build` from `frontend/`.
