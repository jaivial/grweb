using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace GrCup.Api.Tests;

public class SharedApiFixture : IDisposable
{
    private const string BaseUrl = "http://localhost:5006";
    private readonly HttpClient _client;
    private string? _authCookie;

    public HttpClient Client => _client;

    public SharedApiFixture()
    {
        _client = new HttpClient { BaseAddress = new Uri(BaseUrl) };
    }

    public async Task EnsureAuthCookie()
    {
        if (_authCookie != null) return;
        var content = JsonContent.Create(new { username = "jaime@hotmail.com", password = "test123123" });
        var response = await _client.PostAsync("/api/admin/login", content);
        response.EnsureSuccessStatusCode();
        _authCookie = response.Headers.GetValues("set-cookie").First(h => h.Contains("gr_cup_token")).Split(';')[0];
    }

    public async Task ClearAllProducts()
    {
        await EnsureAuthCookie();
        var listRes = await AdminGetAsync("/api/admin/raffle-products");
        if (listRes.IsSuccessStatusCode)
        {
            var json = await listRes.Content.ReadFromJsonAsync<JsonElement>();
            if (json.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            {
                foreach (var p in data.EnumerateArray())
                {
                    var id = p.GetProperty("id").GetInt32();
                    var delReq = new HttpRequestMessage(HttpMethod.Delete, $"/api/admin/raffle-products/{id}");
                    delReq.Headers.Add("Cookie", _authCookie);
                    await _client.SendAsync(delReq);
                }
            }
        }
    }

    public async Task ResetConfig()
    {
        await EnsureAuthCookie();
        var json = JsonSerializer.Serialize(new { isEnabled = true, disabledMessage = (string?)null, raffleMethod = 0 });
        var content = new StringContent(json, null, "application/json");
        var request = new HttpRequestMessage(HttpMethod.Put, "/api/admin/raffle-config") { Content = content };
        request.Headers.Add("Cookie", _authCookie);
        await _client.SendAsync(request);
    }

    public async Task<HttpResponseMessage> AdminGetAsync(string path)
    {
        await EnsureAuthCookie();
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add("Cookie", _authCookie);
        return await _client.SendAsync(request);
    }

    public async Task<HttpResponseMessage> AdminPostAsync(string path, HttpContent? content = null)
    {
        await EnsureAuthCookie();
        var request = new HttpRequestMessage(HttpMethod.Post, path);
        if (content != null) request.Content = content;
        request.Headers.Add("Cookie", _authCookie);
        return await _client.SendAsync(request);
    }

    public async Task<HttpResponseMessage> AdminPutAsync(string path, HttpContent? content = null)
    {
        await EnsureAuthCookie();
        var request = new HttpRequestMessage(HttpMethod.Put, path);
        if (content != null) request.Content = content;
        request.Headers.Add("Cookie", _authCookie);
        return await _client.SendAsync(request);
    }

    public async Task<HttpResponseMessage> AdminPatchAsync(string path)
    {
        await EnsureAuthCookie();
        var request = new HttpRequestMessage(HttpMethod.Patch, path);
        request.Headers.Add("Cookie", _authCookie);
        return await _client.SendAsync(request);
    }

    public async Task<HttpResponseMessage> AdminDeleteAsync(string path)
    {
        await EnsureAuthCookie();
        var request = new HttpRequestMessage(HttpMethod.Delete, path);
        request.Headers.Add("Cookie", _authCookie);
        return await _client.SendAsync(request);
    }

    public async Task<int> CreateProduct(string title, string? subtitle = null)
    {
        await EnsureAuthCookie();
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(title), "title");
        if (subtitle != null) form.Add(new StringContent(subtitle), "subtitle");

        var response = await _client.PostAsync("/api/admin/raffle-products", form);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return json.GetProperty("data").GetProperty("id").GetInt32();
    }

    public async Task SetRaffleMethod(int method)
    {
        await EnsureAuthCookie();
        var json = JsonSerializer.Serialize(new { isEnabled = true, disabledMessage = (string?)null, raffleMethod = method });
        var content = new StringContent(json, null, "application/json");
        var request = new HttpRequestMessage(HttpMethod.Put, "/api/admin/raffle-config") { Content = content };
        request.Headers.Add("Cookie", _authCookie);
        await _client.SendAsync(request);
    }

    public void Dispose()
    {
        _client.Dispose();
    }
}

public class RaffleProductsApiTests : IClassFixture<SharedApiFixture>, IDisposable
{
    private readonly SharedApiFixture _fixture;
    private readonly List<int> _createdProductIds = new();

    public RaffleProductsApiTests(SharedApiFixture fixture)
    {
        _fixture = fixture;
    }

    public void Dispose()
    {
        foreach (var id in _createdProductIds)
        {
            try { DeleteProduct(id).Wait(); } catch { /* ignore */ }
        }
    }

    private async Task DeleteProduct(int id)
    {
        await AdminDeleteAsync($"/api/admin/raffle-products/{id}");
    }

    private string GetCookie() => "";

