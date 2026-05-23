# Plan de remediación: backoffice inscripciones/users review

## Objetivo

Corregir los defectos que provocaron el rechazo de la implementación de `backoffice/plan-backoffice-inscripciones-users.html`, manteniendo contratos API/UI, reglas del proyecto y el alcance estrictamente limitado a users/inscripciones.

## No objetivos

- No rediseñar el backoffice completo ni cambiar navegación fuera de `/backoffice/users` e `/backoffice/inscripciones`.
- No modificar endpoints no relacionados ni hacer migraciones de base de datos.
- No resolver cambios previos no relacionados del worktree; deben aislarse o dejarse intactos.

## Contexto y arquitectura propuesta

- Backend `GET /api/competition/{competicionId}/users` ya devuelve `success: true, data: { items, totalCount, page, pageSize, totalPages }` desde `backend/GrCup.Api/Endpoints/CompetitionUsersEndpoints.cs`.
- Frontend debe consumir ese contrato mediante `api.getCompetitionUsers(...)` y mapear `MemberDetail[]` a la estructura usada por la lista (`CompetitionMember[]`) o actualizar los átomos/tipos para aceptar el shape paginado de forma consistente.
- Las rutas con y sin `:competicionSlug` deben compartir un helper de URL que evite interpolar `undefined`.
- Las opciones de roles deben centralizarse en `getRoleSelectOptionsForAdmin(currentUserRole)` para impedir que usuarios `admin` asignen `admin`/`root`.
- `Inscripciones.tsx` debe dividirse en subcomponentes/hooks para cumplir el límite de 800 líneas sin cambiar comportamiento.

## Defectos conocidos a corregir

1. **CRITICAL — Crash en users list**
   - `backoffice/src/api/client.ts:414` tipa `getCompetitionMembers` como `CompetitionMember[]`, pero el backend devuelve un objeto paginado.
   - `backoffice/src/pages/backoffice/users/UsersPage.tsx:168-170` asigna `response.data` directo al atom `CompetitionMember[]`.
   - Backend/listado usa datos con `id` en `MemberDetail`; filas usan `member.usuarioId`.

2. **HIGH — Links con `/backoffice/undefined/...`**
   - `UsersPage.tsx:181-196`, `MemberDetailPage.tsx:100,155,284`, `RoleDetailPage.tsx:75,79,115` interpolan `params.competicionSlug` o `currentCompeticion?.slug` sin fallback.
   - Aunque `app.tsx:70-88` tiene rutas slugless y con slug, las páginas de detalle no construyen rutas slugless correctamente.

3. **HIGH — `initialRole` no se aplica al formulario**
   - `NewMemberPage.tsx:47-54` calcula `initialRole`, pero el atom `newMemberAtoms.form` mantiene `role: 'staff'`.

4. **HIGH — Admin UI ofrece rol prohibido**
   - `NewMemberPage.tsx:12,16,185` importa `getRoleSelectOptionsForAdmin`, pero usa `NEW_MEMBER_ROLE_OPTIONS` que incluye `admin` para cualquier usuario no root.
   - Verificar también `MemberDetailPage.tsx:247-253`, actualmente usa el helper y debe conservarlo.

5. **MEDIUM — TSX sin `data-*` único**
   - Ejemplos en `Inscripciones.tsx`: divs internos, `h1/p`, iconos, spans de toggle, botones sin `type`, fragments de iconos, inputs/labels en filtros, overlay submission text.
   - Ejemplos en users detail pages: loading skeleton divs, labels, `dt/dd`, status spans, buttons/rendered children sin atributos cuando corresponda.

6. **MEDIUM — `Inscripciones.tsx` excede 800 líneas**
   - Archivo actual: 944 líneas. Debe extraerse lógica/UI a archivos pequeños bajo `backoffice/src/pages/backoffice/inscripciones/`.

7. **MEDIUM — Worktree scope inflado**
   - El executor debe revisar `git status` antes de editar y no mezclar cambios no relacionados con esta remediación.

## Fases de implementación

### Fase 1: Aislar alcance y confirmar contratos

- **Archivos**: no modificar código aún; inspección de estado.
- **Tareas**:
  - Revisar `git status --short` y anotar archivos ya modificados por otros cambios.
  - Confirmar shape real de `CompetitionUsersResponse` en `backoffice/src/types/api.ts` y endpoint en `CompetitionUsersEndpoints.cs`.
- **Criterios de aceptación**:
  - [ ] Se identifican cambios no relacionados antes de editar.
  - [ ] El executor no revierte ni reformatea archivos fuera de esta lista salvo aprobación explícita.

### Fase 2: Corregir carga y normalización del listado de users

