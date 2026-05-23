# Plan: final backoffice review blockers

## Goal

Get the next reviewer-agent verdict to **PASS / APPROVED** for the backoffice remediation by fixing only the four remaining blockers reported after the prior review.

## Non-goals and scope boundaries

- Do not redesign users/inscripciones UX beyond the reported blockers.
- Do not change backend contracts or migrations for these fixes.
- Do not touch `frontend/`, `ferweb/`, generated screenshots/HARs, `qa-output/`, `dogfood-output/`, or `.wide-researcher/runs/`.
- Do not revert unrelated worktree changes. Treat the repository as a dirty shared tree.
- Do not stage broadly. If commit is requested later, stage only the final blocker-fix files.

## Project context noted

- Root `AGENTS.md` applies and requires Project Manager orchestration for implementation, frontend agent skills for code changes, and `data-*` on every native TSX/HTML tag.
- `backoffice/AGENTS.md` and `backend/GrCup.Api/AGENTS.md` were not present when this plan was written.
- `frontend/AGENTS.md` exists but the inspected implementation target is the separate `backoffice/` tree.
- Wide Research MCP was attempted first and failed with `COHERE_API_KEY env not set`; direct file reads were used.

## Exact remaining defects and expected corrected behavior

1. **HIGH — slugless `/backoffice/users` navigation is not route-aware**
   - Files: `backoffice/src/pages/backoffice/users/UsersPage.tsx:171-172`, `236-255`; helper in `UsersPage.helpers.ts`.
   - Current issue: `currentPath` is read but unused, while URLs use `currentCompeticion?.slug` via `routeSlug` and `buildBackofficeUsersPath(routeSlug)`. Opening `/backoffice/users` can navigate to `/backoffice/{currentCompeticion.slug}/users/...`.
   - Expected: use `useParams<{ competicionSlug?: string }>()`, Wouter current path, and `resolveBackofficeUsersBasePath(currentPath, params.competicionSlug)` for role/member/new URLs. Do **not** use `currentCompeticion.slug` as navigation fallback.

2. **HIGH — `NewMemberPage` reads `?role=` only once and lifecycle reset is incomplete**
   - File: `backoffice/src/pages/backoffice/users/NewMemberPage.tsx:48-71`.
   - Current issue: `queryRole` is memoized with `[]` from `window.location.search`; same mounted page navigation between `/users/new?role=staff` and `/users/new?role=registrador` does not update. Reset key only includes `currentUserRole`; `submitting` is not reset.
   - Expected: derive search from current Wouter location/path as a dependency; recompute and validate `queryRole`; include route/search/current-user-role in reset context; reset `form`, `errors`, and `submitting=false` on context change and cleanup/unmount.

3. **MEDIUM — `data-*` compliance remains incomplete in touched TSX**
   - Files/examples:
     - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx:146-147` wrapper `div`s.
     - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx:166` inner content `div`.
     - `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx:150` inner content `div`.
     - `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesControls.tsx:65`, `100`, `108` inner `div`s.
   - Expected: all native tags in touched TSX have unique semantic `data-ui`, `data-slot`, `data-role`, or equivalent attributes. Re-audit full touched TSX set.

4. **MEDIUM — worktree scope remains inflated and unsafe**
   - Current issue: `git status --short` includes unrelated backend/frontend/ferweb changes, generated screenshots/HARs, `qa-output/`, `dogfood-output/`, `.wide-researcher/runs/`, and broad unrelated deletions/changes.
   - Expected: executor fixes only relevant backoffice files, reports a focused file list, does not add generated artifacts, and if later asked to commit stages only those files.

## Ordered implementation phases

### Phase 1 — Worktree isolation before source edits

- **Files**: no source edits.
- **Tasks**:
  1. Run `git status --short` and note that many unrelated changes already exist.
  2. Define the intended edit set before changing code:
     - `backoffice/src/pages/backoffice/users/UsersPage.tsx`
     - `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts`
     - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx`
     - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx`
     - `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx`
     - `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesControls.tsx`
     - this plan file, if included in the review package.
  3. Do not revert, delete, reformat, or stage unrelated files.
- **Acceptance criteria mapped to blocker 4**:
  - [ ] Executor documents pre-existing unrelated status.
  - [ ] No generated screenshots/HARs/output directories are added.
  - [ ] Final review list contains only blocker-related files actually edited.

