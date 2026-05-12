namespace GrCup.Api.Services;

public class BunnyCdnService
{
    private readonly HttpClient _httpClient;
    private readonly string _storageZone;
    private readonly string _password;
    private readonly string _pullZoneUrl;

    public BunnyCdnService(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _storageZone = Environment.GetEnvironmentVariable("BUNNYCDN_STORAGE_ZONE") ?? "jaimedigitalstudio";
        _password = Environment.GetEnvironmentVariable("BUNNYCDN_PASSWORD") ?? "";
        _pullZoneUrl = Environment.GetEnvironmentVariable("BUNNYCDN_PULL_ZONE_URL") ?? "https://jaimedigitalstudio.b-cdn.net";
    }

    public async Task<string> UploadImageAsync(Stream imageStream, string fileName, string subfolder = "customGifts")
    {
        var url = $"https://storage.bunnycdn.com/{_storageZone}/grcup/{subfolder}/{fileName}";

        using var memoryStream = new MemoryStream();
        await imageStream.CopyToAsync(memoryStream);

        using var request = new HttpRequestMessage(HttpMethod.Put, url);
        request.Headers.Add("AccessKey", _password);
        request.Content = new ByteArrayContent(memoryStream.ToArray());

        var response = await _httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();

        return $"{_pullZoneUrl}/grcup/{subfolder}/{fileName}";
    }

    public async Task DeleteImageAsync(string imageUrl)
    {
        if (string.IsNullOrEmpty(imageUrl)) return;

        var uri = new Uri(imageUrl);
        var fileName = Path.GetFileName(uri.AbsolutePath);

        var url = $"https://storage.bunnycdn.com/{_storageZone}/grcup/customGifts/{fileName}";

        using var request = new HttpRequestMessage(HttpMethod.Delete, url);
        request.Headers.Add("AccessKey", _password);

        await _httpClient.SendAsync(request);
    }

    public static string GenerateFileName(string originalName)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var safeName = Path.GetFileNameWithoutExtension(originalName)
            .Replace(" ", "-")
            .Replace("_", "-");
        if (safeName.Length > 30) safeName = safeName[..30];
        return $"{timestamp}_{safeName}.webp";
    }
}
