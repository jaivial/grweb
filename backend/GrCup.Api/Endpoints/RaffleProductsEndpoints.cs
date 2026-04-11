using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class RaffleProductsEndpoints
{
    public static void MapRaffleProductsEndpoints(this IEndpointRouteBuilder app)
    {
        // Public: Get active raffle products (only when method is "custom")
        // GET /api/raffle/products
        app.MapGet("/api/raffle/products", async (GrCupDbContext db) =>
        {
            var config = await db.RaffleConfig.FirstOrDefaultAsync();
            
            // If custom method is not active, return empty list
            if (config?.RaffleMethod != "custom")
            {
                return Results.Ok(new { products = Array.Empty<object>(), raffleMethod = config?.RaffleMethod ?? "default" });
            }

            var products = await db.RaffleProducts
                .Where(p => p.IsActive)
                .OrderBy(p => p.DisplayOrder)
                .Select(p => new
                {
                    p.Id,
                    p.Title,
                    p.Subtitle,
                    ImageData = p.ImageData != null ? $"data:{p.ImageMimeType};base64,{p.ImageData}" : null,
                    p.DisplayOrder
                })
                .ToListAsync();

            return Results.Ok(new { products, raffleMethod = "custom" });
        });

        // Admin: Get all raffle products (including inactive)
        // GET /api/admin/raffle-products
        app.MapGet("/api/admin/raffle-products", [Authorize] async (GrCupDbContext db) =>
        {
            var products = await db.RaffleProducts
                .OrderBy(p => p.DisplayOrder)
                .ToListAsync();

            return Results.Ok(new { 
                success = true, 
                data = products.Select(p => new
                {
                    p.Id,
                    p.Title,
                    p.Subtitle,
                    p.ImageMimeType,
                    HasImage = !string.IsNullOrEmpty(p.ImageData),
                    p.DisplayOrder,
                    p.IsActive,
                    p.CreatedAt,
                    p.UpdatedAt
                })
            });
        });

        // Admin: Create a new raffle product
        // POST /api/admin/raffle-products
        app.MapPost("/api/admin/raffle-products", [Authorize] async (
            GrCupDbContext db,
            [FromBody] CreateRaffleProductRequest request) =>
        {
            // Validate image data if provided
            if (!string.IsNullOrEmpty(request.ImageData) && string.IsNullOrEmpty(request.ImageMimeType))
            {
                return Results.BadRequest(new { success = false, message = "Image MIME type is required when image data is provided" });
            }

            // Get max display order for new products
            var maxOrder = await db.RaffleProducts.AnyAsync() 
                ? await db.RaffleProducts.MaxAsync(p => p.DisplayOrder)
                : 0;

            var product = new RaffleProduct
            {
                Title = request.Title,
                Subtitle = request.Subtitle,
                ImageData = request.ImageData,
                ImageMimeType = request.ImageMimeType,
                DisplayOrder = maxOrder + 1,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            db.RaffleProducts.Add(product);
            await db.SaveChangesAsync();

            return Results.Ok(new { 
                success = true, 
                data = new
                {
                    product.Id,
                    product.Title,
                    product.Subtitle,
                    HasImage = !string.IsNullOrEmpty(product.ImageData),
                    product.DisplayOrder,
                    product.IsActive
                }
            });
        });

        // Admin: Update a raffle product
        // PUT /api/admin/raffle-products/{id}
        app.MapPut("/api/admin/raffle-products/{id}", [Authorize] async (
            GrCupDbContext db,
            int id,
            [FromBody] UpdateRaffleProductRequest request) =>
        {
            var product = await db.RaffleProducts.FindAsync(id);
            if (product == null)
            {
                return Results.NotFound(new { success = false, message = "Product not found" });
            }

            // Validate image data if provided
            if (!string.IsNullOrEmpty(request.ImageData) && string.IsNullOrEmpty(request.ImageMimeType))
            {
                return Results.BadRequest(new { success = false, message = "Image MIME type is required when image data is provided" });
            }

            product.Title = request.Title ?? product.Title;
            product.Subtitle = request.Subtitle ?? product.Subtitle;
            
            if (request.ImageData != null)
            {
                product.ImageData = request.ImageData;
                product.ImageMimeType = request.ImageMimeType;
            }
            
            if (request.DisplayOrder.HasValue)
            {
                product.DisplayOrder = request.DisplayOrder.Value;
            }
            
            if (request.IsActive.HasValue)
            {
                product.IsActive = request.IsActive.Value;
            }
            
            product.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync();

            return Results.Ok(new { 
                success = true, 
                data = new
                {
                    product.Id,
                    product.Title,
                    product.Subtitle,
                    HasImage = !string.IsNullOrEmpty(product.ImageData),
                    product.DisplayOrder,
                    product.IsActive
                }
            });
        });

        // Admin: Delete a raffle product
        // DELETE /api/admin/raffle-products/{id}
        app.MapDelete("/api/admin/raffle-products/{id}", [Authorize] async (
            GrCupDbContext db,
            int id) =>
        {
            var product = await db.RaffleProducts.FindAsync(id);
            if (product == null)
            {
                return Results.NotFound(new { success = false, message = "Product not found" });
            }

            db.RaffleProducts.Remove(product);
            await db.SaveChangesAsync();

            return Results.Ok(new { success = true, message = "Product deleted successfully" });
        });

        // Admin: Reorder products
        // POST /api/admin/raffle-products/reorder
        app.MapPost("/api/admin/raffle-products/reorder", [Authorize] async (
            GrCupDbContext db,
            [FromBody] ReorderProductsRequest request) =>
        {
            var products = await db.RaffleProducts.Where(p => request.ProductIds.Contains(p.Id)).ToListAsync();
            
            for (int i = 0; i < request.ProductIds.Length; i++)
            {
                var product = products.FirstOrDefault(p => p.Id == request.ProductIds[i]);
                if (product != null)
                {
                    product.DisplayOrder = i + 1;
                    product.UpdatedAt = DateTime.UtcNow;
                }
            }

            await db.SaveChangesAsync();

            return Results.Ok(new { success = true, message = "Products reordered successfully" });
        });
    }
}

public record CreateRaffleProductRequest(
    string Title,
    string? Subtitle,
    string? ImageData,
    string? ImageMimeType
);

public record UpdateRaffleProductRequest(
    string? Title,
    string? Subtitle,
    string? ImageData,
    string? ImageMimeType,
    int? DisplayOrder,
    bool? IsActive
);

public record ReorderProductsRequest(int[] ProductIds);
