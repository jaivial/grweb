# Plan: remaining backoffice remediation review issues

## Goal

Get the next reviewer-agent verdict to **PASS** for the backoffice inscripciones/users remediation, with a focused changeset that only addresses the six remaining findings.

## Non-goals and scope boundaries

- Do not redesign the backoffice, migrate routes again, or refactor unrelated areas.
- Do not touch `frontend/`, `ferweb/`, backend migrations, Docker, generated screenshots, QA artifacts, or unrelated backend changes for this fix.
- Do not change the backend users API unless the frontend contract cannot be satisfied with the existing paginated endpoints.
- Do not revert unrelated user/worktree changes. Stage/review only files explicitly required by this remediation.
- Do not use `git add .`; keep screenshots/HAR files/`qa-output/`/`dogfood-output/`/wide-research runs out of the fix.

## Current context and assumptions

- `backoffice/AGENTS.md` and `backend/GrCup.Api/AGENTS.md` were not present when this plan was written. Root `AGENTS.md` applies; `frontend/AGENTS.md` exists but this remediation targets the separate `backoffice/` tree.
- Wide Research MCP was attempted first, but failed with `COHERE_API_KEY env not set`; scoping proceeded by reading the requested files directly.
- The worktree is currently heavily inflated: many unrelated modified/deleted files and many untracked screenshots/artifacts exist. Treat this as a dirty shared tree.
- Backend `GET /api/competition/{competicionId}/users` returns `{ success: true, data: { items, totalCount, page, pageSize, totalPages } }` and clamps `pageSize` to max `100`.
- `api.getCompetitionUsers(competicionId, { page, pageSize, search, role })` already exists and should be the canonical list API.

## Defect list and expected corrected behavior

1. **HIGH — incomplete users list/counts due to default page of 20**
   - Files: `backoffice/src/pages/backoffice/users/UsersPage.tsx`, `UsersPage.helpers.ts`, `UsersPage.atoms.ts`, optional `UsersPage.constants.ts`, `backoffice/src/api/client.ts`.
   - Expected: `UsersPage` uses paginated API parameters and metadata; member rows represent the selected page/filter; role cards/counts are complete for competitions with >20 users.

2. **HIGH — slugless users navigation becomes slugged**
   - Files: `UsersPage.tsx`, `UsersPage.helpers.ts`, `MemberDetailPage.tsx`, `RoleDetailPage.tsx`, `NewMemberPage.tsx`, verify `backoffice/src/app.tsx`.
   - Expected: navigation starting under `/backoffice/users...` remains slugless; navigation starting under `/backoffice/:competicionSlug/users...` preserves that slug. Never generate `/backoffice/undefined/...`.

3. **HIGH — stale `NewMemberPage` atom and query role only applied once**
   - File: `NewMemberPage.tsx`, optional shared constants/helpers.
   - Expected: form resets deterministically on mount/route key changes; `?role=` is re-applied when query/current permissions change; invalid or disallowed query roles fall back to first allowed role, with no stale name/email/password/errors/submitting state.

4. **MEDIUM — edit/delete still enabled for protected root/admin rows**
   - Files: `UsersPage.tsx`, `UsersPage.helpers.ts`, `MemberDetailPage.tsx`, `RoleDetailPage.tsx`.
   - Expected: target-role-aware UI disables or hides edit/delete/add actions for rows/roles the current user cannot modify. Admin users cannot edit/delete root/admin targets or invite root/admin via role-card shortcuts.

5. **MEDIUM — required `data-*` compliance incomplete**
   - Files: `MemberDetailPage.tsx`, `RoleDetailPage.tsx`, `NewMemberPage.tsx`, `InscripcionesControls.tsx`, plus touched sections of `UsersPage.tsx` and `Inscripciones.tsx`/extracted inscripciones components.
   - Expected: every native HTML tag written/touched in TSX has a unique differentiating `data-ui`, `data-slot`, `data-role`, or equivalent. Loop values include the relevant id/slug/capability.

6. **MEDIUM — worktree scope inflated**
   - Files: process-only; final staged set should be limited to this plan and relevant backoffice remediation files.
   - Expected: executor documents pre-existing unrelated changes, avoids generated artifacts, and presents a focused diff.

## Data/API contract notes for users pagination/search/filter/counts

- Prefer **proper pagination** over an “all members” fetch. Do not rely on backend default page size `20`.
- `UsersPage` should call `api.getCompetitionUsers(competicionId, { page, pageSize, search, role })` with explicit state.
- Store/use `totalCount`, `page`, `pageSize`, and `totalPages` from the response for table pagination.
- Role-card counts must not be computed only from the current page. Use `api.getCompetitionRoles(competicionId)` / role `memberCount` if available, or fetch per-role metadata explicitly. If an all-members fallback is chosen, document the limit and ensure it is safe for >100 users; current backend max `pageSize` is `100`, so a single all-members request is not sufficient.
- Normalize `MemberDetail` to `CompetitionMember` with `usuarioId = item.id`, stable dates, and pending/accepted fields. Avoid `new Date().toISOString()` as a fake stable `createdAt` if sorting or snapshots rely on it; prefer API invitation timestamps or an empty documented fallback.
- Search/filter behavior should reset to page `1` when `search` or `role` changes.