    private async Task<HttpResponseMessage> AdminGetAsync(string path) => await _fixture.AdminGetAsync(path);
    private async Task<HttpResponseMessage> AdminPostAsync(string path, HttpContent? content = null) => await _fixture.AdminPostAsync(path, content);
    private async Task<HttpResponseMessage> AdminPutAsync(string path, HttpContent? content = null) => await _fixture.AdminPutAsync(path, content);
    private async Task<HttpResponseMessage> AdminPatchAsync(string path) => await _fixture.AdminPatchAsync(path);
    private async Task<HttpResponseMessage> AdminDeleteAsync(string path) => await _fixture.AdminDeleteAsync(path);

    private async Task<int> CreateProduct(string title, string? subtitle = null)
    {
        var id = await _fixture.CreateProduct(title, subtitle);
        _createdProductIds.Add(id);
        return id;
    }

    private async Task SetRaffleMethod(int method) => await _fixture.SetRaffleMethod(method);

    // ─── GET /api/admin/raffle-products ─────────────────────────────────────

    [Fact]
    public async Task GetAdminProducts_ReturnsEmptyWhenNoProducts()
    {
        await _fixture.ClearAllProducts();
        var response = await AdminGetAsync("/api/admin/raffle-products");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(json.GetProperty("success").GetBoolean());
        Assert.Equal(JsonValueKind.Array, json.GetProperty("data").ValueKind);
    }

    [Fact]
    public async Task GetAdminProducts_ReturnsCorrectShape()
    {
        var id = await CreateProduct("Shape Test");

        var response = await AdminGetAsync("/api/admin/raffle-products");
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var product = json.GetProperty("data").EnumerateArray().First(p => p.GetProperty("id").GetInt32() == id);

        Assert.True(product.TryGetProperty("id", out _));
        Assert.True(product.TryGetProperty("title", out _));
        Assert.True(product.TryGetProperty("isActive", out _));
        Assert.True(product.TryGetProperty("displayOrder", out _));
        Assert.True(product.TryGetProperty("createdAt", out _));
        Assert.True(product.TryGetProperty("updatedAt", out _));
    }

    // ─── POST /api/admin/raffle-products ────────────────────────────────────

    [Fact]
    public async Task CreateProduct_WithTitleOnly_Returns200()
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Just a Title"), "title");

        var response = await _fixture.Client.PostAsync("/api/admin/raffle-products", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(json.GetProperty("success").GetBoolean());
        Assert.Equal("Just a Title", json.GetProperty("data").GetProperty("title").GetString());
        var id = json.GetProperty("data").GetProperty("id").GetInt32();
        _createdProductIds.Add(id);
    }

    [Fact]
    public async Task CreateProduct_WithTitleAndSubtitle_Returns200()
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Title With Subtitle"), "title");
        form.Add(new StringContent("My subtitle"), "subtitle");

        var response = await _fixture.Client.PostAsync("/api/admin/raffle-products", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Title With Subtitle", json.GetProperty("data").GetProperty("title").GetString());
        Assert.Equal("My subtitle", json.GetProperty("data").GetProperty("subtitle").GetString());
        var id = json.GetProperty("data").GetProperty("id").GetInt32();
        _createdProductIds.Add(id);
    }

