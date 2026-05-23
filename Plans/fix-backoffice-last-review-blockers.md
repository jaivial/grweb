# Plan: last backoffice review blockers

## Goal

Get the next reviewer-agent verdict to **APPROVED / PASS** by fixing only the three remaining blockers from the latest review.

## Context and assumptions

- Root `AGENTS.md` was read. No `backoffice/AGENTS.md` or `backend/GrCup.Api/AGENTS.md` exists. `frontend/AGENTS.md` exists but does not apply to the separate `backoffice/` tree inspected here.
- Wide Research MCP was attempted and failed with `COHERE_API_KEY env not set`; scoping fell back to direct reads/searches.
- Wouter dependency is `^3.9.0`. Prefer `useSearch()` if exported by this installed version; otherwise use a small reactive browser-location hook tied to Wouter navigation/popstate.
- Current `git status --short` is heavily dirty with unrelated backend/frontend/ferweb changes and many generated screenshots/HAR/QA artifacts. Treat the worktree as shared/unsafe.

## Non-goals and scope boundaries

- Do not redesign users, roles, inscripciones, routing, or backoffice layout.
- Do not touch backend unless a later verification proves an unrelated backend smoke issue; no backend source changes are expected.
- Do not edit `frontend/`, `ferweb/`, generated screenshots/HARs, `qa-output/`, `dogfood-output/`, `.wide-researcher/runs/`, or unrelated files.
- Do not revert unrelated user changes.
- Source edits for this final fix should be limited to:
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx`
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx`
  - only if audit proves necessary: another already-touched users TSX file for a small `data-*` fix.

## Exact defect list and expected corrected behavior

1. **HIGH — `NewMemberPage` is not reactive to `?role=` changes**
   - File: `backoffice/src/pages/backoffice/users/NewMemberPage.tsx:41,49-52,68-82`.
   - Current issue: Wouter v3 `useLocation()` returns only the pathname in this app, so `currentLocation.split('?')[1]` is always empty. `queryRole` stays `null`, and `routeKey` excludes query-only changes.
   - Expected behavior: `/backoffice/users/new?role=staff` selects `staff`; in-app navigation to `/backoffice/users/new?role=registrador` resets `nombre`, `email`, `password`, `errors`, `submitting=false`, and selects `registrador`. Invalid/forbidden query roles fall back to the first allowed role for the current user. Slugged `/backoffice/:competicionSlug/users/new?role=...` behaves identically.

2. **MEDIUM — `data-*` compliance incomplete on role filter `<option>` tags**
   - File: `backoffice/src/pages/backoffice/users/UsersPage.tsx:369-371`.
   - Current issue: native `<option>` tags in the role filter have no differentiating `data-*` attribute.
   - Expected behavior: static “Todos los roles” option and each mapped role option include unique semantic attributes, e.g. `data-ui="members-role-filter-option-all"` and `data-ui={\`members-role-filter-option-${role}\`}`. Re-audit all TSX files touched by this final patch.

3. **MEDIUM — worktree remains unsafe/inflated for commit**
   - Current issue: blocker diff is focused, but overall worktree includes unrelated staged backoffice additions, unrelated backend/frontend/ferweb changes, and many generated artifacts.
   - Expected behavior: executor does not revert unrelated changes, edits only final blocker files, and if a future commit is requested, explicitly unstages/reviews and stages only the intended files. Generated artifacts must never be staged.

## Ordered implementation phases

### Phase 1 — Worktree isolation and intended edit set

- **Files**: no source edits.
- **Tasks**:
  1. Run `git status --short` for awareness only.
  2. Confirm intended edit set before writing code: `NewMemberPage.tsx`, `UsersPage.tsx`, and this plan file. Add another users TSX file only if the final `data-*` audit proves a native touched tag is missing an attribute.
  3. Do not stage, revert, delete, or reformat unrelated files.
- **Acceptance criteria mapped to blocker 3**:
  - [ ] Pre-existing dirty status is acknowledged.
  - [ ] No generated screenshots/HAR/QA artifacts are edited or staged.
  - [ ] Final fix list contains only files actually edited for these last blockers.

### Phase 2 — Make `NewMemberPage` query-role reactive