## Ordered phases and executor-ready tasks

### Phase 1 — Worktree isolation and baseline

- **Files**: no source changes except this plan file.
- **Tasks**:
  1. Run `git status --short` and identify unrelated modified/untracked files.
  2. Confirm the intended source edit set before changing code.
  3. Do not delete/revert unrelated files or generated artifacts.
- **Acceptance criteria mapped to finding 6**:
  - [ ] Executor notes pre-existing unrelated changes.
  - [ ] No screenshots, HARs, QA outputs, `dogfood-output/`, or `.wide-researcher/runs/` are included.
  - [ ] Final staged/reviewed files are limited to this remediation.

### Phase 2 — Users list pagination, filters, metadata, and counts

- **Files**:
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx` — modify.
  - `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts` — modify.
  - `backoffice/src/pages/backoffice/users/UsersPage.atoms.ts` — modify if pagination/filter state is atomized.
  - `backoffice/src/pages/backoffice/users/UsersPage.constants.ts` — modify if adding page-size/filter constants.
  - `backoffice/src/api/client.ts` — verify; modify only if `getCompetitionMembers` remains misleading.
- **Tasks**:
  1. Replace `api.getCompetitionMembers(competicionId)` loading in `UsersPage` with `api.getCompetitionUsers(competicionId, { page, pageSize, search, role })`.
  2. Add minimal table controls: search input, role filter, page size if needed, next/previous or numbered pagination.
  3. Persist response metadata (`totalCount`, `page`, `pageSize`, `totalPages`) and render a clear “showing X-Y of Z” summary.
  4. Load complete role counts separately from `api.getCompetitionRoles(competicionId)` and use `memberCount` for role cards.
  5. Keep `normalizeCompetitionUsersResponse` focused on `items`; add tests or explicit manual checks for `items.length < totalCount`.
- **Acceptance criteria mapped to finding 1**:
  - [ ] A competition with >20 users shows complete role-card counts, not just counts from the first page.
  - [ ] Table pagination can access users beyond backend default page 1/page size 20.
  - [ ] Search and role filter call the API with `search`/`role` and reset to page `1`.
  - [ ] Empty/loading/error states distinguish “no members for current filter” from API failure.

### Phase 3 — Route-aware slugless/slugged navigation

- **Files**:
  - `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts` — modify navigation helper.
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx` — modify handler inputs.
  - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx` — modify back/delete navigation.
  - `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx` — modify add/view/back navigation.
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` — modify cancel/create-success navigation.
  - `backoffice/src/app.tsx` — verify only; routes currently include both slugless and slugged variants.
- **Tasks**:
  1. Introduce a route-aware helper such as `resolveBackofficeUsersBasePath({ currentPath, routeSlug })`.
  2. If `currentPath` starts with `/backoffice/users` or `/backoffice/members`, return `/backoffice/users` even if `currentCompeticion.slug` exists.
  3. If `params.competicionSlug` is present and valid, return `/backoffice/{params.competicionSlug}/users`.
  4. Treat `undefined`, empty string, and literal `'undefined'` as slugless.
  5. Use the helper consistently for role, member, new-member, cancel, back, and delete-success URLs.
- **Acceptance criteria mapped to finding 2**:
  - [ ] `/backoffice/users` → role card → `/backoffice/users/roles/{role}`.
  - [ ] `/backoffice/users` → add member → `/backoffice/users/new?role={role}`.
  - [ ] `/backoffice/users` → member row → `/backoffice/users/members/{id}`.
  - [ ] `/backoffice/{slug}/users` preserves `{slug}` for all equivalent actions.
  - [ ] No navigation uses `currentCompeticion?.slug` as a fallback that changes a slugless route into a slugged route.

### Phase 4 — Deterministic `NewMemberPage` form reset and role query sync