- **Archivos**:
  - `backoffice/src/api/client.ts` (modificar)
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx` (modificar)
  - `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts` (modificar o crear helper cercano)
  - `backoffice/src/types/api.ts` (modificar solo si hace falta compatibilidad de tipos)
- **Tareas**:
  - Cambiar `getCompetitionMembers` para delegar en `getCompetitionUsers` y devolver/normalizar `items`, o cambiar `UsersPage` para llamar directamente a `getCompetitionUsers`.
  - Convertir cada item paginado a filas con identificador estable: `usuarioId = item.usuarioId ?? item.id` y campos de invitación compatibles (`invitationAccepted`, `invitedAt`).
  - Evitar acceso a `member.usuarioId` si no existe.
- **Criterios de aceptación**:
  - [ ] `/backoffice/users` y `/backoffice/:slug/users` no crashean con respuesta paginada.
  - [ ] Las filas renderizan keys/data-ui con IDs definidos.
  - [ ] El contrato del backend no se rompe ni se cambia innecesariamente.

### Fase 3: Corregir navegación slugless/slugged

- **Archivos**:
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx` (modificar)
  - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx` (modificar)
  - `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx` (modificar)
  - `backoffice/src/app.tsx` (verificar/modificar solo si hay inconsistencia)
- **Tareas**:
  - Crear helper local o compartido `getBackofficeUsersBasePath({ routeSlug, currentSlug })` que devuelva `/backoffice/{slug}/users` si hay slug válido, o `/backoffice/users` si no.
  - Usar ese helper para navegar a role detail, member detail, new member, delete success, error/back buttons.
  - Validar que `app.tsx` conserva rutas con y sin slug para `users`, `users/new`, `users/roles/:roleSlug`, `users/members/:usuarioId`.
- **Criterios de aceptación**:
  - [ ] Ninguna navegación genera `/backoffice/undefined/...`.
  - [ ] Las rutas slugless recargan y vuelven correctamente a `/backoffice/users`.
  - [ ] Las rutas con slug conservan el slug actual.

### Fase 4: Aplicar rol inicial y permisos de selección

- **Archivos**:
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` (modificar)
  - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx` (verificar/modificar si procede)
  - `backoffice/src/pages/backoffice/users/UsersPage.constants.ts` (modificar si hace falta helper adicional)
- **Tareas**:
  - Inicializar o sincronizar el atom del formulario con `?role=` una sola vez al montar/cambiar query, validando contra opciones permitidas para el rol actual.
  - Usar `getRoleSelectOptionsForAdmin(currentUserRole)` en `NewMemberPage` en lugar de `NEW_MEMBER_ROLE_OPTIONS` global.
  - Para usuarios `admin`, permitir solo `staff` y `registrador`; para `root`, permitir lo definido por producto (incluyendo `admin`; `root` solo si está explícitamente permitido).
- **Criterios de aceptación**:
  - [ ] `/users/new?role=registrador` abre el selector con `registrador` seleccionado.
  - [ ] Un usuario `admin` no ve ni puede enviar rol `admin`/`root` desde UI.
  - [ ] `MemberDetailPage` mantiene las mismas restricciones al cambiar rol.

### Fase 5: Completar atributos `data-*` obligatorios

- **Archivos**:
  - `backoffice/src/pages/backoffice/users/UsersPage.tsx` (modificar)
  - `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx` (modificar)
  - `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx` (modificar)
  - `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` (modificar)
  - `backoffice/src/pages/backoffice/inscripciones/Inscripciones.tsx` y archivos extraídos (modificar)
- **Tareas**:
  - Añadir `data-ui`, `data-slot` o equivalente a todo tag TSX nuevo/existente tocado, con valor único dentro del bloque lógico.
  - Añadir `type="button"` a botones no submit donde falte.
  - Evitar valores genéricos repetidos en loops; usar IDs/roles/capability slugs.
- **Criterios de aceptación**:
  - [ ] No quedan tags tocados sin `data-*` diferenciador.
  - [ ] Los `data-ui` en `.map(...)` son únicos por item.
  - [ ] No se altera layout/estilos por añadir atributos.

### Fase 6: Reducir `Inscripciones.tsx` por debajo de 800 líneas

- **Archivos**:
  - `backoffice/src/pages/backoffice/inscripciones/Inscripciones.tsx` (modificar)
  - `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesControls.tsx` (crear sugerido)
  - `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesQrModal.tsx` (crear sugerido)
  - `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesFiltersAccordion.tsx` (crear sugerido)
  - `backoffice/src/pages/backoffice/inscripciones/hooks/useInscripcionesSettings.ts` (crear sugerido si se extraen toggles)
- **Tareas**:
  - Extraer `FiltersAccordion` a archivo propio.
  - Extraer modal QR y/o bloques de toggles de preparadas/responsable a componentes con props explícitas.
  - Mantener hooks Jotai/useMemo/useCallback y no introducir `useState` nuevo innecesario fuera de componentes locales existentes.
- **Criterios de aceptación**:
  - [ ] `Inscripciones.tsx` queda por debajo de 800 líneas.
  - [ ] Cada archivo nuevo queda por debajo de 800 líneas.
  - [ ] Export PDF, click en nombre, QR, delete, filtros y paginación siguen funcionando.

### Fase 7: Validación final y reporte de alcance

- **Archivos**: no cambios funcionales salvo fixes mínimos de compilación.
- **Criterios de aceptación**:
  - [ ] Typecheck y build de backoffice pasan.
  - [ ] Build backend pasa si se tocó backend.
  - [ ] Se reportan archivos modificados y se confirma que no se tocaron cambios no relacionados.

## Comandos de verificación

Ejecutar desde el repo según corresponda:

```bash
git status --short
npm run typecheck --prefix backoffice
npm run build --prefix backoffice
dotnet build backend/GrCup.Api/GrCup.Api.csproj
```

Validación manual mínima:

- Abrir `/backoffice/users`, `/backoffice/{slug}/users`, `/backoffice/users/roles/staff`, `/backoffice/users/members/{id}`, `/backoffice/users/new?role=registrador`.
- Confirmar que users list carga con paginación backend y que botones Ver/Añadir/Editar/Eliminar navegan sin `undefined`.
- Confirmar que admin no puede elegir rol `admin` ni `root` en creación/edición.
- Abrir `/backoffice/inscripciones`, probar filtros, export PDF, click en nombre, QR y eliminación.

## Riesgos y rollback

- **Contrato users**: cambiar backend es más riesgoso; preferir adaptar frontend al shape paginado existente. Rollback: revertir solo cambios en client/helpers/users pages.
- **Átomos Jotai en páginas detail/new**: los átomos definidos en módulo pueden persistir entre navegaciones. Si aparecen valores stale, resetear explícitamente en `useEffect` al montar/desmontar.
- **Rutas slugless**: helper de navegación debe tratar `undefined`, cadena vacía y literal `'undefined'` como sin slug.
- **Refactor Inscripciones**: hacer extracciones mecánicas sin cambios de comportamiento. Rollback: revertir archivos nuevos y restaurar `Inscripciones.tsx` previo.
- **Scope**: no usar `git add .`; stagear solo archivos de esta remediación. No revertir cambios preexistentes sin aprobación.

## Archivos a modificar

| Archivo | Acción | Descripción |
|---|---|---|
| `backoffice/src/api/client.ts` | modificar | Alinear método users con respuesta paginada o delegar en API extendida. |
| `backoffice/src/types/api.ts` | modificar opcional | Ajustar tipos compat si se decide unificar `MemberDetail`/`CompetitionMember`. |
| `backoffice/src/pages/backoffice/users/UsersPage.tsx` | modificar | Cargar `items`, normalizar IDs, corregir navegación y data attributes. |
| `backoffice/src/pages/backoffice/users/UsersPage.helpers.ts` | modificar | Añadir normalizador de miembros/URL helper si se ubica aquí. |
| `backoffice/src/pages/backoffice/users/UsersPage.constants.ts` | modificar opcional | Reutilizar helpers de opciones por rol. |
| `backoffice/src/pages/backoffice/users/MemberDetailPage.tsx` | modificar | Navegación sin `undefined`, data attributes, permisos de rol. |
| `backoffice/src/pages/backoffice/users/RoleDetailPage.tsx` | modificar | Navegación sin `undefined`, data attributes únicos en loops. |
| `backoffice/src/pages/backoffice/users/NewMemberPage.tsx` | modificar | Aplicar `initialRole`, filtrar opciones por rol actual, data attributes. |
| `backoffice/src/app.tsx` | verificar/modificar | Mantener rutas slugless y con slug coherentes. |
| `backoffice/src/pages/backoffice/inscripciones/Inscripciones.tsx` | modificar | Añadir data attributes y extraer componentes para <800 líneas. |
| `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesControls.tsx` | crear opcional | Bloques de preparadas/responsable. |
| `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesQrModal.tsx` | crear opcional | Modal de QR extraído. |
| `backoffice/src/pages/backoffice/inscripciones/components/InscripcionesFiltersAccordion.tsx` | crear | Filtros extraídos desde `Inscripciones.tsx`. |
| `backoffice/src/pages/backoffice/inscripciones/hooks/useInscripcionesSettings.ts` | crear opcional | Lógica de settings si se extraen toggles. |

## Nota de reglas del proyecto

- Las reglas globales de `AGENTS.md` aplican. No existe `backoffice/AGENTS.md` ni `backend/GrCup.Api/AGENTS.md` al momento de elaborar este plan.
- Cualquier implementación frontend debe ser delegada por Project Manager a `front-developer` con `frontenac`, `front-design`, `frontend-design` e `impeccable`, y validada por QA según reglas del repo.
