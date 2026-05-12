# GR Platform - Plan Maestro v2.0

**Versión:** 2.0 (Major Update - Multi-tenant + RBAC)  
**Fecha:** 2026-05-05  
**Estado:** Planificación  
**Stack:** Bun + React + TypeScript + Tailwind v3 + Jotai + React Motion + GSAP + Drizzle ORM  

---

## 🎯 Resumen Ejecutivo

Transformación completa de la plataforma para soportar **múltiples competiciones independientes** con un sistema de usuarios robusto y granular.

### Objetivos Principales

1. **🏆 Sistema Multi-tenant:**
   - Cada competición tiene su landing, configuración, inscripciones, estadísticas
   - Una misma persona puede gestionar varias competiciones
   - Extensible sin migraciones destructivas

2. **👥 Sistema de Usuarios y Permisos:**
   - Superadministradores pueden crear y gestionar usuarios
   - Sistema de roles con flags específicos
   - Control granular: acceso a competiciones y funcionalidades

3. **🌐 FER Landing Web:**
   - Landing "aura místico" para FER Entrenamiento
   - Inscripciones sin pago online (efectivo + QR)
   - Upsell opcional de preparación

**Presupuesto estimado:** 120h  
**Prioridad:** Crítica - Base de toda la plataforma

---

## 📋 Índice