- **Files**:
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` — modify.
  - `backoffice/src/pages/backoffice/users/UsersPage.constants.ts` — verify/reuse allowed role options.
- **Tasks**:
  1. Derive `roleOptions` from `getRoleSelectOptionsForAdmin(currentUserRole)`.
  2. Derive `initialRole` from the current location search (`useLocation()` path/search or equivalent), not a one-time `window.location.search` read.
  3. Validate query role against allowed options; fallback to first allowed option or `'staff'` if allowed.
  4. Reset form atom to `{ nombre: '', email: '', password: '', role: initialRole }` when the page route/search/current user role changes enough to define a new form context.
  5. Reset `errors` and `submitting` on mount/context change and optionally cleanup on unmount.
  6. Prevent submit if `form.role` is no longer in `roleOptions`.
- **Acceptance criteria mapped to finding 3**:
  - [ ] Visiting `/users/new?role=registrador` selects `registrador` every time.
  - [ ] Navigating from `/users/new?role=staff` to `/users/new?role=registrador` updates the selector deterministically.
  - [ ] Returning to new-member after partially filling a prior form does not retain stale name/email/password/errors/submitting state.
  - [ ] Admin users cannot create `admin`/`root` through stale atom data or manipulated query params.

### Phase 5 — Target-role-aware protected actions

- **Files**:
  - `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts` — verify or extend `canEditMemberRole`/permission helper.
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx` — modify role cards and rows.
  - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx` — verify detail actions use same target-role rule.
  - `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx` — modify add-member visibility for protected roles.
- **Tasks**:
  1. Compute per-member action permission as `canManageUsers && canEditMemberRole({ isRoot, targetRole: normalizeMemberRole(member.role) })`.
  2. Disable or hide edit/delete buttons for root/admin targets when current user is admin; include accessible label/title explaining why if disabled.
  3. Role cards: only show “Añadir” for roles the current user can assign. Admin should not see add actions for `root`/`admin`.
  4. Role detail: hide/disable “Añadir miembro” for protected roles when current user cannot assign them.
  5. Keep backend authorization as source of truth; UI only prevents misleading actions.
- **Acceptance criteria mapped to finding 4**:
  - [ ] Admin user sees root/admin rows as protected; edit/delete cannot be clicked/submitted from list.
  - [ ] Root user can still manage roles according to existing rules.
  - [ ] Protected role-card add shortcuts are absent/disabled for admin.
  - [ ] Member detail still blocks protected target edit/delete with consistent UI state and messages.

### Phase 6 — `data-*` compliance audit on touched TSX

- **Files**:
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx`.
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx`.
  - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx`.
  - `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx`.
  - `backoffice/src/pages/backoffice/inscripciones/Inscripciones.tsx`.
  - `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesControls.tsx`.
  - Any touched extracted inscripciones component/hook TSX.
- **Specific audit instructions**:
  1. Every native tag (`div`, `span`, `p`, `h*`, `form`, `label`, `input`, `table`, `tr`, `td`, `button`, `dl`, `dt`, `dd`, etc.) written or touched must have a unique `data-*` value.
  2. In `NewMemberPage.tsx`, add data attributes to wrapper card/content `div`s, `form`, all `label`s, action row, both `Button` components, and pass `data-ui` to `Input`/`CustomSelector` if supported.
  3. In `MemberDetailPage.tsx`, cover loading skeleton inner `div`s, error `p`, all `Button`s, avatar/status `span`s, section headings, `dl`, every `dt`/`dd`, and action wrappers.
  4. In `RoleDetailPage.tsx`, cover loading skeleton tags, error `p`, icon containers, capability/restriction wrappers, “Sin restricciones” span, member loop row tags with `member.id`, status spans, and button `type="button"` where native.
  5. In `InscripcionesControls.tsx`, cover inner text/icon `div`s at prepared/responsable sections, `Check` icon or wrapper, `Button`, and ensure any custom component receives `data-ui` if it renders DOM.
  6. In loops, values must be unique: e.g. `data-ui={\`role-capability-${role.slug}-${cap}\`}`, `data-ui={\`role-member-row-${member.id}\`}`.
  7. Do not add attributes to fragments; replace fragments only if a real wrapper is acceptable and does not alter layout.
- **Acceptance criteria mapped to finding 5**:
  - [ ] Reviewer examples in `MemberDetailPage.tsx`, `RoleDetailPage.tsx`, `NewMemberPage.tsx`, and `InscripcionesControls.tsx` are all covered.
  - [ ] No touched native TSX tag lacks a differentiating `data-*` attribute.
  - [ ] Repeated loop attributes include IDs/slugs and are unique in their block.
  - [ ] Buttons that are not form submits include `type="button"`.

### Phase 7 — Focused verification and final review package

- **Files**: no source changes except fixes required by failed verification.
- **Tasks**:
  1. Run the verification commands below.
  2. Perform manual browser sanity flows below for slugless/slugged users and new-member role query.
  3. Produce a final diff summary listing only remediation files.
- **Acceptance criteria mapped to all findings**:
  - [ ] Findings 1–5 have direct code evidence and manual/command verification.
  - [ ] Finding 6 is satisfied by a focused final diff and no generated artifacts.
  - [ ] Reviewer can reproduce PASS conditions from the checklist.