### Phase 2 — Route-aware users base path

- **Files**:
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx` — modify.
  - `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts` — verify/adjust helper if needed.
  - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx` — modify if back/delete navigation still uses slug-only helper.
  - `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx` — modify if add/view/back navigation still uses slug-only helper.
  - `backoffice/src/app.tsx` — verify only; routes already include slugless and slugged users/new/roles/members.
- **Tasks**:
  1. In `UsersPage.tsx`, import/use `useParams<{ competicionSlug?: string }>()` from Wouter.
  2. Replace `routeSlug = currentCompeticion?.slug` with route-derived slug only: `params.competicionSlug`.
  3. Build `usersBasePath` with `resolveBackofficeUsersBasePath(currentPath, params.competicionSlug)` using `useMemo`.
  4. Use `usersBasePath` in `handleViewRole`, `handleAddMember`, `handleViewMember`, and `handleEditMemberRole`.
  5. Remove `currentCompeticion.slug` from navigation dependencies; it can remain for display/API context only.
  6. For `MemberDetailPage.tsx`, `RoleDetailPage.tsx`, and `NewMemberPage.tsx`, prefer the same route-aware helper pattern if a route can be slugless but `currentCompeticion.slug` exists.
- **Acceptance criteria mapped to blocker 1**:
  - [ ] `/backoffice/users` role card navigates to `/backoffice/users/roles/{role}`.
  - [ ] `/backoffice/users` add member navigates to `/backoffice/users/new?role={role}` or `/backoffice/users/new`.
  - [ ] `/backoffice/users` member actions navigate to `/backoffice/users/members/{id}`.
  - [ ] `/backoffice/:competicionSlug/users` preserves `:competicionSlug` for equivalent actions.
  - [ ] No navigation path uses `currentCompeticion?.slug` as fallback for users routes.

### Phase 3 — Deterministic `NewMemberPage` query role and atom lifecycle

- **Files**:
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` — modify.
  - `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts` — use route helper if needed.
- **Tasks**:
  1. Use Wouter location path as state, e.g. `const [currentLocation, setLocation] = useLocation()`; derive search from the current URL/location and/or `window.location.search` with the location path in dependencies.
  2. Recompute `queryRole` whenever route/search changes; do not memoize it with `[]`.
  3. Validate `queryRole` against `getRoleSelectOptionsForAdmin(currentUserRole)`; fallback to first allowed role or `staff` only if allowed.
  4. Create a reset context key including route path/search, `params.competicionSlug`, and `currentUserRole`.
  5. On reset context change, set form to empty name/email/password and `role: initialRole`, clear `errors`, and set `submitting` to `false`.
  6. Add cleanup on unmount that clears `errors` and sets `submitting` to `false` at minimum; avoid clearing user input on every render.
  7. On submit, keep existing guard that prevents disallowed roles, and ensure success navigation also uses the route-aware users base path.
- **Acceptance criteria mapped to blocker 2**:
  - [ ] `/backoffice/users/new?role=staff` selects `staff` with empty fields.
  - [ ] Navigating in the same mounted page to `/backoffice/users/new?role=registrador` selects `registrador` and clears stale form/errors/submitting.
  - [ ] Slugged new member route behaves the same while preserving slug.
  - [ ] Admin cannot submit `admin`/`root` via stale atom or manipulated query params.

### Phase 4 — Complete `data-*` audit on touched TSX

- **Files**:
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx` — audit any touched tags and icon tags.
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` — modify wrappers at lines 146-147 and re-audit form area.
  - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx` — modify inner content div at line 166 and re-audit all touched tags.
  - `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx` — modify inner content div at line 150 and re-audit all touched tags.
  - `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesControls.tsx` — modify inner divs at lines 65, 100, 108 and re-audit.
  - Any touched extracted components — audit before final review.
- **Checklist**:
  - [ ] Every native tag written/touched has a unique differentiating `data-*` value.
  - [ ] Wrapper/card/content divs use semantic values, e.g. `new-member-card`, `new-member-card-body`, `member-detail-card-body`, `role-detail-card-body`.
  - [ ] Loop attributes include item identifiers/slugs when applicable.
  - [ ] Native buttons that are not submits have `type="button"`.
  - [ ] Custom components receive `data-ui` only if they forward props to DOM; otherwise cover the actual rendered wrapper.
