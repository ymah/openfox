# Exploratory browser scenarios

Throw-away-instance scripts used to drive OpenFox in a real browser and look for
bugs: console errors, failed or runaway requests, layout leaks between project
functions. They are scripts, not specs (`playwright test` does not pick them up).

```bash
npm run build                                   # the server serves the built web app
npx tsx e2e-playwright/explore/server.ts &      # isolated: in-memory DB, mock LLM, temp config, port 10770
npx tsx e2e-playwright/explore/s6-settings-memory.ts
```

`server.ts` never touches your real data. Each `sN-*.ts` prints what it observes and
`FINDING:` lines for anything suspicious; screenshots go to `/tmp/explore-shots`.