## Verification checklist and commands

Run from `/var/www/grweb` unless noted:

```bash
git status --short
npm run typecheck --prefix backoffice
npm run build --prefix backoffice
```

Run backend only if backend source is touched:

```bash
dotnet build backend/GrCup.Api/GrCup.Api.csproj
```

Recommended focused diff checks:

```bash
git diff -- backoffice/src/pages/backoffice/users backoffice/src/pages/backoffice/inscripciones backoffice/src/api/client.ts backoffice/src/app.tsx Plans/fix-backoffice-remaining-review-issues.md
git diff --stat
```

## Manual/browser sanity flows

### Slugless users flow

1. Open `/backoffice/users`.
2. Verify role cards show complete counts for all roles and table summary shows total/page metadata.
3. Click a role card: URL must be `/backoffice/users/roles/{role}`.
4. Click “Añadir” from a role: URL must be `/backoffice/users/new?role={role}`.
5. Click a member row/view: URL must be `/backoffice/users/members/{id}`.
6. Use back/cancel/delete-success navigation: must return to `/backoffice/users`.

### Slugged users flow

1. Open `/backoffice/{competicionSlug}/users`.
2. Repeat role/new/member navigation.
3. Every URL must preserve `/backoffice/{competicionSlug}/users...`.
4. Refresh role and member detail pages; they should reload their API data and back buttons should preserve slug.

### New-member role query flow

1. Open `/backoffice/users/new?role=registrador`; selector is `registrador`, other fields empty.
2. Fill name/email/password, navigate away, return to `/backoffice/users/new?role=staff`; fields are empty and role is `staff`.
3. As admin, open `/backoffice/users/new?role=admin` and `/backoffice/users/new?role=root`; role falls back to allowed role and submit cannot send protected role.
4. As root, verify allowed options match product rules.

### Protected action flow

1. As admin, view list containing `root` or `admin` rows.
2. Confirm edit/delete are hidden or disabled and cannot call mutation handlers.
3. As admin, root/admin role cards do not offer add-member shortcuts.
4. As root, verify intended management actions remain available.

## Risk and rollback notes

- **Pagination risk**: introducing pagination changes UX. Roll back by reverting only `UsersPage*` pagination state/helpers, not backend.
- **Counts risk**: role counts from `/roles` may differ from filtered table counts by design. Label cards as global role totals; table summary as current filter/page.
- **Route risk**: helper must prefer the actual current route over `currentCompeticion.slug` to avoid slugless-to-slugged regressions.
- **Atom reset risk**: resetting on every render can erase user input. Depend only on route/search/current-role context, not `form` itself.
- **Permission risk**: UI restrictions must mirror backend but not replace it. If backend rejects, show toast and keep UI consistent.
- **Data attribute risk**: adding wrappers can alter layout. Prefer attributes on existing tags; add wrappers only when layout-neutral.
- **Rollback procedure**: revert the focused remediation files from the final diff. Do not use broad checkout/reset in this dirty worktree.

## Archivos a modificar

| Archivo | Acción | Descripción |
|---|---|---|
| `Plans/fix-backoffice-remaining-review-issues.md` | crear | Plan executor-ready para las seis incidencias restantes. |
| `backoffice/src/pages/backoffice/users/UsersPage.tsx` | modificar | Paginación/metadata, role counts, route-aware navigation, protected row actions, data attributes. |
| `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts` | modificar | Normalización, helper route-aware, target-role permission helper. |
| `backoffice/src/pages/backoffice/users/UsersPage.atoms.ts` | modificar opcional | Estado de paginación/filtros/metadatos si se decide atomizar. |
| `backoffice/src/pages/backoffice/users/UsersPage.constants.ts` | modificar opcional | Page sizes, role filter options, allowed role helpers. |
| `backoffice/src/api/client.ts` | verificar/modificar opcional | Mantener `getCompetitionUsers` como API canónica; evitar método legacy confuso. |
| `backoffice/src/app.tsx` | verificar/modificar opcional | Confirmar rutas slugless/slugged para users/new/roles/members. |
| `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` | modificar | Reset/sync determinístico del atom, query role, permisos, data attributes. |
| `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx` | modificar | Navegación route-aware, protected actions, data attributes. |
| `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx` | modificar | Navegación route-aware, add-member permissions, data attributes. |
| `backoffice/src/pages/backoffice/inscripciones/Inscripciones.tsx` | modificar solo si se toca | Completar data attributes en secciones afectadas. |
| `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesControls.tsx` | modificar | Completar data attributes y button/icon attributes. |
| `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesFiltersAccordion.tsx` | modificar si se toca | Mantener cumplimiento `data-*`. |
| `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesQrModal.tsx` | modificar si se toca | Mantener cumplimiento `data-*`. |
