using GrCup.Api.Services;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;

namespace GrCup.Api.Endpoints;

public static class CompeticionEndpoints
{
    public static void MapCompeticionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/competiciones");

        // ─── Public Endpoints ───

        // GET /api/competiciones - List all active competitions
        group.MapGet("/", async (CompeticionService service) =>
        {
            var competiciones = await service.GetAllAsync(includeInactive: false);
            var result = new List<object>();
            
            foreach (var c in competiciones)
            {
                var plazasDisponibles = await service.GetPlazasDisponiblesAsync(c.Id);
                result.Add(new
                {
                    c.Id,
                    c.Nombre,
                    c.Slug,
                    c.Fecha,
                    c.Lugar,
                    c.Tipo,
                    c.LogoUrl,
                    c.FaviconUrl,
                    c.EmailContacto,
                    c.Telefono,
                    c.Descripcion,
                    plazasDisponibles
                });
            }
            
            return Results.Ok(new { success = true, data = result });
        });

        // GET /api/competiciones/:slug - Get competition by slug (public info)
        group.MapGet("/{slug}", async (string slug, CompeticionService service) =>
        {
            var competicion = await service.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var config = service.GetEventoConfig(competicion);
            var landingConfig = service.GetLandingConfig(competicion);
            var plazasDisponibles = await service.GetPlazasDisponiblesAsync(competicion.Id);

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    competicion.Id,
                    competicion.Nombre,
                    competicion.Slug,
                    competicion.Fecha,
                    competicion.Lugar,
                    competicion.Tipo,
                    competicion.LogoUrl,
                    competicion.FaviconUrl,
                    competicion.EmailContacto,
                    competicion.Telefono,
                    competicion.Descripcion,
                    competicion.HorariosReady,
                    LandingConfig = landingConfig,
                    EventoConfig = config,
                    plazasDisponibles,
                    rifaActiva = competicion.RifaConfig?.Activo ?? false
                }
            });
        });

        // ─── Admin Endpoints (require authentication) ───

        var adminGroup = app.MapGroup("/api/admin/competiciones").RequireAuthorization();

        // GET /api/admin/competiciones - List all competitions (including inactive)
        adminGroup.MapGet("/", async (CompeticionService service) =>
        {
            var competiciones = await service.GetAllAsync(includeInactive: true);
            var result = new List<object>();
            
            foreach (var c in competiciones)
            {
                var plazasDisponibles = await service.GetPlazasDisponiblesAsync(c.Id);
                result.Add(new
                {
                    c.Id,
                    c.Nombre,
                    c.Slug,
                    c.Fecha,
                    c.Lugar,
                    c.Tipo,
                    c.Activo,
                    c.LogoUrl,
                    c.FaviconUrl,
                    c.EmailContacto,
                    c.Telefono,
                    c.Descripcion,
                    plazasDisponibles
                });
            }
            
            return Results.Ok(new { success = true, data = result });
        });

        // GET /api/admin/competiciones/:id - Get competition by ID
        adminGroup.MapGet("/{id:int}", async (int id, CompeticionService service) =>
        {
            var competicion = await service.GetByIdAsync(id);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var config = service.GetEventoConfig(competicion);
            var landingConfig = service.GetLandingConfig(competicion);

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    competicion.Id,
                    competicion.Nombre,
                    competicion.Slug,
                    competicion.Fecha,
                    competicion.Lugar,
                    competicion.Tipo,
                    competicion.Activo,
                    competicion.LogoUrl,
                    competicion.FaviconUrl,
                    competicion.EmailContacto,
                    competicion.Telefono,
                    competicion.Descripcion,
                    competicion.QrSecret,
                    competicion.HorariosReady,
                    competicion.CreatedAt,
                    competicion.UpdatedAt,
                    LandingConfig = landingConfig,
                    EventoConfig = config
                }
            });
        });

        // POST /api/admin/competiciones - Create new competition
        adminGroup.MapPost("/", async (
            [FromBody] CreateCompeticionRequest request,
            CompeticionService service,
            ILogger<Program> logger) =>
        {
            try
            {
                var competicion = await service.CreateAsync(request);
                logger.LogInformation("Competition created: {Nombre} ({Slug})", competicion.Nombre, competicion.Slug);

                return Results.Created($"/api/admin/competiciones/{competicion.Id}", new
                {
                    success = true,
                    data = competicion
                });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to create competition");
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // PUT /api/admin/competiciones/:id - Update competition
        adminGroup.MapPut("/{id:int}", async (
            int id,
            [FromBody] UpdateCompeticionRequest request,
            CompeticionService service,
            ILogger<Program> logger) =>
        {
            var competicion = await service.UpdateAsync(id, request);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            logger.LogInformation("Competition updated: {Id}", id);
            return Results.Ok(new { success = true, data = competicion });
        });

        // DELETE /api/admin/competiciones/:id - Soft delete competition
        adminGroup.MapDelete("/{id:int}", async (
            int id,
            CompeticionService service,
            ILogger<Program> logger) =>
        {
            var success = await service.DeleteAsync(id);
            if (!success)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            logger.LogInformation("Competition soft deleted: {Id}", id);
            return Results.Ok(new { success = true, message = "Competition deactivated" });
        });

        // PUT /api/admin/competiciones/:id/landing-config - Update landing configuration
        adminGroup.MapPut("/{id:int}/landing-config", async (
            int id,
            [FromBody] LandingConfig config,
            CompeticionService service,
            ILogger<Program> logger) =>
        {
            var competicion = await service.UpdateLandingConfigAsync(id, config);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            logger.LogInformation("Competition landing config updated: {Id}", id);
            return Results.Ok(new { success = true, data = competicion });
        });

        // PUT /api/admin/competiciones/:id/evento-config - Update event configuration
        adminGroup.MapPut("/{id:int}/evento-config", async (
            int id,
            [FromBody] EventoConfig config,
            CompeticionService service,
            ILogger<Program> logger) =>
        {
            var competicion = await service.UpdateEventoConfigAsync(id, config);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            logger.LogInformation("Competition event config updated: {Id}", id);
            return Results.Ok(new { success = true, data = competicion });
        });

        // PUT /api/admin/competiciones/:id/horarios-ready - Toggle horarios ready
        adminGroup.MapPut("/{id:int}/horarios-ready", async (
            int id,
            [FromBody] ToggleHorariosReadyRequest request,
            CompeticionService service,
            ILogger<Program> logger) =>
        {
            var competicion = await service.ToggleHorariosReadyAsync(id, request.HorariosReady);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            logger.LogInformation("Competition horarios ready toggled: {Id} -> {Value}", id, request.HorariosReady);
            return Results.Ok(new { success = true, data = new { competicion.Id, competicion.HorariosReady } });
        });

        // POST /api/admin/competiciones/:id/logo - Upload and set competition logo
        adminGroup.MapPost("/{id:int}/logo", async (
            int id,
            HttpRequest request,
            CompeticionService competicionService,
            ImageProcessorService imageProcessor,
            BunnyCdnService bunnyCdn,
            ILogger<Program> logger) =>
        {
            var competicion = await competicionService.GetByIdAsync(id);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("logo");

            if (file == null)
                return Results.BadRequest(new { success = false, message = "No logo file provided. Use field name 'logo'" });

            if (!imageProcessor.IsValidImageType(file.ContentType))
                return Results.BadRequest(new { success = false, message = "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed" });

            if (!imageProcessor.IsValidFileSize(file.Length))
                return Results.BadRequest(new { success = false, message = "File size exceeds 5MB limit" });

            using var imageStream = file.OpenReadStream();
            var processedStream = await imageProcessor.ProcessToWebpAsync(imageStream);
            
            // Store in competition-specific subfolder: logos/{slug}
            var safeSlug = competicion.Slug.ToLowerInvariant();
            var fileName = $"logo_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.webp";
            var subfolder = $"logos/{safeSlug}";

            try
            {
                var imageUrl = await bunnyCdn.UploadImageAsync(processedStream, fileName, subfolder);

                // Update competicion LogoUrl
                competicion.LogoUrl = imageUrl;
                competicion.UpdatedAt = DateTime.UtcNow;
                await competicionService.UpdateAsync(id, new UpdateCompeticionRequest(
                    LogoUrl: imageUrl
                ));

                logger.LogInformation("Logo uploaded for competition {Id}: {Url} ({Size} bytes)", 
                    id, imageUrl, processedStream.Length);

                return Results.Ok(new
                {
                    success = true,
                    data = new
                    {
                        logoUrl = imageUrl,
                        fileSize = processedStream.Length,
                        competicion = new
                        {
                            competicion.Id,
                            competicion.Nombre,
                            competicion.Slug,
                            competicion.LogoUrl
                        }
                    }
                });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to upload logo for competition {Id}", id);
                return Results.StatusCode(500);
            }
            finally
            {
                await processedStream.DisposeAsync();
            }
        });
    }
}

public record ToggleHorariosReadyRequest(bool HorariosReady);
