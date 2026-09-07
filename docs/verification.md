# Verification record

The application is implemented locally. Results below distinguish executed checks from supplied but unexecuted deployment artifacts.

| Check                                          | Result                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| Application + Better Auth migrations on SQLite | Passed                                                           |
| Strict TypeScript                              | Passed                                                           |
| ESLint on project sources                      | Passed                                                           |
| Service tests                                  | 71 passed, including PDF text integrity and checkout concurrency |
| Browser acceptance                             | 7 passed, including complete workflow and passwordless sign-in   |
| Responsive and axe scans                       | Passed at 390, 768 and 1440 pixels; light and dark themes        |
| Production Next.js build                       | Passed, dynamic pages and nonce proxy included                   |
| SQLite online backup and disposable restore    | Passed; integrity and six entity counts matched                  |
| Production dependency audit                    | 0 reported vulnerabilities at the time of the local audit        |
| PostgreSQL/container execution                 | Not run: no local Docker/PostgreSQL runtime                      |
| Live comparison, SMTP and Stripe lifecycle     | Not run: credentials not supplied                                |
| Deployed smoke test                            | Not run: no deployment target                                    |
| GitHub CI                                      | Pending first publication; inspect the repository Actions runs   |

A clean copy also passed a frozen-lockfile install, migration/seed, the full verification command and SQLite restore. An actual bounded fetch of the official Notion formulas guide returned readable content. This source-only smoke did not invoke the comparison provider.

Final interface checks also verified the UTC billing reset date, the search keyboard shortcut, and closing mobile navigation by selecting a route or pressing Escape. The closed drawer is excluded from keyboard and accessibility navigation. Actual landing, dashboard, import, review and billing screens were inspected at all three widths, including the open mobile drawer.

The first browser run found insufficient contrast in muted text and a selector that matched a hidden account-menu label. The text colors were corrected and the visible sample banner explicitly tested. The first PDF test found a native worker-thread crash; PDF parsing now runs in a separate bounded subprocess. All affected tests were rerun; none was skipped to obtain a pass.

The local dependency set uses compatible versions of Next.js, Better Auth, SQLite, ESLint, TypeScript and Vitest pinned through `pnpm-lock.yaml`. SQLite 13’s source-build path was incompatible with the initial Windows toolchain; SQLite 12.11.1’s native package installed and passed the service suite. ESLint 9 is retained for compatibility with the installed Next.js plugin peer ranges; plan a tooling upgrade when those ranges support ESLint 10.

Screenshots are generated with `pnpm screenshots` from a fresh isolated sample. They contain fictional course content only. Image capture, layout inspection and automated accessibility scanning do not replace testing with assistive technology or a complete manual accessibility audit.
