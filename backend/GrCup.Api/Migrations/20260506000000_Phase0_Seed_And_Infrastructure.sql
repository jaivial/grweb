-- ============================================
-- Phase 0: Infrastructure Multi-tenant
-- Seed Data Migration
-- ============================================

-- This migration seeds the initial data for the multi-tenant system
-- It should be run after the Phase 1 migration (20260505220951_MultiTenant_Schema_Phase1)

-- Environment variables needed:
-- ADMIN_EMAIL (default: admin@grplatform.com)
-- ADMIN_PASSWORD (default: changeme123)
-- ADMIN_NOMBRE (default: Super Admin)

START TRANSACTION;

-- ============================================
-- 1. Seed GR Cup competition
-- ============================================
INSERT INTO competiciones (nombre, slug, fecha, lugar, activo, tipo, qr_secret, evento_config, landing_config, created_at, updated_at)
SELECT 'GR Cup 2026', 'grcup', '2026-07-25', 'Almussafes, Valencia', TRUE, 'grcup', 
       UUID(),  -- Generate a unique QR secret
       '{"aforoMaximo": 100, "precioBase": 35, "precioUpsell": 60, "precioRifa": 5, "maxTicketsPorPersona": 10, "inscripcionAbierta": true}',
       '{"primaryColor": "#DC2626", "secondaryColor": "#991B1B", "descripcion": "La competición de powerlifting más esperada del año"}',
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM competiciones WHERE slug = 'grcup');

-- ============================================
-- 2. Seed FER competition
-- ============================================
INSERT INTO competiciones (nombre, slug, fecha, lugar, activo, tipo, qr_secret, evento_config, landing_config, created_at, updated_at)
SELECT 'FER Powerlifting Day', 'fer', '2026-07-25', 'Almussafes, Valencia', TRUE, 'fer',
       UUID(),
       '{"aforoMaximo": 80, "precioBase": 35, "precioUpsell": 50, "precioRifa": 5, "maxTicketsPorPersona": 5, "inscripcionAbierta": true}',
       '{"primaryColor": "#3B82F6", "secondaryColor": "#60A5FA", "descripcion": "Tu primera competición de Powerlifting", "instagramUrl": "https://instagram.com/ferentrenamiento"}',
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM competiciones WHERE slug = 'fer');

-- ============================================
-- 3. Seed Super Admin User
-- ============================================
-- Default credentials: admin@grplatform.com / changeme123
-- In production, use environment variables to set secure credentials
INSERT INTO usuarios (email, password_hash, nombre, is_superadmin, is_active, created_at, updated_at)
SELECT 'admin@grplatform.com', 
       '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4gRr.yOyJ7O.jRFe',  -- BCrypt hash of 'changeme123'
       'Super Admin', TRUE, TRUE, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'admin@grplatform.com');

-- ============================================
-- 4. Assign Super Admin to GR Cup (as admin)
-- ============================================
INSERT INTO usuarios_competiciones (usuario_id, competicion_id, role, created_at)
SELECT u.id, c.id, 'admin', NOW()
FROM usuarios u, competiciones c
WHERE u.email = 'admin@grplatform.com' 
  AND c.slug = 'grcup'
  AND NOT EXISTS (
      SELECT 1 FROM usuarios_competiciones uc 
      WHERE uc.usuario_id = u.id AND uc.competicion_id = c.id
  );

-- ============================================
-- 5. Assign Super Admin to FER (as admin)
-- ============================================
INSERT INTO usuarios_competiciones (usuario_id, competicion_id, role, created_at)
SELECT u.id, c.id, 'admin', NOW()
FROM usuarios u, competiciones c
WHERE u.email = 'admin@grplatform.com' 
  AND c.slug = 'fer'
  AND NOT EXISTS (
      SELECT 1 FROM usuarios_competiciones uc 
      WHERE uc.usuario_id = u.id AND uc.competicion_id = c.id
  );

-- ============================================
-- 6. Seed RifaConfig for GR Cup
-- ============================================
INSERT INTO rifa_configs (competicion_id, nombre_premio, descripcion_premio, precio_ticket, tickets_total, activo, numero_ganador, ganador_confirmado, created_at, updated_at)
SELECT c.id, 'Camiseta oficial GR Cup', 'Camiseta oficial de la competición', 5.00, 100, FALSE, NULL, FALSE, NOW(), NOW()
FROM competiciones c
WHERE c.slug = 'grcup'
  AND NOT EXISTS (SELECT 1 FROM rifa_configs WHERE competicion_id = c.id);

-- ============================================
-- 7. Seed RifaConfig for FER
-- ============================================
INSERT INTO rifa_configs (competicion_id, nombre_premio, descripcion_premio, precio_ticket, tickets_total, activo, numero_ganador, ganador_confirmado, created_at, updated_at)
SELECT c.id, 'Premio sorpresa', 'Premio para el ganador de la rifa', 5.00, 100, FALSE, NULL, FALSE, NOW(), NOW()
FROM competiciones c
WHERE c.slug = 'fer'
  AND NOT EXISTS (SELECT 1 FROM rifa_configs WHERE competicion_id = c.id);

-- ============================================
-- 8. Create indexes for better query performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_usuarios_competiciones_usuario ON usuarios_competiciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_competiciones_competicion ON usuarios_competiciones(competicion_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_permissions_usuario ON usuarios_permissions(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_permissions_key ON usuarios_permissions(permission_key);
CREATE INDEX IF NOT EXISTS idx_inscripciones_competicion ON inscripciones(competicion_id);
CREATE INDEX IF NOT EXISTS idx_inscripciones_email ON inscripciones(email);
CREATE INDEX IF NOT EXISTS idx_inscripciones_pago ON inscripciones(pago_confirmado);
CREATE INDEX IF NOT EXISTS idx_rifa_tickets_competicion ON rifa_tickets(competicion_id);
CREATE INDEX IF NOT EXISTS idx_rifa_tickets_numero ON rifa_tickets(numero_ticket);

COMMIT;

-- ============================================
-- Verification queries (run these to check)
-- ============================================
-- SELECT 'Competiciones:' as info, COUNT(*) as count FROM competiciones;
-- SELECT 'Usuarios:' as info, COUNT(*) as count FROM usuarios;
-- SELECT 'Usuarios-Competiciones:' as info, COUNT(*) as count FROM usuarios_competiciones;
-- SELECT 'RifaConfigs:' as info, COUNT(*) as count FROM rifa_configs;