- **Files**:
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` — modify.
- **Tasks**:
  1. Replace `currentLocation.split('?')[1]` parsing with the actual current search string.
     - Preferred: import `useSearch` from `wouter`, e.g. `const search = useSearch();`, then parse `new URLSearchParams(search)`.
     - Fallback if `useSearch` is unavailable or fails typecheck: create a minimal reactive search source that reads `window.location.search` and updates on Wouter navigation/popstate, while keeping Wouter path from `useLocation()` in the reset context.
  2. Derive `queryRole` from `search`, and validate it against `getRoleSelectOptionsForAdmin(currentUserRole as RoleSlug)`.
  3. Derive `initialRole` from valid `queryRole`; otherwise fallback to `roleOptions[0]?.value ?? 'staff'` only when allowed by current permissions.
  4. Build a reset context including at least pathname/current Wouter location, actual `search`, `params.competicionSlug`, and `currentUserRole`.
  5. On reset-context change, set form to empty `nombre`, `email`, `password`, `role: initialRole`; clear `errors`; set `submitting` to `false`.
  6. Preserve existing submit guard so stale/manipulated `form.role` cannot submit a disallowed role.
  7. Keep route-aware success/cancel navigation via `resolveBackofficeUsersBasePath`.
- **Acceptance criteria mapped to blocker 1**:
  - [ ] Direct load `/backoffice/users/new?role=staff` selects `staff` and empty fields.
  - [ ] In-app navigation to `/backoffice/users/new?role=registrador` selects `registrador` and clears stale `nombre`, `email`, `password`, `errors`, and `submitting`.
  - [ ] Invalid or forbidden `?role=` falls back to the first allowed role for the current user.
  - [ ] `/backoffice/:competicionSlug/users/new?role=...` behaves the same and preserves slugged navigation.

### Phase 3 — Complete `UsersPage.tsx` role-filter `data-*` compliance

- **Files**:
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx` — modify.
- **Tasks**:
  1. Add a unique semantic `data-ui` to the static option: `data-ui="members-role-filter-option-all"`.
  2. Add a unique semantic `data-ui` to each mapped role option: `data-ui={\`members-role-filter-option-${role}\`}`.
  3. Re-audit the touched `UsersPage.tsx` section for native tags introduced/touched by the patch.
  4. If `NewMemberPage.tsx` receives new native tags for the search fix, every new/touched native tag must also have a unique `data-*` attribute.
- **Acceptance criteria mapped to blocker 2**:
  - [ ] Both `<option>` sites in `UsersPage.tsx` have differentiating `data-*` attributes.
  - [ ] All TSX native tags touched by this last patch have `data-ui`, `data-slot`, `data-role`, or equivalent.
  - [ ] No layout wrappers are added solely for attributes unless layout-neutral.

### Phase 4 — Verification and final review package

- **Files**: no further source edits except minimal fixes required by failed verification.
- **Commands**:
  ```bash
  cd /var/www/grweb/backoffice && npm run typecheck
  cd /var/www/grweb/backoffice && npm run build
  ```
- **Optional backend smoke** only if backend was touched or reviewer requests it:
  ```bash
  cd /var/www/grweb/backend/GrCup.Api && dotnet build GrCup.Api.csproj
  ```
- **Manual/browser sanity flows**:
  1. Open `/backoffice/users/new?role=staff`; confirm role is `staff`, fields are empty, no stale errors/loading.
  2. Fill sample `nombre`, `email`, `password`, then navigate in-app to `/backoffice/users/new?role=registrador`; confirm fields reset and role is `registrador`.
  3. Open `/backoffice/users/new?role=admin` as admin/non-root; confirm role falls back to first allowed option and submit cannot send `admin`/`root`.
  4. Repeat equivalent checks under `/backoffice/:competicionSlug/users/new?role=...`.
  5. Open `/backoffice/users`; inspect role filter options for `data-ui` on “Todos los roles” and all mapped role options.
- **Acceptance criteria mapped to all blockers**:
  - [ ] Backoffice typecheck passes.
  - [ ] Backoffice build passes.
  - [ ] Manual flows prove query-role sync and stale-form reset.
  - [ ] Data audit proves option tags and touched TSX tags comply.
  - [ ] Final diff summary lists only final blocker files.

## Worktree hygiene instructions

- Do not revert unrelated user changes.
- Do not use `git add .`.
- Do not stage generated files, screenshots, HARs, `qa-output/`, `dogfood-output/`, or `.wide-researcher/runs/`.
- If asked to commit later, first inspect `git status`, `git diff`, and staged diff; unstage unrelated files if necessary; stage only files actually edited for this last blocker fix.
- Expected final edit set for source fixes:
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx`
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx`
  - `Plans/fix-backoffice-last-review-blockers.md`

## Risks and rollback notes

- **Wouter API risk**: if `useSearch()` is not exported or returns a value without leading `?`, adapt parsing but keep it reactive and covered by typecheck/build.
- **Atom reset risk**: do not depend on `form` or `errors` in the reset effect, or user input may be erased while typing. Depend only on route/search/current-role context and `initialRole`.
- **Permission fallback risk**: never allow manipulated `?role=admin/root` for non-root users; keep submit validation against allowed `roleOptions`.
- **Dirty worktree risk**: rollback must be focused to the last blocker files only. Do not run broad `checkout`, `reset`, or cleanup commands in this shared tree.

## Archivos a modificar

| Archivo | Acción | Descripción |
|---|---|---|
| `Plans/fix-backoffice-last-review-blockers.md` | crear | Plan executor-ready para los últimos tres blockers. |
| `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` | modificar | Usar search real/reactivo para `?role=`, resetear form/errors/submitting por contexto route/search/current-role. |
| `backoffice/src/pages/backoffice/users/UsersPage.tsx` | modificar | Añadir `data-*` únicos a `<option>` del filtro de roles y re-auditar tags tocados. |
| `backoffice/src/app.tsx` | verificar | Sin cambios esperados; rutas slugless/slugged ya existen. |
| `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts` | verificar | Sin cambios esperados; helper route-aware ya existe. |
