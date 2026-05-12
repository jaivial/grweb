# Plan: Configuración Backoffice FER - Tareas Completas

## Resumen del Estado Actual

El sistema ya tiene implementado:
- ✅ Modelo `Inscripcion` con todos los campos (nombre, email, instagram, telefono, sexo, categoriaPeso, experiencia, quiereHandler, etc.)
- ✅ Modelo `EventoConfig` con precios dinámicos (PrecioBase, PrecioHandler, AforoMaximo)
- ✅ Endpoints de check-in y QR para confirmación de participación y pago
- ✅ Emails FER (confirmación, pago, admin notification)
- ✅ QR Reader con toda la lógica de estados
- ✅ Tablas diferentes en backoffice para FER vs GR Cup
- ✅ Configuración de evento con precios dinámicos
- ✅ Formulario FER con niveles de experiencia y descripciones
- ✅ Toggle de handler con mensaje dinámico

---

## TAREAS PENDIENTES

### 1. BACKEND - Mejoras

#### 1.1 Agregar "rookie" a estadísticas de experiencia
**Archivo:** `backend/GrCup.Api/Services/InscripcionService.cs`
**Problema:** Las estadísticas solo incluyen `principiante`, `intermedio`, `avanzado`
**Solución:** Agregar `rookie` al diccionario `PorExperiencia`

```csharp
PorExperiencia: new Dictionary<string, int>
{
    ["rookie"] = inscripciones.Count(i => i.Experiencia == "rookie"),
    ["principiante"] = inscripciones.Count(i => i.Experiencia == "principiante"),
    ["intermedio"] = inscripciones.Count(i => i.Experiencia == "intermedio"),
    ["avanzado"] = inscripciones.Count(i => i.Experiencia == "avanzado")
}
```

#### 1.2 Mejorar email admin de FER con todos los datos del atleta
**Archivo:** `backend/GrCup.Api/Services/EmailService.cs`
**Método:** `BuildFerAdminNotificationHtml`
**Agregar:** 
- Experiencia (con label completo)
- Peso aproximado
- Quiere handler (Sí/No + precio)
- Total pagado
- Sexo
- Notas

#### 1.3 Crear endpoint de precios dinámicos para frontend
**Archivo:** `backend/GrCup.Api/Endpoints/InscripcionConfigEndpoints.cs` o `CompeticionEndpoints.cs`
**Nuevo endpoint:** `GET /api/competiciones/:slug/config` que devuelva:
- PrecioBase
- PrecioHandler
- PrecioUpsell
- AforoMaximo
- PlazasDisponibles
- InscripcionAbierta
- Lista de categorías de peso (desde horarios publicados)

---

### 2. FRONTEND BACKOFFICE - Configuración Inscripciones FER

#### 2.1 Sección de configuración de inscripciones en backoffice
**Archivos:** 
- `frontend/src/pages/backoffice/config/InscripcionConfig.tsx` (ya existe)
- `backend/GrCup.Api/Endpoints/InscripcionConfigEndpoints.cs` (verificar)

**Campos a incluir:**
- Precio de inscripción (PrecioBase)
- Precio del servicio handler (PrecioHandler)
- Aforo máximo (AforoMaximo)
- Mensaje personalizado para pago pendiente

#### 2.2 Selector de categoría de peso en editing de inscripciones
**Archivo:** `frontend/src/pages/backoffice/InscripcionesPage.tsx`
**Problema:** El input de categoría peso es un campo de texto libre
**Solución:** Cambiar a un selector dropdown que cargue las categorías desde los horarios publicados

```typescript
// Fetch categories from schedules
const { categories } = useSchedulesCategories(competicionId);
```

---

### 3. FRONTEND BACKOFFICE - Dashboard Financiero

#### 3.1 Dashboard de estadísticas financieras para FER
**Archivo:** `frontend/src/pages/backoffice/Dashboard.tsx`
**Agregar sección FER:**
- Total revenue (suma de TotalPagado de inscripciones pagadas)
- Ingresos pendientes (inscripciones no pagadas × precio)
- Breakdown por experiencia
- Breakdown por handler
- Comparativa GR Cup vs FER (si hay múltiples competiciones)

---

### 4. FRONTEND LANDING (ferweb) - Categorías Dinámicas

#### 4.1 Cargar categorías de peso desde horarios publicados
**Archivo:** `ferweb/src/pages/fer/components/InscripcionForm.tsx`
**Problema:** Categorías hardcodeadas en el componente
**Solución:** 
1. Crear endpoint `GET /api/competiciones/:slug/schedules/categories`
2. Modificar hook `useFerInscripcion` para recibir categorías
3. Reemplazar arrays hardcodeados `MEN_CATEGORIES` y `WOMEN_CATEGORIES`

---

### 5. QR READER - Mejoras de UX

