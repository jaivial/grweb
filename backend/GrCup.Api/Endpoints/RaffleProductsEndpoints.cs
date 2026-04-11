using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class RaffleProductsEndpoints
{
    public static void MapRaffleProductsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/raffle/products", async (GrCupDbContext db) =>
        {
            var config = await db.RaffleConfig.FirstOrDefaultAsync();

            if (config == null || config.RaffleMethod == 0)
            {
                return Results.Ok(new { products = Array.Empty<object>(), raffleMethod = 0 });
            }

            var products = await db.RaffleProducts
                .Where(p => p.IsActive)
                .OrderBy(p => p.DisplayOrder)
                .Select(p => new
                {
                    p.Id,
                    p.Title,
                    p.Subtitle,
                    p.ImageUrl,
                    p.DisplayOrder
                })
                .ToListAsync();

            return Results.Ok(new { products, raffleMethod = 1 });
        });

        app.MapGet("/api/admin/raffle-products", [Authorize] async (GrCupDbContext db) =>
        {
            var products = await db.RaffleProducts
                .OrderBy(p => p.DisplayOrder)
                .ToListAsync();

            return Results.Ok(new
            {
                success = true,
                data = products.Select(p => new
                {
                    p.Id,
                    p.Title,
                    p.Subtitle,
                    p.ImageUrl,
                    p.DisplayOrder,
                    p.IsActive,
                    p.CreatedAt,
                    p.UpdatedAt
                })
            });
        });

        app.MapPost("/api/admin/raffle-products", [Authorize] async (
            GrCupDbContext db,
            HttpRequest request,
            ImageProcessorService imageProcessor,
            BunnyCdnService bunnyCdn) =>
        {
            var form = await request.ReadFormAsync();

            var title = form["title"].ToString();
            var subtitle = form["subtitle"].ToString();

            if (string.IsNullOrWhiteSpace(title))
            {
                return Results.BadRequest(new { success = false, message = "Title is required" });
            }

            string? imageUrl = null;
            var imageFile = form.Files.GetFile("image");
            if (imageFile != null)
            {
                if (!imageProcessor.IsValidImageType(imageFile.ContentType))
                {
                    return Results.BadRequest(new { success = false, message = "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed" });
                }

                if (!imageProcessor.IsValidFileSize(imageFile.Length))
                {
                    return Results.BadRequest(new { success = false, message = "File size exceeds 5MB limit" });
                }

                using var imageStream = imageFile.OpenReadStream();
                var processedStream = await imageProcessor.ProcessToWebpAsync(imageStream);
                var fileName = BunnyCdnService.GenerateFileName(imageFile.FileName);

                try
                {
                    imageUrl = await bunnyCdn.UploadImageAsync(processedStream, fileName);
                }
                catch (Exception ex)
                {
                    return Results.StatusCode(500);
                }
                finally
                {
                    await processedStream.DisposeAsync();
                }
            }

            var maxOrder = await db.RaffleProducts.AnyAsync()
                ? await db.RaffleProducts.MaxAsync(p => p.DisplayOrder)
                : 0;

            var product = new RaffleProduct
            {
                Title = title,
                Subtitle = string.IsNullOrEmpty(subtitle) ? null : subtitle,
                ImageUrl = imageUrl,
                DisplayOrder = maxOrder + 1,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            db.RaffleProducts.Add(product);
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    product.Id,
                    product.Title,
                    product.Subtitle,
                    product.ImageUrl,
                    product.DisplayOrder,
                    product.IsActive
                }
            });
        });

        app.MapPut("/api/admin/raffle-products/{id}", [Authorize] async (
            GrCupDbContext db,
            int id,
            HttpRequest request,
            ImageProcessorService imageProcessor,
            BunnyCdnService bunnyCdn) =>
        {
            var product = await db.RaffleProducts.FindAsync(id);
            if (product == null)
            {
                return Results.NotFound(new { success = false, message = "Product not found" });
            }

            var form = await request.ReadFormAsync();

            var title = form["title"].ToString();
            var subtitle = form["subtitle"].ToString();
            var isActiveStr = form["isActive"].ToString();

            if (!string.IsNullOrWhiteSpace(title))
            {
                product.Title = title;
            }

            product.Subtitle = subtitle.Length > 0 ? (string.IsNullOrEmpty(subtitle) ? null : subtitle) : product.Subtitle;

            if (bool.TryParse(isActiveStr, out var isActive))
            {
                product.IsActive = isActive;
            }

            var imageFile = form.Files.GetFile("image");
            if (imageFile != null)
            {
                if (!imageProcessor.IsValidImageType(imageFile.ContentType))
                {
                    return Results.BadRequest(new { success = false, message = "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed" });
                }

                if (!imageProcessor.IsValidFileSize(imageFile.Length))
                {
                    return Results.BadRequest(new { success = false, message = "File size exceeds 5MB limit" });
                }

                using var imageStream = imageFile.OpenReadStream();
                var processedStream = await imageProcessor.ProcessToWebpAsync(imageStream);
                var fileName = BunnyCdnService.GenerateFileName(imageFile.FileName);

                try
                {
                    var newUrl = await bunnyCdn.UploadImageAsync(processedStream, fileName);

                    if (!string.IsNullOrEmpty(product.ImageUrl))
                    {
                        _ = bunnyCdn.DeleteImageAsync(product.ImageUrl);
                    }

                    product.ImageUrl = newUrl;
                }
                catch
                {
                    return Results.StatusCode(500);
                }
                finally
                {
                    await processedStream.DisposeAsync();
                }
            }

            product.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    product.Id,
                    product.Title,
                    product.Subtitle,
                    product.ImageUrl,
                    product.DisplayOrder,
                    product.IsActive
                }
            });
        });

        app.MapPatch("/api/admin/raffle-products/{id}/toggle-status", [Authorize] async (
            GrCupDbContext db,
            int id) =>
        {
            var product = await db.RaffleProducts.FindAsync(id);
            if (product == null)
            {
                return Results.NotFound(new { success = false, message = "Product not found" });
            }

            product.IsActive = !product.IsActive;
            product.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    product.Id,
                    product.Title,
                    product.IsActive
                }
            });
        });

        app.MapDelete("/api/admin/raffle-products/{id}", [Authorize] async (
            GrCupDbContext db,
            int id,
            BunnyCdnService bunnyCdn) =>
        {
            var product = await db.RaffleProducts.FindAsync(id);
            if (product == null)
            {
                return Results.NotFound(new { success = false, message = "Product not found" });
            }

            if (!string.IsNullOrEmpty(product.ImageUrl))
            {
                _ = bunnyCdn.DeleteImageAsync(product.ImageUrl);
            }

            db.RaffleProducts.Remove(product);
            await db.SaveChangesAsync();

            return Results.Ok(new { success = true, message = "Product deleted successfully" });
        });

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

public record ReorderProductsRequest(int[] ProductIds);