1. [Arquitectura Multi-tenant](#-arquitectura-multi-tenant)
2. [Sistema de Usuarios y Permisos (RBAC)](#-sistema-de-usuarios-y-permisos-rbac)
3. [Modelo de Datos](#-modelo-de-datos)
4. [API Endpoints](#-api-endpoints)
5. [FER Landing Web](#-fer-landing-web)
6. [Backoffice Multi-tenant](#-backoffice-multi-tenant)
7. [Plan de Implementación](#-plan-de-implementación)
8. [Migraciones](#-migraciones)
9. [Tech Stack](#-tech-stack)
10. [Timeline](#-timeline)

---

## 🏗️ Arquitectura Multi-tenant

### Concepto

```
┌─────────────────────────────────────────────────────────────────┐
│                      PLATAFORMA GR                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   FER       │  │  GR CUP     │  │  NUEVA      │            │
│  │  Landing    │  │  Landing    │  │  Competición│            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                │                │                    │
│         └────────────────┼────────────────┘                    │
│                          ▼                                      │
│              ┌───────────────────────┐                        │
│              │     SHARED BACKEND     │                        │
│              │  ┌─────────────────┐   │                        │
│              │  │  Competiciones  │   │                        │
│              │  │  - Config       │   │                        │
│              │  │  - Inscripciones│   │                        │
│              │  │  - Rifas        │   │                        │
│              │  │  - Estadísticas │   │                        │
│              │  └─────────────────┘   │                        │
│              │                        │                        │
│              │  ┌─────────────────┐   │                        │
│              │  │  Users & Roles  │   │                        │
│              │  │  - SuperAdmins  │   │                        │
│              │  │  - Managers     │   │                        │
│              │  │  - Operators     │   │                        │
│              │  └─────────────────┘   │                        │
│              └───────────────────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Estructura de URLs

```
# Landing pública (sin auth)
https://dominio.com/fer              # FER Landing
https://dominio.com/grcup            # GR Cup Landing
https://dominio.com/[slug-competicion] # Nueva competición

# Backoffice (requiere auth)
https://dominio.com/backoffice                    # Selector de competición
https://dominio.com/backoffice/[slug-competicion] # Dashboard específico
https://dominio.com/backoffice/admin/users        # Gestión de usuarios (solo superadmin)
https://dominio.com/backoffice/admin/settings     # Config global (solo superadmin)
```

### Patrón de Datos

Cada entidad tiene `competicion_id` que la liga a una competición:

```
┌─────────────────────────────────────────────────────────────┐
│  TODAS las tablas de datos incluyen:                        │
│                                                             │
│  id (PK, auto)                                              │
│  competicion_id (FK → competiciones.id)  ← LLAVE DE TENER  │
│  created_at                                                 │
│  updated_at                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 👥 Sistema de Usuarios y Permisos (RBAC)

### Jerarquía de Roles

```
SUPERADMIN
├── Gestión completa de TODAS las competiciones
├── Crear/editar/borrar usuarios
├── Asignar roles y permisos
├── Acceder a configuración global
└── Sin limitaciones

ADMIN (por competición)
├── Gestión completa de SU competición
├── Ver/editar configuración
├── Gestionar inscripciones
├── Gestionar rifa
├── Ver estadísticas
├── Exportar datos
└── No puede crear usuarios

OPERATOR (por competición)
├── Operaciones del día del evento
├── Check-in de atletas
├── Venta de tickets rifa
├── Ver lista de inscritos
└── No puede cambiar configuración
```

### Sistema de Flags (Granular Permissions)

```typescript
// Flags de sistema (solo superadmin)
const SYSTEM_FLAGS = {
  MANAGE_USERS: 'system:manage_users',           // Crear/editar/borrar usuarios
  MANAGE_ROLES: 'system:manage_roles',           // Asignar roles
  SYSTEM_CONFIG: 'system:config',                // Configuración global
  VIEW_ALL_AUDIT: 'system:view_audit',           // Ver log de auditoría
};

// Flags de competición (por cada competicion_id)
const COMPETITION_FLAGS = {
  VIEW_DASHBOARD: 'comp:{id}:view_dashboard',    // Ver dashboard
  VIEW_INSCRIPTOS: 'comp:{id}:view_inscriptos',  // Ver lista inscritos
  MANAGE_INSCRIPTOS: 'comp:{id}:manage_inscriptos', // Editar/borrar inscritos
  VIEW_STATS: 'comp:{id}:view_stats',            // Ver estadísticas
  EXPORT_DATA: 'comp:{id}:export_data',          // Exportar CSV/Excel
  MANAGE_CONFIG: 'comp:{id}:manage_config',     // Editar configuración
  MANAGE_RAFFLE: 'comp:{id}:manage_raffle',     // Gestionar rifa
  DO_CHECKIN: 'comp:{id}:do_checkin',           // Hacer check-in
  SELL_TICKETS: 'comp:{id}:sell_tickets',        // Vender tickets rifa
};
```

### Modelo de Datos de Usuarios

```typescript
// Tabla: usuarios
{
  id: number;
  email: string;                    // Unique
  password_hash: string;
  nombre: string;
  is_superadmin: boolean;           // true = acceso total
  is_active: boolean;
  last_login_at: Date;
  created_at: Date;
  updated_at: Date;
}

// Tabla: usuarios_competiciones (muchos a muchos)
{
  id: number;
  usuario_id: number;               // FK → usuarios
  competicion_id: number;           // FK → competiciones
  role: 'admin' | 'operator';      // Rol base en esta competición
  created_at: Date;
}

// Tabla: usuarios_permissions (flags granulares)
{
  id: number;
  usuario_id: number;               // FK → usuarios
  permission_key: string;           // 'comp:5:export_data', 'system:manage_users'
  granted: boolean;                 // true = granted, false = denied (para overrides)
  competicion_id: number | null;    // null = permission global
  created_at: Date;
}
```

### Algoritmo de Permisos

```typescript
function hasPermission(user: User, permission: string, competicionId?: number): boolean {
  // Superadmin tiene todo
  if (user.is_superadmin) return true;
  
  // Si es permiso de sistema, no tiene acceso
  if (permission.startsWith('system:')) return false;
  
  // Si tiene competicion_id específico
  if (competicionId) {
    // 1. Buscar si tiene rol en esta competición
    const userComp = user.competiciones.find(c => c.competicion_id === competicionId);
    if (!userComp) return false;
    
    // 2. Rol base даёт permisos por defecto
    if (userComp.role === 'admin') {
      // Admin tiene todos los flags de competicion por defecto
      return true;
    }
    if (userComp.role === 'operator') {
      // Operator tiene permisos específicos
      const operatorPerms = ['do_checkin', 'sell_tickets', 'view_inscriptos'];
      return operatorPerms.includes(extractPermissionName(permission));
    }
    
    // 3. Check granular permissions
    const granular = user.permissions.find(
      p => p.permission_key === permission && 
           (p.competicion_id === competicionId || p.competicion_id === null)
    );
    
    if (granular) return granular.granted;
  }
  
  return false;
}
```

---

## 💾 Modelo de Datos

### Diagrama de Entidades

```
┌──────────────────┐       ┌──────────────────────────┐
│   COMPETICIONES  │       │      USUARIOS             │
├──────────────────┤       ├──────────────────────────┤
│ id (PK)          │       │ id (PK)                   │
│ nombre           │       │ email                     │
│ slug             │◄──────│ password_hash            │
│ fecha            │       │ nombre                    │
│ lugar            │       │ is_superadmin             │
│ activo           │       │ is_active                 │
│ logo_url         │       │ last_login_at             │
│ landing_config   │       └───────────┬──────────────┘
│ ...config        │                    │
└────────┬─────────┘                    │
         │                              │
         │ ┌────────────────────────────┼────────────────────────────┐
         │ │                            │                            │
         ▼ ▼                            ▼                            │
┌─────────────────┐          ┌─────────────────────┐    ┌────────────────────────┐
│ INSCRIPCIONES   │          │USUARIOS_COMPETICIONES│    │USUARIOS_PERMISSIONS    │
├─────────────────┤          ├─────────────────────┤    ├────────────────────────┤
│ id (PK)         │          │ id (PK)              │    │ id (PK)                 │
│ competicion_id* │          │ usuario_id*          │    │ usuario_id*             │
│ nombre          │          │ competicion_id*      │    │ permission_key          │
│ email           │          │ role                 │    │ granted                 │
│ instagram       │          └─────────────────────┘    │ competicion_id (nullable│
│ peso_aprox      │                                       └────────────────────────┘
│ experiencia     │                                        
│ tiene_entrenador│                                        
│ upsell_preparacion                                  ┌────────────────────────────┐
│ qr_code         │                                    │ INSCRIPCIONES_RIFA         │
│ pago_confirmado │                                    ├────────────────────────────┤
│ checkin_at      │                                    │ id (PK)                    │
└─────────────────┘                                    │ competicion_id*            │
                                                      │ inscripcion_id*            │
┌─────────────────┐                                    │ numero_ticket              │
│ RIFA_CONFIG     │                                    │ stripe_payment_id          │
├─────────────────┤                                    │ confirmado                 │
│ id (PK)         │                                    └────────────────────────────┘
│ competicion_id* │
│ nombre_premio   │
│ precio_ticket   │
│ activo          │
│ fecha_sorteo    │
└─────────────────┘

* = Foreign Key a competiciones.id
```

### Schema SQL (MySQL)

```sql
-- ============================================
-- NUEVAS TABLAS PARA MULTI-TENANT
-- ============================================

-- Tabla principal de competiciones
CREATE TABLE competiciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    fecha DATE NOT NULL,
    lugar VARCHAR(255) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    logo_url VARCHAR(500),
    favicon_url VARCHAR(500),
    landing_config JSON,                    -- Config de la landing (colores, imágenes, etc.)
    evento_config JSON,                     -- Config del evento (aforo, precios, etc.)
    qr_secret VARCHAR(255),                 -- Para firmar QR codes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_slug (slug),
    INDEX idx_activo (activo)
);

-- Tabla de usuarios (extendida del sistema actual)
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_superadmin (is_superadmin)
);

-- Relación usuarios-competiciones (muchos a muchos)
CREATE TABLE usuarios_competiciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    competicion_id INT NOT NULL,
    role ENUM('admin', 'operator') NOT NULL DEFAULT 'operator',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (competicion_id) REFERENCES competiciones(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_comp (usuario_id, competicion_id),
    INDEX idx_usuario (usuario_id),
    INDEX idx_competicion (competicion_id)
);

-- Permisos granulares por usuario
CREATE TABLE usuarios_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    competicion_id INT NULL,                -- NULL = permission global
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (competicion_id) REFERENCES competiciones(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_perm (usuario_id, permission_key, competicion_id),
    INDEX idx_usuario (usuario_id),
    INDEX idx_permission (permission_key)
);

-- ============================================
-- MIGRACIÓN: Añadir competicion_id a tablas existentes
-- ============================================

-- Añadir a inscripciones (existente)
ALTER TABLE inscripciones 
ADD COLUMN competicion_id INT NOT NULL DEFAULT 1,  -- Default 1 para GR Cup existente
ADD FOREIGN KEY (competicion_id) REFERENCES competiciones(id);

-- Añadir a rifa_tickets (existente)
ALTER TABLE rifa_tickets 
ADD COLUMN competicion_id INT NOT NULL DEFAULT 1,
ADD FOREIGN KEY (competicion_id) REFERENCES competiciones(id);

-- Crear tabla de config de rifa
CREATE TABLE rifa_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    competicion_id INT NOT NULL UNIQUE,
    nombre_premio VARCHAR(255),
    descripcion_premio TEXT,
    precio_ticket DECIMAL(10,2) DEFAULT 0,
    tickets_total INT DEFAULT 0,
    activo BOOLEAN DEFAULT FALSE,
    fecha_sorteo DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (competicion_id) REFERENCES competiciones(id) ON DELETE CASCADE
);

-- Añadir competicion_id a evento_config si existe
-- (Ya hay una tabla evento_config, migrarla con competicion_id)
-- Esto se hace con una nueva tabla que referencia por competicion_id
```

### Entidades Drizzle

```typescript
// entidades/competicion.ts
export const competiciones = mysqlTable('competiciones', {
  id: int('id').primaryKey().autoincrement(),
  nombre: varchar('nombre', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  fecha: date('fecha').notNull(),
  lugar: varchar('lugar', { length: 255 }).notNull(),
  activo: boolean('activo').notNull().default(true),
  logoUrl: varchar('logo_url', { length: 500 }),
  faviconUrl: varchar('favicon_url', { length: 500 }),
  landingConfig: json('landing_config'),
  eventoConfig: json('evento_config'),
  qrSecret: varchar('qr_secret', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// entidades/usuario.ts
export const usuarios = mysqlTable('usuarios', {
  id: int('id').primaryKey().autoincrement(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  nombre: varchar('nombre', { length: 255 }).notNull(),
  isSuperadmin: boolean('is_superadmin').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const usuariosCompeticiones = mysqlTable('usuarios_competiciones', {
  id: int('id').primaryKey().autoincrement(),
  usuarioId: int('usuario_id').notNull().references(() => usuarios.id),
  competicionId: int('competicion_id').notNull().references(() => competiciones.id),
  role: enum('role', ['admin', 'operator']).notNull().default('operator'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usuariosPermissions = mysqlTable('usuarios_permissions', {
  id: int('id').primaryKey().autoincrement(),
  usuarioId: int('usuario_id').notNull().references(() => usuarios.id),
  permissionKey: varchar('permission_key', { length: 100 }).notNull(),
  granted: boolean('granted').notNull().default(true),
  competicionId: int('competicion_id').references(() => competiciones.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// entidades/inscripcion.ts (extendida)
export const inscripciones = mysqlTable('inscripciones', {
  id: int('id').primaryKey().autoincrement(),
  competicionId: int('competicion_id').notNull().references(() => competiciones.id),
  nombre: varchar('nombre', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  instagram: varchar('instagram', { length: 255 }),
  pesoAprox: decimal('peso_aprox', { precision: 5, scale: 2 }).notNull(),
  experiencia: enum('experiencia', ['principiante', 'intermedio', 'avanzado']).notNull(),
  tieneEntrenador: boolean('tiene_entrenador').notNull().default(false),
  upsellPreparacion: boolean('upsell_preparacion').notNull().default(false),
  qrCode: text('qr_code'),
  pagoConfirmado: boolean('pago_confirmado').notNull().default(false),
  checkinAt: timestamp('checkin_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// entidades/rifa.ts (extendida con config)
export const rifaConfig = mysqlTable('rifa_config', {
  id: int('id').primaryKey().autoincrement(),
  competicionId: int('competicion_id').notNull().unique().references(() => competiciones.id),
  nombrePremio: varchar('nombre_premio', { length: 255 }),
  descripcionPremio: text('descripcion_premio'),
  precioTicket: decimal('precio_ticket', { precision: 10, scale: 2 }).default(0),
  ticketsTotal: int('tickets_total').default(0),
  activo: boolean('activo').default(false),
  fechaSorteo: date('fecha_sorteo'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const rifaTickets = mysqlTable('rifa_tickets', {
  id: int('id').primaryKey().autoincrement(),
  competicionId: int('competicion_id').notNull().references(() => competiciones.id),
  inscripcionId: int('inscripcion_id').references(() => inscripciones.id),
  numeroTicket: varchar('numero_ticket', { length: 20 }).notNull(),
  stripePaymentId: varchar('stripe_payment_id', { length: 255 }),
  confirmado: boolean('confirmado').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

## 🔌 API Endpoints

### Authentication

```typescript
// POST /api/auth/login
Request: { email: string, password: string }
Response: { 
  success: true, 
  token: string, 
  user: { 
    id: number, 
    email: string, 
    nombre: string, 
    isSuperadmin: boolean,
    competiciones: [{ id, nombre, slug, role }],
    permissions: string[]  // Lista de permisos granted
  }
}

// POST /api/auth/logout
// DELETE /api/auth/refresh
```

### Competiciones (Público)

```typescript
// GET /api/competiciones
// Lista todas las competiciones activas
Response: { success: true, data: Competicion[] }

// GET /api/competiciones/:slug
// Info pública de una competición (para landing)
Response: { 
  success: true, 
  data: {
    id: number,
    nombre: string,
    slug: string,
    fecha: string,
    lugar: string,
    landingConfig: LandingConfig,  // Colores, imágenes, etc.
    eventoConfig: EventoConfig,    // Aforo, precios, etc.
    plazasDisponibles: number,
    rifaActiva: boolean,
  }
}
```

### Inscripciones (Público)

```typescript
// POST /api/competiciones/:slug/inscripcion
// Crear inscripción pública
Request: {
  nombre: string,
  email: string,
  instagram?: string,
  pesoAprox: number,
  experiencia: 'principiante' | 'intermedio' | 'avanzado',
  tieneEntrenador: boolean,
  aceptaTerminos: boolean,
}
Response: {
  success: true,
  data: {
    id: number,
    qrCode: string,  // Base64
    mensaje: string,
  }
}

// POST /api/competiciones/:slug/inscripcion/:id/upsell
// Añadir upsell post-inscripción
Request: { quiereUpsell: boolean }
Response: { success: true, data: { mensaje: string } }

// GET /api/competiciones/:slug/inscripcion/:id/qr
// Obtener QR de inscripción
Response: { success: true, data: { qrCode: string } }
```

### Check-in (Día del evento)

```typescript
// GET /api/competiciones/:slug/checkin/:id
// Buscar inscripción por ID
Response: {
  success: true,
  data: {
    id: number,
    nombre: string,
    email: string,
    pagoConfirmado: boolean,
    upsellPreparacion: boolean,
  }
}

// GET /api/competiciones/:slug/checkin/buscar?q=nombre
// Buscar por nombre
Response: { success: true, data: Inscripcion[] }

// POST /api/competiciones/:slug/checkin/:id/confirmar
// Confirmar pago
Response: { success: true, data: { checkinAt: string } }

// POST /api/competiciones/:slug/checkin/:id/asistio
// Marcar que asistió al evento
Response: { success: true }
```

### Admin - Gestión de Competiciones

```typescript
// GET /api/admin/competiciones
// Lista todas las competiciones (superadmin)
Response: { success: true, data: Competicion[] }

// POST /api/admin/competiciones
// Crear nueva competición
Request: {
  nombre: string,
  slug: string,
  fecha: string,
  lugar: string,
  landingConfig: LandingConfig,
  eventoConfig: EventoConfig,
}
Response: { success: true, data: Competicion }

// PUT /api/admin/competiciones/:id
// Editar competición
Request: Partial<Competicion>
Response: { success: true, data: Competicion }

// DELETE /api/admin/competiciones/:id
// Desactivar competición (soft delete)
Response: { success: true }
```

### Admin - Dashboard (Protegido por permisos)

```typescript
// GET /api/admin/competiciones/:id/dashboard
// Dashboard con estadísticas (requiere 'view_dashboard')
Response: {
  success: true,
  data: {
    totalInscritos: number,
    pagoConfirmado: number,
    upsellsVendidos: number,
    plazasDisponibles: number,
    recentInscriptions: Inscripcion[],
    statsPorExperiencia: { principiante: number, ... },
    statsGenero: { masculino: number, femenino: number },
  }
}

// GET /api/admin/competiciones/:id/inscripciones
// Lista paginada (requiere 'view_inscriptos')
Query: { page: number, limit: number, search?: string, filtro?: string }
Response: {
  success: true,
  data: {
    items: Inscripcion[],
    total: number,
    page: number,
    pages: number,
  }
}

// GET /api/admin/competiciones/:id/inscripciones/export
// Exportar CSV (requiere 'export_data')
Response: CSV file

// PUT /api/admin/competiciones/:id/inscripciones/:inscripcionId
// Editar inscripción (requiere 'manage_inscriptos')
Request: Partial<Inscripcion>
Response: { success: true, data: Inscripcion }

// DELETE /api/admin/competiciones/:id/inscripciones/:inscripcionId
// Eliminar inscripción (requiere 'manage_inscriptos')
Response: { success: true }
```

### Admin - Configuración

```typescript
// GET /api/admin/competiciones/:id/config
// Obtener config completa
Response: { success: true, data: EventoConfig }

// PUT /api/admin/competiciones/:id/config
// Actualizar config (requiere 'manage_config')
Request: Partial<EventoConfig>
// Ejemplo: { precioBase: 35, precioUpsell: 60, precioRifa: 5, aforoMax: 80 }
Response: { success: true, data: EventoConfig }
```

### Admin - Rifas

```typescript
// GET /api/admin/competiciones/:id/rifa
// Info de la rifa
Response: { success: true, data: RifaConfig }

// PUT /api/admin/competiciones/:id/rifa
// Actualizar config rifa (requiere 'manage_raffle')
Request: {
  nombrePremio?: string,
  descripcionPremio?: string,
  precioTicket?: number,
  ticketsTotal?: number,
  activo?: boolean,
  fechaSorteo?: string,
}

// POST /api/admin/competiciones/:id/rifa/sorteo
// Realizar sorteo (requiere 'manage_raffle')
Response: { success: true, data: { numeroGanador: string, ganador: Inscripcion } }

// GET /api/admin/competiciones/:id/rifa/tickets
// Lista de tickets vendidos
Response: { success: true, data: RifaTicket[] }

// POST /api/admin/competiciones/:id/rifa/tickets
// Vender ticket (requiere 'sell_tickets')
Request: { inscripcionId?: number, numeroTicket?: string }
Response: { success: true, data: RifaTicket }
```

### Admin - Usuarios (Solo Superadmin)

```typescript
// GET /api/admin/users
// Lista todos los usuarios
Response: { success: true, data: User[] }

// POST /api/admin/users
// Crear usuario
Request: {
  email: string,
  password: string,
  nombre: string,
  isSuperadmin: boolean,
}
Response: { success: true, data: User }

// PUT /api/admin/users/:id
// Editar usuario
Request: { isActive?: boolean, nombre?: string }
Response: { success: true, data: User }

// POST /api/admin/users/:id/competiciones
// Asignar usuario a competición
Request: { competicionId: number, role: 'admin' | 'operator' }
Response: { success: true }

// PUT /api/admin/users/:id/permissions
// Actualizar permisos granulares
Request: { permissions: { key: string, granted: boolean, competicionId?: number }[] }
Response: { success: true }
```

---

## 🌐 FER Landing Web

### Especificaciones del Diseño

#### Paleta de Colores "Aura Místico"
```css
:root {
  --fer-bg-dark: #0A1628;           /* Azul profundo */
  --fer-bg-card: #1E3A5F;            /* Azul medio */
  --fer-accent: #3B82F6;             /* Azul eléctrico */
  --fer-glow: #60A5FA;              /* Azul claro */
  --fer-text: #F8FAFC;               /* Texto principal */
  --fer-text-muted: #94A3B8;        /* Texto secundario */
  --fer-gold: #FBBF24;              /* Detalles premium */
}
```

#### Estructura de Secciones

```
┌─────────────────────────────────────────────────────────┐
│  1. HERO                                                │
│  - Logo FER + Instagram link                            │
│  - Título: "FER ENTRENAMIENTO PRESENTA"                │
│  - Subtítulo: "🏋️ POWERLIFTING DAY"                   │
│  - Fecha: "25 JULIO • ALMUSSAFES"                      │
│  - Frase: "Tu primera competición de Powerlifting"     │
│  - CTA: [INSCRIBIRME] (scroll a formulario)            │
│  - Animación: partículas flotantes, glow effects        │
├─────────────────────────────────────────────────────────┤
│  2. QUÉ ES EL EVENTO                                   │
│  - Imagen/video del club                                │
│  - Texto explicativo                                    │
│  - Puntos clave (jueces, 3 intentos, ambiente real)    │
├─────────────────────────────────────────────────────────┤
│  3. QUÉ INCLUYE                                        │
│  - Grid 4 cards: Jueces, Material, Spotters, Trofeos │
│  - Lista: Camiseta, Merchandising, Zona热身            │
├─────────────────────────────────────────────────────────┤
│  4. QUIÉN PUEDE PARTICIPAR                            │
│  - Club FER, Externos, Principiantes, Sin entrenador  │
│  - Mensaje: "No importa tu nivel. Importan tus ganas." │
├─────────────────────────────────────────────────────────┤
│  5. INSCRIPCIÓN (FORMULARIO)                           │
│  - Campos: Nombre, Email, Instagram (opc), Peso, Exp.   │
│  - "¿Tienes entrenador?" toggle                         │
│  - Indicador plazas disponibles                         │
│  - Botón: "CONFIRMAR INSCRIPCIÓN"                       │
│  - Validación inline                                    │
├─────────────────────────────────────────────────────────┤
│  6. CONFIRMACIÓN                                       │
│  - QR Code grande                                      │
│  - "Muéstralo el día del evento"                       │
│  - Botones: [Descargar QR] [Compartir]                 │
│  - Animación confetti                                  │
├─────────────────────────────────────────────────────────┤
│  7. UPSELL (Post-confirmación)                        │
│  - "¿No tienes entrenador?"                             │
│  - Checkbox: "Quiero ayuda (+50€)"                      │
│  - Nota: "No obligatorio"                               │
├─────────────────────────────────────────────────────────┤
│  8. FOOTER                                             │
│  - Logo, Instagram, Ubicación, Fecha                    │
└─────────────────────────────────────────────────────────┘
```

### Formulario de Inscripción

```typescript
interface FERInscripcionForm {
  nombre: string;           // Required, min 2 chars
  email: string;           // Required, valid email
  instagram?: string;      // Optional, format @username
  pesoAprox: number;       // Required, 40-150kg
  experiencia: 'principiante' | 'intermedio' | 'avanzado';
  tieneEntrenador: boolean;
  aceptaTerminos: boolean; // Required
}

// Zod Schema
const ferInscripcionSchema = z.object({
  nombre: z.string().min(2, 'Nombre demasiado corto').max(100),
  email: z.string().email('Email inválido'),
  instagram: z.string().regex(/^@?[\w]{1,30}$/).optional().or(z.literal('')),
  pesoAprox: z.number().min(40).max(150),
  experiencia: z.enum(['principiante', 'intermedio', 'avanzado']),
  tieneEntrenador: z.boolean(),
  aceptaTerminos: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar los términos' }) }),
});
```

---

## 🖥️ Backoffice Multi-tenant

### Estructura de Navegación

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER                                                     │
│  [Logo] [Selector Competición ▼] [Usuario ▼] [Logout]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BACKOFFICE / GR CUP                                 │   │
│  │  ─────────────────────────────────────────────       │   │
│  │  [Dashboard] [Inscripciones] [Rifa] [Config] [QR]   │   │
│  │  ─────────────────────────────────────────────       │   │
│  │                                                      │   │
│  │  CONTENT AREA                                       │   │
│  │  ...                                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Páginas del Backoffice

#### 1. Selector de Competición (Home)
- Grid de tarjetas con competiciones asignadas
- Cada tarjeta: nombre, fecha, badge de rol
- Botón "Administrar" → va a dashboard

#### 2. Dashboard
- KPIs: Inscritos, Pagados, Upsells, Revenue
- Gráfico de inscripciones por día
- Tabla recent activity
- Accesos rápidos: Nueva inscripción, Exportar

#### 3. Inscripciones
- Tabla con búsqueda y filtros
- Columnas: ID, Nombre, Email, Peso, Experiencia, Pago, Upsell, Fecha
- Acciones: Ver, Editar, Eliminar, Confirmar pago
- Paginación
- Exportar CSV/Excel

#### 4. Rifa
- Config: Premio, Precio, Tickets, Fecha
- Tabla de tickets vendidos
- Botón "Realizar Sorteo" (con animación)
- Historial de ganadores

#### 5. Configuración
- Aforo máximo (input numérico)
- Precio base, Precio upsell
- Colores de landing (color picker)
- Imágenes: Logo, Favicon, Hero image
- Estados de inscripción (abierto/cerrado)

#### 6. Check-in (Día del evento)
- Buscador por nombre o ID
- Lector QR (usando cámara)
- Al escanear: muestra datos + botón confirmar
- Contador de check-ins del día

#### 7. Gestión de Usuarios (Solo Superadmin)
- Tabla de usuarios
- Crear usuario: email, nombre, password
- Asignar a competiciones
- Establecer role y permisos granulares

### Frontend - Arquitectura

```
ferweb/frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   │
│   ├── components/
│   │   ├── ui/                    # Button, Input, Card, etc.
│   │   ├── layout/               # Header, Sidebar, Footer
│   │   ├── forms/                # Form components
│   │   ├── tables/               # Data tables con filtros
│   │   ├── charts/               # Gráficos
│   │   ├── modals/               # Dialogs
│   │   └── animations/           # ScrollReveal, Parallax
│   │
│   ├── pages/
│   │   ├── landing/              # Landing pública
│   │   │   ├── LandingFER.tsx
│   │   │   ├── Hero.tsx
│   │   │   ├── InscripcionForm.tsx
│   │   │   ├── Confirmacion.tsx
│   │   │   └── ...
│   │   │
│   │   └── backoffice/           # Panel admin
│   │       ├── Dashboard.tsx
│   │       ├── Inscripciones.tsx
│   │       ├── Rifa.tsx
│   │       ├── Configuracion.tsx
│   │       ├── CheckIn.tsx
│   │       └── admin/
│   │           └── Users.tsx
│   │
│   ├── hooks/
│   │   ├── useAuth.ts            # Auth state
│   │   ├── usePermissions.ts     # Permission checks
│   │   ├── useCompeticion.ts     # Current competicion
│   │   └── ...
│   │
│   ├── atoms/                    # Jotai
│   │   ├── auth.atoms.ts
│   │   ├── competicion.atoms.ts
│   │   └── ui.atoms.ts
│   │
│   ├── api/
│   │   ├── client.ts
│   │   ├── auth.api.ts
│   │   ├── competiciones.api.ts
│   │   ├── inscripciones.api.ts
│   │   └── users.api.ts
│   │
│   ├── lib/
│   │   ├── permissions.ts        # Permission helpers
│   │   ├── constants.ts
│   │   └── utils.ts
│   │
│   └── types/
│       ├── api.ts
│       ├── models.ts
│       └── permissions.ts
```

---

## 📅 Plan de Implementación

### Fase 0: Infraestructura Multi-tenant (20h) ✅ COMPLETADA

#### 0.1 Database Migration (8h) ✅
- [x] Crear tabla `competiciones`
- [x] Crear tabla `usuarios`
- [x] Crear tabla `usuarios_competiciones`
- [x] Crear tabla `usuarios_permissions`
- [x] Crear tabla `rifa_config`
- [x] Añadir `competicion_id` a `inscripciones`
- [x] Añadir `competicion_id` a `rifa_tickets`
- [x] Seed data: GR Cup + FER como competiciones iniciales
- [x] Seed superadmin: admin@grplatform.com / changeme123

#### 0.2 Auth System (6h) ✅
- [x] Extender JWT con `competiciones` y `permissions`
- [x] Middleware de autenticación
- [x] Endpoint login/logout
- [x] Token desde cookie `gr_cup_token`

#### 0.3 Permission System (6h) ✅
- [x] Service de permisos (`PermissionService`)
- [x] Helper functions para verificar permisos
- [x] Métodos de extensión para ClaimsPrincipal
- [x] Integración en endpoints admin

### Fase 1: Backend APIs (20h) ✅ COMPLETADA

#### 1.1 Competiciones API (4h) ✅
- [x] CRUD completo competiciones
- [x] Slug generation
- [x] Validación de uniqueness

#### 1.2 Inscripciones API (6h) ✅
- [x] Refactorizar para soportar `competicion_id`
- [x] Endpoints públicos con slug
- [x] Endpoints admin por competicion
- [x] Control de aforo

#### 1.3 Rifas API (4h) ✅
- [x] CRUD rifa_config
- [x] Venta de tickets
- [x] Algoritmo de sorteo
- [x] Historial

#### 1.4 Users Admin API (6h) ✅
- [x] CRUD usuarios
- [x] Asignación a competiciones
- [x] Gestión de permisos granulares
- [x] Superadmin only middleware

### Fase 2: Frontend Base (16h) ✅ COMPLETADA

#### 2.1 Setup & UI Components (8h) ✅
- [x] Bun + Vite + React setup (ya existente)
- [x] Tailwind config con theme (ya existente)
- [x] Button, Input, Select, Checkbox (ya existente)
- [x] Card, Badge, Modal (ya existente)
- [x] DataTable con filtros (ya existente)
- [x] Toast notifications (react-hot-toast añadido)

#### 2.2 Auth Flow (4h) ✅
- [x] Login page (`/components/auth/LoginPage.tsx`)
- [x] Auth context + atoms (`/stores/auth.atoms.ts`, `/hooks/useAuth.ts`)
- [x] Protected routes (`/components/auth/ProtectedRoute.tsx`)
- [x] Permission guards (`/hooks/usePermissions.ts`)

#### 2.3 Layout Components (4h) ✅
- [x] Header con selector de competición (`/components/layout/AdminHeader.tsx`)
- [x] Sidebar de navegación (`/components/layout/AdminSidebar.tsx`)
- [x] Responsive layout (`/components/layout/AdminLayout.tsx`)

### Fase 3: Backoffice (20h) ✅ COMPLETADA

#### 3.1 Dashboard (4h) ✅
- [x] KPIs cards (Total, Pagados, Upsells, Revenue)
- [x] Gráfico de inscripciones por experiencia
- [x] Recent activity
- [x] Quick actions

#### 3.2 Inscripciones (6h) ✅
- [x] Tabla con búsqueda
- [x] Filtros por estado (pago, experiencia)
- [x] Editar inline (modal)
- [x] Exportar CSV
- [x] Confirmar pago rápido

#### 3.3 Rifa (4h) ✅
- [x] Config form (premio, precio, tickets)
- [x] Lista tickets vendidos
- [x] Realizar sorteo (random)
- [x] Mostrar ganador

#### 3.4 Configuración (3h) ✅
- [x] Form de configuración general (nombre, fecha, lugar)
- [x] Form de configuración evento (precios, aforo)
- [x] Toggle inscripción abierta/cerrada

#### 3.5 Check-in (3h) ✅
- [x] Buscador por nombre/email
- [x] QR scanner (placeholder con cámara)
- [x] Confirmación rápida (pago + check-in)

### Fase 4: FER Landing (16h) ✅ COMPLETADA

#### 4.1 Hero Section (4h) ✅
- [x] Diseño con gradientes
- [x] Animaciones partículas flotantes
- [x] CTA scroll

#### 4.2 Content Sections (4h) ✅
- [x] Qué es
- [x] Qué incluye
- [x] Quién puede

#### 4.3 Formulario (5h) ✅
- [x] Form con validaciones
- [x] Estados de loading
- [x] Integración API
- [x] Toggle entrenador

#### 4.4 Confirmación + Upsell (3h) ✅
- [x] QR display
- [x] Descargar/compartir
- [x] Confetti animation
- [x] Upsell section

### Fase 5: Testing & Polish (8h) ✅ COMPLETADA

- [x] Unit tests (Vitest) - 113 tests passing
- [x] Integration tests - API client tests
- [x] E2E con Playwright - Config + tests for FER landing y backoffice
- [x] Form validation tests
- [x] Permission system tests
- [x] Build verificado correctamente

### Fase 6: Deploy & Docs (4h) ✅ COMPLETADA

- [x] CI/CD pipeline (Docker compose)
- [x] Environment configs (nginx + tunnels)
- [x] Cloudflare tunnels configured
- [x] DNS records configured
- [x] Backend restarted and running
- [x] Frontend dist ready
- [x] URLs configured

---

## 🔄 Migraciones

### Migración 001: Schema Multi-tenant

```sql
-- 1. Crear tabla competiciones
CREATE TABLE competiciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    fecha DATE NOT NULL,
    lugar VARCHAR(255) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    logo_url VARCHAR(500),
    favicon_url VARCHAR(500),
    landing_config JSON,
    evento_config JSON,
    qr_secret VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Insertar GR Cup como primera competición
INSERT INTO competiciones (nombre, slug, fecha, lugar, activo, qr_secret)
VALUES ('GR Cup', 'grcup', '2026-07-25', 'Almussafes', TRUE, 'grcup-secret-2026');

-- 3. Crear tabla usuarios
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. Crear tabla relación usuarios-competiciones
CREATE TABLE usuarios_competiciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    competicion_id INT NOT NULL,
    role ENUM('admin', 'operator') NOT NULL DEFAULT 'operator',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (competicion_id) REFERENCES competiciones(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_comp (usuario_id, competicion_id)
);

-- 5. Crear tabla permisos
CREATE TABLE usuarios_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    competicion_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (competicion_id) REFERENCES competiciones(id) ON DELETE CASCADE
);

-- 6. Crear tabla rifa_config
CREATE TABLE rifa_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    competicion_id INT NOT NULL UNIQUE,
    nombre_premio VARCHAR(255),
    descripcion_premio TEXT,
    precio_ticket DECIMAL(10,2) DEFAULT 0,
    tickets_total INT DEFAULT 0,
    activo BOOLEAN DEFAULT FALSE,
    fecha_sorteo DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (competicion_id) REFERENCES competiciones(id) ON DELETE CASCADE
);

-- 7. Añadir competicion_id a inscripciones
ALTER TABLE inscripciones 
ADD COLUMN competicion_id INT NOT NULL DEFAULT 1;

ALTER TABLE inscripciones
ADD CONSTRAINT fk_inscripciones_competicion
FOREIGN KEY (competicion_id) REFERENCES competiciones(id);

-- 8. Añadir competicion_id a rifa_tickets
ALTER TABLE rifa_tickets
ADD COLUMN competicion_id INT NOT NULL DEFAULT 1;

ALTER TABLE rifa_tickets
ADD CONSTRAINT fk_rifa_competicion
FOREIGN KEY (competicion_id) REFERENCES competiciones(id);

-- 9. Crear superadmin inicial
INSERT INTO usuarios (email, password_hash, nombre, is_superadmin)
VALUES ('admin@grplatform.com', '$2a$12$...', 'Super Admin', TRUE);

-- 10. Asignar admin actual a GR Cup
INSERT INTO usuarios_competiciones (usuario_id, competicion_id, role)
SELECT u.id, c.id, 'admin'
FROM usuarios u, competiciones c
WHERE u.is_superadmin = TRUE AND c.slug = 'grcup';

-- 11. Migrar inscripciones existentes a competicion_id = 1 (GR Cup)
UPDATE inscripciones SET competicion_id = 1 WHERE competicion_id IS NULL;
```

### Rollback Script

```sql
-- Solo para desarrollo, NO ejecutar en producción
ALTER TABLE inscripciones DROP FOREIGN KEY fk_inscripciones_competicion;
ALTER TABLE inscripciones DROP COLUMN competicion_id;

ALTER TABLE rifa_tickets DROP FOREIGN KEY fk_rifa_competicion;
ALTER TABLE rifa_tickets DROP COLUMN competicion_id;

DROP TABLE IF EXISTS rifa_config;
DROP TABLE IF EXISTS usuarios_permissions;
DROP TABLE IF EXISTS usuarios_competiciones;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS competiciones;
```

---

## 🛠️ Tech Stack

### Backend

| Tecnología | Uso |
|-------------|-----|
| ASP.NET Core 8 | API framework |
| MySQL + EF Core | Database |
| Drizzle ORM | Type-safe queries (opcional) |
| JWT + Refresh Tokens | Authentication |
| SignalR | Real-time updates (futuro) |
| SendGrid | Email service |

### Frontend

| Tecnología | Uso |
|------------|-----|
| Bun | Package manager + runtime |
| Vite | Build tool |
| React 18 | UI framework |
| TypeScript | Type safety |
| Tailwind CSS v3.4 | Styling |
| Jotai | State management |
| React Motion | Animations |
| Framer Motion | Complex animations |
| GSAP | Scroll animations |
| Radix UI | Accessible primitives |
| Lucide React | Icons |
| React Router | Routing |
| React Hot Toast | Notifications |
| Zod | Validation |
| React Query | Server state |

### DevOps

| Tecnología | Uso |
|-----------|-----|
| Docker | Containerization |
| Nginx | Reverse proxy |
| GitHub Actions | CI/CD |
| Cloudflare | CDN + SSL |
| Sentry | Error tracking |

---

## 📊 Permisos Detallados

### Tabla de Permisos

```typescript
const ALL_PERMISSIONS = {
  // System (superadmin only)
  'system:manage_users': 'Crear, editar y eliminar usuarios',
  'system:manage_roles': 'Asignar roles y permisos',
  'system:view_audit': 'Ver log de auditoría',
  'system:config': 'Configuración global de plataforma',
  
  // Competition (per competicion_id)
  'comp:VIEW_DASHBOARD': 'Ver dashboard de estadísticas',
  'comp:VIEW_INSCRIPTOS': 'Ver lista de inscritos',
  'comp:MANAGE_INSCRIPTOS': 'Crear, editar y eliminar inscritos',
  'comp:EXPORT_DATA': 'Exportar datos (CSV, Excel)',
  'comp:MANAGE_CONFIG': 'Editar configuración de la competición',
  'comp:VIEW_RAFFLE': 'Ver información de la rifa',
  'comp:MANAGE_RAFFLE': 'Gestionar rifa (config, sorteo)',
  'comp:SELL_TICKETS': 'Vender tickets de rifa',
  'comp:DO_CHECKIN': 'Realizar check-in de atletas',
} as const;

type Permission = keyof typeof ALL_PERMISSIONS;
```

### Helper Functions

```typescript
// Frontend: usePermissions hook
function usePermissions() {
  const { user } = useAuth();
  
  return {
    isSuperadmin: user?.isSuperadmin ?? false,
    
    can: (permission: Permission, competicionId?: number) => {
      if (user?.isSuperadmin) return true;
      
      const userComp = user?.competiciones.find(
        c => c.competicionId === competicionId
      );
      
      if (!userComp) return false;
      
      if (userComp.role === 'admin') return true;
      
      if (userComp.role === 'operator') {
        const operatorPerms = ['VIEW_INSCRIPTOS', 'DO_CHECKIN', 'SELL_TICKETS'];
        return operatorPerms.includes(permission.replace('comp:', ''));
      }
      
      return user?.permissions.includes(
        competicionId 
          ? `comp:${competicionId}:${permission}`
          : permission
      ) ?? false;
    },
    
    canAny: (permissions: Permission[], competicionId?: number) => {
      return permissions.some(p => can(p, competicionId));
    },
  };
}

// Usage
function InscripcionesPage() {
  const { can } = usePermissions();
  const { currentCompeticion } = useCurrentCompeticion();
  
  if (!can('VIEW_INSCRIPTOS', currentCompeticion?.id)) {
    return <AccessDenied />;
  }
  
  return <InscripcionesTable />;
}
```

---

## ⏱️ Timeline Actualizado

| Fase | Descripción | Horas | Días |
|------|-------------|-------|------|
| 0.1 | DB Migration | 8h | 1 |
| 0.2 | Auth System | 6h | 0.75 |
| 0.3 | Permission System | 6h | 0.75 |
| **1.1** | **Competiciones API** | **4h** | **0.5** |
| **1.2** | **Inscripciones API** | **6h** | **0.75** |
| **1.3** | **Rifas API** | **4h** | **0.5** |
| **1.4** | **Users Admin API** | **6h** | **0.75** |
| **2.1** | **Setup & UI Components** | **8h** | **1** |
| **2.2** | **Auth Flow** | **4h** | **0.5** |
| **2.3** | **Layout** | **4h** | **0.5** |
| **3.1** | **Dashboard** | **4h** | **0.5** |
| **3.2** | **Inscripciones** | **6h** | **0.75** |
| **3.3** | **Rifa** | **4h** | **0.5** |
| **3.4** | **Configuración** | **3h** | **0.4** |
| **3.5** | **Check-in** | **3h** | **0.4** |
| **4.1** | **Hero Section** | **4h** | **0.5** |
| **4.2** | **Content Sections** | **4h** | **0.5** |
| **4.3** | **Formulario** | **5h** | **0.6** |
| **4.4** | **Confirmación + Upsell** | **3h** | **0.4** |
| 5 | Testing & Polish | 8h | 1 |
| 6 | Deploy & Docs | 4h | 0.5 |
| **TOTAL** | | **108h** | **~14 días** |

---

## 📝 Notas Importantes

### Decisiones de Diseño

1. **No migraciones destructivas:** Todas las tablas existentes reciben `competicion_id` con valor default = 1 (GR Cup). Así no hay breaking changes.

2. **Slugs en URLs:** Las competiciones se acceden por `/[slug]` no por `/[id]`. Más SEO-friendly y legible.

3. **Permissions como string keys:** En lugar de bits masks, usamos strings para permissions. Más flexible y debuggable.

4. **JWT con permisos:** El token JWT incluye la lista de `permissions` y `competiciones`. Así el frontend sabe qué mostrar sin consultar backend en cada navigation.

5. **Soft delete para competiciones:** No se borran, se marcan `activo = false`. Preserva integridad de datos.

### Consideraciones de Seguridad

1. **Rate limiting** en endpoints públicos (inscripción)
2. **CSRF protection** en forms
3. **Input sanitization** para todos los campos
4. **Password hashing** con bcrypt (cost 12)
5. **Audit log** para acciones sensibles
6. **HTTPS only** en producción

### Próximos Pasos

1. [ ] Aprobación del plan
2. [ ] Setup entorno de desarrollo
3. [ ] Ejecutar migración 001
4. [ ] Empezar Fase 0.2 (Auth)
5. [ ] Paralelizar: Backend + Frontend base

---

## 📞 Contacto & Recursos

- **Instagram FER:** https://www.instagram.com/ferentrenamiento
- **Instagram GR:** https://www.instagram.com/grcup

---

*Documento creado: 2026-05-05*  
*Última actualización: 2026-05-05*  
*Versión: 2.0 (Multi-tenant + RBAC)*