    [Fact]
    public async Task CreateProduct_TitleRequired_Returns400()
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(""), "title");

        var response = await _fixture.Client.PostAsync("/api/admin/raffle-products", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(json.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task CreateProduct_InvalidFileType_Returns400()
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Invalid File Test"), "title");
        var textContent = new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes("not an image"));
        textContent.Headers.ContentType = MediaTypeHeaderValue.Parse("text/plain");
        form.Add(textContent, "image", "file.txt");

        var response = await _fixture.Client.PostAsync("/api/admin/raffle-products", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains("Invalid file type", json.GetProperty("message").GetString());
    }

    [Fact]
    public async Task CreateProduct_OversizedFile_Returns400()
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Oversized File Test"), "title");
        var largeContent = new ByteArrayContent(new byte[6 * 1024 * 1024]);
        largeContent.Headers.ContentType = MediaTypeHeaderValue.Parse("image/png");
        form.Add(largeContent, "image", "huge.png");

        var response = await _fixture.Client.PostAsync("/api/admin/raffle-products", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ─── PUT /api/admin/raffle-products/{id} ────────────────────────────────

    [Fact]
    public async Task UpdateProduct_UpdatesTitle()
    {
        var id = await CreateProduct("Original Title");

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Updated Title"), "title");

        var response = await _fixture.Client.PutAsync($"/api/admin/raffle-products/{id}", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Updated Title", json.GetProperty("data").GetProperty("title").GetString());
    }

    [Fact]
    public async Task UpdateProduct_TogglesIsActive()
    {
        var id = await CreateProduct("Toggle Test");

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Toggle Test"), "title");
        form.Add(new StringContent("false"), "isActive");

        var response = await _fixture.Client.PutAsync($"/api/admin/raffle-products/{id}", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(json.GetProperty("data").GetProperty("isActive").GetBoolean());
    }

    // ─── PATCH /api/admin/raffle-products/{id}/toggle-status ───────────────

    [Fact]
    public async Task ToggleStatus_FlipsIsActive()
    {
        var id = await CreateProduct("Toggle Status Test");

        var response1 = await AdminPatchAsync($"/api/admin/raffle-products/{id}/toggle-status");
        var json1 = await response1.Content.ReadFromJsonAsync<JsonElement>();
        var afterFirst = json1.GetProperty("data").GetProperty("isActive").GetBoolean();

        var response2 = await AdminPatchAsync($"/api/admin/raffle-products/{id}/toggle-status");
        var json2 = await response2.Content.ReadFromJsonAsync<JsonElement>();
        var afterSecond = json2.GetProperty("data").GetProperty("isActive").GetBoolean();

        Assert.NotEqual(afterFirst, afterSecond);
    }

    // ─── DELETE /api/admin/raffle-products/{id} ───────────────────────────

    [Fact]
    public async Task DeleteProduct_RemovesProduct()
    {
        var id = await CreateProduct("Product To Delete");

        var response = await _fixture.AdminDeleteAsync($"/api/admin/raffle-products/{id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        _createdProductIds.Remove(id);
        var getResponse = await AdminGetAsync("/api/admin/raffle-products");
        var json = await getResponse.Content.ReadFromJsonAsync<JsonElement>();
        var exists = json.GetProperty("data").EnumerateArray().Any(p => p.GetProperty("id").GetInt32() == id);
        Assert.False(exists);
    }

    [Fact]
    public async Task DeleteProduct_NonExistent_Returns404()
    {
        var response = await _fixture.AdminDeleteAsync("/api/admin/raffle-products/999999");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ─── POST /api/admin/raffle-products/reorder ──────────────────────────

    [Fact]
    public async Task ReorderProducts_ChangesDisplayOrder()
    {
        var id1 = await CreateProduct("Reorder First");
        var id2 = await CreateProduct("Reorder Second");

        var body = JsonSerializer.Serialize(new { productIds = new[] { id2, id1 } });
        var content = new StringContent(body, null, "application/json");
        var response = await AdminPostAsync("/api/admin/raffle-products/reorder", content);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var getResponse = await AdminGetAsync("/api/admin/raffle-products");
        var getJson = await getResponse.Content.ReadFromJsonAsync<JsonElement>();
        var products = getJson.GetProperty("data").EnumerateArray().ToList();
        var first = products.First(p => p.GetProperty("id").GetInt32() == id1);
        var second = products.First(p => p.GetProperty("id").GetInt32() == id2);
        Assert.True(first.GetProperty("displayOrder").GetInt32() > second.GetProperty("displayOrder").GetInt32());
    }

    // ─── GET /api/raffle/products (public) ────────────────────────────────

    [Fact]
    public async Task GetPublicProducts_RaffleMethod0_ReturnsEmptyArray()
    {
        await _fixture.ClearAllProducts();
        await SetRaffleMethod(0);

        var response = await _fixture.Client.GetAsync("/api/raffle/products");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, json.GetProperty("products").GetArrayLength());
        Assert.Equal(0, json.GetProperty("raffleMethod").GetInt32());
    }

    [Fact]
    public async Task GetPublicProducts_RaffleMethod1_ReturnsActiveProducts()
    {
        await _fixture.ClearAllProducts();
        await SetRaffleMethod(1);
        await CreateProduct("Public Active Product");

        var response = await _fixture.Client.GetAsync("/api/raffle/products");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, json.GetProperty("raffleMethod").GetInt32());
        var products = json.GetProperty("products").EnumerateArray().ToList();
        Assert.NotEmpty(products);
        Assert.Equal("Public Active Product", products[0].GetProperty("title").GetString());
    }

    [Fact]
    public async Task GetPublicProducts_RaffleMethod1_ExcludesInactiveProducts()
    {
        await _fixture.ClearAllProducts();
        await SetRaffleMethod(1);
        var inactiveId = await CreateProduct("Inactive Product");

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Inactive Product"), "title");
        form.Add(new StringContent("false"), "isActive");
        await _fixture.Client.PutAsync($"/api/admin/raffle-products/{inactiveId}", form);

        var response = await _fixture.Client.GetAsync("/api/raffle/products");
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, json.GetProperty("products").GetArrayLength());
    }

    // ─── GET /api/raffle/config (public) ─────────────────────────────────

    [Fact]
    public async Task GetPublicConfig_ReturnsCurrentConfig()
    {
        await SetRaffleMethod(1);

        var response = await _fixture.Client.GetAsync("/api/raffle/config");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(json.GetProperty("isEnabled").GetBoolean());
        Assert.Equal(1, json.GetProperty("raffleMethod").GetInt32());
    }

    // ─── PUT /api/admin/raffle-config ─────────────────────────────────────

    [Fact]
    public async Task UpdateRaffleConfig_SetsRaffleMethod()
    {
        await SetRaffleMethod(1);

        var json = JsonSerializer.Serialize(new { isEnabled = true, disabledMessage = (string?)null, raffleMethod = 1 });
        var content = new StringContent(json, null, "application/json");
        var response = await _fixture.Client.PutAsync("/api/admin/raffle-config", content);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var responseJson = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, responseJson.GetProperty("raffleMethod").GetInt32());
    }
}
