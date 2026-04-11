using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;

namespace GrCup.Api.Endpoints;

public static class ImageUploadEndpoints
{
    public static void MapImageUploadEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/admin/upload-image", [Authorize] async (
            HttpRequest request,
            ImageProcessorService imageProcessor,
            BunnyCdnService bunnyCdn) =>
        {
            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("image");

            if (file == null)
            {
                return Results.BadRequest(new { success = false, message = "No image file provided" });
            }

            if (!imageProcessor.IsValidImageType(file.ContentType))
            {
                return Results.BadRequest(new
                {
                    success = false,
                    message = "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed"
                });
            }

            if (!imageProcessor.IsValidFileSize(file.Length))
            {
                return Results.BadRequest(new
                {
                    success = false,
                    message = "File size exceeds 5MB limit"
                });
            }

            using var imageStream = file.OpenReadStream();
            var processedStream = await imageProcessor.ProcessToWebpAsync(imageStream);
            var fileName = BunnyCdnService.GenerateFileName(file.FileName);

            try
            {
                var imageUrl = await bunnyCdn.UploadImageAsync(processedStream, fileName);

                return Results.Ok(new
                {
                    success = true,
                    data = new
                    {
                        imageUrl,
                        fileSize = processedStream.Length
                    }
                });
            }
            catch
            {
                return Results.StatusCode(500);
            }
            finally
            {
                await processedStream.DisposeAsync();
            }
        });
    }
}