#### 5.1 Agregar horarios al estado del QR
**Archivo:** `backend/GrCup.Api/Services/InscripcionService.cs`
**Método:** `GetEstadoAsync`
**Verificar:** Que se incluyan los horarios correctamente en la respuesta

#### 5.2 Mensaje de email diferenciado según estado
**Archivos:** 
- `backend/GrCup.Api/Services/EmailService.cs`
- `frontend/src/pages/backoffice/qr-reader/QrReaderPage.tsx`

**Casos:**
- A: Participación no confirmada → Email de confirmación
- B: Participación confirmada, no pagado → Email con recordatorio de pago + info zona registro
- C: Todo confirmado → Solo mostrar pantalla de éxito (no enviar email)

---

### 6. MIGRACIONES DE BASE DE DATOS

#### 6.1 Verificar que todas las tablas tengan los campos necesarios
**Tablas:**
- `inscripciones` - ✅ Todos los campos ya existen
- `competicion` - ✅ EventoConfig con precios dinámicos
- `evento_config` (si existe como tabla separada) - Verificar

#### 6.2 Crear tabla de configuración de horarios por competición (si no existe)
**Necesario para:** Categorías de peso dinámicas por competición

---

### 7. VALIDACIONES Y EDGE CASES

#### 7.1 Validar categoría de peso seleccionada contra categorías disponibles
**Backend:** En `CreateInscripcionRequest` validar que `CategoriaPeso` exista en las categorías de la competición

#### 7.2 Validar aforo máximo
**Backend:** Verificar que `GetPlazasDisponiblesAsync` reste correctamente las inscripciones activas

---

## ORDEN DE PRIORIDAD

### Fase 1: Backend Core (Crítico) - ✅ COMPLETADO
1. [x] Agregar "rookie" a estadísticas
2. [x] Mejorar email admin FER con todos los datos
3. [x] Crear endpoint de configuración con categorías dinámicas

### Fase 2: Backoffice Configuración (Alta Prioridad)
1. [ ] Sección de configuración de inscripciones con precios dinámicos
2. [ ] Selector de categoría de peso con categorías de horarios

### Fase 3: Dashboard Financiero (Media Prioridad)
1. [ ] Stats de revenue para FER

### Fase 4: Frontend Landing (Media Prioridad)
1. [ ] Categorías de peso dinámicas desde horarios

### Fase 5: QR Reader (Baja Prioridad - Ya funciona)
1. [ ] Mejoras de UX menores

---

## ARCHIVOS A MODIFICAR

### Backend (ASP.NET Core)
- `backend/GrCup.Api/Services/InscripcionService.cs` - Stats + email
- `backend/GrCup.Api/Services/EmailService.cs` - Email admin mejorado
- `backend/GrCup.Api/Services/CompeticionService.cs` - Endpoint config
- `backend/GrCup.Api/Endpoints/CompeticionEndpoints.cs` - Nuevo endpoint
- `backend/GrCup.Api/Models/Schedule.cs` - Verificar modelo

### Frontend Backoffice
- `frontend/src/pages/backoffice/InscripcionesPage.tsx` - Selector categoría
- `frontend/src/pages/backoffice/Dashboard.tsx` - Stats financieras
- `frontend/src/pages/backoffice/config/InscripcionConfig.tsx` - Config inscripción

### Frontend Landing (ferweb)
- `ferweb/src/pages/fer/components/InscripcionForm.tsx` - Categorías dinámicas
- `ferweb/src/pages/fer/hooks/useFerInscripcion.ts` - Recibir categorías
- `ferweb/src/api/client.ts` - Nuevo endpoint de config

---

## CONTRATOS DE DATOS

### Endpoint: GET /api/competiciones/:slug/config
**Response:**
```json
{
  "success": true,
  "data": {
    "precioBase": 35,
    "precioHandler": 25,
    "precioUpsell": 60,
    "aforoMaximo": 100,
    "plazasDisponibles": 75,
    "inscripcionAbierta": true,
    "categoriasMasculino": ["-53", "-59", "-66", "-74", "-83", "-93", "-105", "-120", "+120"],
    "categoriasFemenino": ["-43", "-47", "-52", "-57", "-63", "-69", "-76", "-84", "+84"]
  }
}
```

### Endpoint: GET /api/competiciones/:slug/schedules/categories
**Response:**
```json
{
  "success": true,
  "data": {
    "masculino": ["-53", "-59", "-66", "-74", "-83", "-93", "-105", "-120", "+120"],
    "femenino": ["-43", "-47", "-52", "-57", "-63", "-69", "-76", "-84", "+84"]
  }
}
```

---

## NOTAS

1. El QR Reader ya está completamente implementado con la lógica de estados A, B, C
2. El formulario FER ya tiene las descripciones de experiencia correctas
3. El toggle de handler ya muestra el mensaje con el precio dinámico
4. Los emails FER ya son distintos a GR Cup (colores oscuros vs claros)
