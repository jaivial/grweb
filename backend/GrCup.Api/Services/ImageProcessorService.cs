using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace GrCup.Api.Services;

public class ImageProcessorService
{
    private const int MaxFileSizeBytes = 100 * 1024; // 100KB target for logos
    private static readonly HashSet<string> AllowedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp", "image/gif"
    };

    public bool IsValidImageType(string contentType)
    {
        return AllowedMimeTypes.Contains(contentType);
    }

    public bool IsValidFileSize(long fileSize)
    {
        return fileSize <= 5 * 1024 * 1024;
    }

    public async Task<Stream> ProcessToWebpAsync(Stream inputStream)
    {
        inputStream.Position = 0;
        using var image = await Image.LoadAsync(inputStream);

        var outputStream = new MemoryStream();

        var encoder = new WebpEncoder
        {
            Quality = 75,
            FileFormat = WebpFileFormatType.Lossy
        };

        await image.SaveAsWebpAsync(outputStream, encoder);
        outputStream.Position = 0;

        if (outputStream.Length <= MaxFileSizeBytes)
        {
            return outputStream;
        }

        outputStream.Dispose();
        outputStream = new MemoryStream();

        for (var quality = 60; quality >= 10; quality -= 10)
        {
            inputStream.Position = 0;
            using var retryImage = await Image.LoadAsync(inputStream);
            
            var retryEncoder = new WebpEncoder
            {
                Quality = quality,
                FileFormat = WebpFileFormatType.Lossy
            };

            outputStream = new MemoryStream();
            await retryImage.SaveAsWebpAsync(outputStream, retryEncoder);
            outputStream.Position = 0;

            if (outputStream.Length <= MaxFileSizeBytes)
            {
                return outputStream;
            }
            outputStream.Dispose();
        }

        outputStream = new MemoryStream();
        inputStream.Position = 0;
        using var finalImage = await Image.LoadAsync(inputStream);
        finalImage.Mutate(x => x.Resize(new ResizeOptions
        {
            Size = new Size(800, 0),
            Mode = ResizeMode.Max
        }));

        var finalEncoder = new WebpEncoder
        {
            Quality = 20,
            FileFormat = WebpFileFormatType.Lossy
        };
        await finalImage.SaveAsWebpAsync(outputStream, finalEncoder);
        outputStream.Position = 0;
        return outputStream;
    }

    /// <summary>
    /// Converts a newsletter content image to WebP at high quality, resizing only
    /// very large images. Unlike <see cref="ProcessToWebpAsync"/> (tuned for tiny logos),
    /// this preserves visual fidelity for email body imagery.
    /// </summary>
    public async Task<Stream> ProcessContentImageToWebpAsync(Stream inputStream)
    {
        inputStream.Position = 0;
        using var image = await Image.LoadAsync(inputStream);

        if (image.Width > 1200)
        {
            image.Mutate(x => x.Resize(new ResizeOptions
            {
                Size = new Size(1200, 0),
                Mode = ResizeMode.Max
            }));
        }

        var outputStream = new MemoryStream();
        var encoder = new WebpEncoder
        {
            Quality = 82,
            FileFormat = WebpFileFormatType.Lossy
        };
        await image.SaveAsWebpAsync(outputStream, encoder);
        outputStream.Position = 0;
        return outputStream;
    }
}