- **Acceptance criteria mapped to blocker 3**:
  - [ ] All reviewer-cited missing attributes are present.
  - [ ] No touched native TSX tag lacks `data-ui`, `data-slot`, `data-role`, or equivalent.
  - [ ] Attribute additions do not introduce layout wrappers or visual regressions unless layout-neutral.

### Phase 5 — Verification and focused review package

- **Files**: no functional edits except minimal fixes required by failed verification.
- **Commands**:
  ```bash
  cd /var/www/grweb/backoffice && npm run typecheck
  cd /var/www/grweb/backoffice && npm run build
  ```
  Backend smoke only if backend was touched, or as final smoke check if reviewer requests it:
  ```bash
  cd /var/www/grweb/backend/GrCup.Api && dotnet build GrCup.Api.csproj
  ```
- **Manual/browser sanity flows**:
  1. Slugless: open `/backoffice/users`; role detail, member detail, and new member actions must remain under `/backoffice/users/...`.
  2. Slugged: open `/backoffice/:competicionSlug/users`; role detail, member detail, and new member actions must remain under `/backoffice/:competicionSlug/users/...`.
  3. New member lifecycle: open `/backoffice/users/new?role=staff`, type values, navigate to `/backoffice/users/new?role=registrador`; selector must reflect `registrador` and stale form/errors/submitting must be reset.
  4. Repeat equivalent new-member flow under `/backoffice/:competicionSlug/users/new?role=...`.
- **Acceptance criteria mapped to all blockers**:
  - [ ] Typecheck and build pass in `/var/www/grweb/backoffice`.
  - [ ] Route-aware checks prove blocker 1 fixed.
  - [ ] New-member query/reset checks prove blocker 2 fixed.
  - [ ] Data audit proves blocker 3 fixed.
  - [ ] Final diff/staging guidance proves blocker 4 controlled.

## Worktree hygiene instructions

- Before and after implementation, capture `git status --short` for awareness only.
- Do not use `git add .`.
- Do not stage or include generated files: screenshots, HAR files, `qa-output/`, `dogfood-output/`, `.wide-researcher/runs/`, or unrelated artifacts.
- Do not revert unrelated user changes or broad frontend/backend deletions.
- Final remediation review list should include only files actually edited for the blockers, expected subset:
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx`
  - `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts`
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx`
  - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx`
  - `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx`
  - `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesControls.tsx`
  - `Plans/fix-backoffice-final-review-blockers.md`

## Risks and rollback notes

- **Route regression risk**: using `currentCompeticion.slug` for navigation will reintroduce slugless-to-slugged failures. Roll back by reverting only users route helper/page changes.
- **Atom reset risk**: overly broad dependencies can erase user input while typing. Reset only when route/search/current-user-role context changes.
- **Search parsing risk**: Wouter location may include or omit query depending on setup. Validate manually; if needed, use `window.location.search` but depend on Wouter location so memo recalculates.
- **Data attribute risk**: adding wrappers can alter layout. Prefer adding attributes to existing tags.
- **Dirty worktree risk**: broad checkout/reset/stage can destroy unrelated work. Roll back only the focused blocker files.

## Archivos a modificar

| Archivo | Acción | Descripción |
|---|---|---|
| `Plans/fix-backoffice-final-review-blockers.md` | crear | Plan executor-ready para los cuatro blockers finales. |
| `backoffice/src/pages/backoffice/users/UsersPage.tsx` | modificar | Usar params + current path para navegación route-aware; auditar `data-*` en tags tocados. |
| `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts` | modificar/verificar | Reutilizar/endurecer `resolveBackofficeUsersBasePath(currentPath, routeSlug)`; evitar fallback por `currentCompeticion.slug`. |
| `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` | modificar | Recalcular `?role=` por location/search, resetear form/errors/submitting por contexto, navegación route-aware, `data-*`. |
| `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx` | modificar | Completar `data-*`; usar navegación base route-aware si aplica. |
| `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx` | modificar | Completar `data-*`; usar navegación base route-aware si aplica. |
| `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesControls.tsx` | modificar | Completar `data-*` en divs internos citados y re-auditar componente. |
| `backoffice/src/app.tsx` | verificar | Confirmar rutas slugless/slugged; modificar solo si se detecta inconsistencia. |
