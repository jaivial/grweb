using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GrCup.Api.Endpoints;

public static class ImageUploadEndpoints
{
    public static void MapImageUploadEndpoints(this IEndpointRouteBuilder app)
    {
        // Admin: Upload image and convert to base64
        // POST /api/admin/upload-image
        app.MapPost("/api/admin/upload-image", [Authorize] async (
            HttpRequest request) =>
        {
            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("image");

            if (file == null)
            {
                return Results.BadRequest(new { success = false, message = "No image file provided" });
            }

            // Validate file type
            var allowedTypes = new[] { "image/jpeg", "image/png", "image/webp", "image/gif" };
            if (!allowedTypes.Contains(file.ContentType))
            {
                return Results.BadRequest(new { 
                    success = false, 
                    message = "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed" 
                });
            }

            // Validate file size (max 5MB)
            if (file.Length > 5 * 1024 * 1024)
            {
                return Results.BadRequest(new { 
                    success = false, 
                    message = "File size exceeds 5MB limit" 
                });
            }

            // Convert to base64
            using var memoryStream = new MemoryStream();
            await file.CopyToAsync(memoryStream);
            var imageBytes = memoryStream.ToArray();
            var base64String = Convert.ToBase64String(imageBytes);

            return Results.Ok(new { 
                success = true, 
                data = new
                {
                    imageData = base64String,
                    imageMimeType = file.ContentType,
                    fileSize = file.Length
                }
            });
        });
    }
}
