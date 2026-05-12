using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using Serilog;
using GrCup.Api.Data;
using GrCup.Api.Hubs;
using GrCup.Api.Services;
using GrCup.Api.Endpoints;
using DotNetEnv;

// Load .env file from application directory
var envPath = Path.Combine(AppContext.BaseDirectory, ".env");
if (File.Exists(envPath))
{
    Env.Load(envPath);
}
else
{
    Env.Load();
}

var builder = WebApplication.CreateBuilder(args);

// ─── Serilog ───
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();
builder.Host.UseSerilog();

// ─── CORS ───
builder.Services.AddCors(options => {
    options.AddPolicy("AllowFrontend", policy => {
        policy.WithOrigins("http://localhost:5173", "http://localhost:5175", "http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()
              .SetIsOriginAllowed(_ => true);
    });
});

// ─── JSON Serialization (camelCase + string enums) ───
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

// ─── MySQL via Pomelo ───
var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Default")
    ?? builder.Configuration.GetConnectionString("Default")
    ?? "Server=localhost;Port=3306;Database=grcup;User=root;Password=myth;";
var serverVersion = new MySqlServerVersion(new Version(8, 0, 0));
builder.Services.AddDbContext<GrCupDbContext>(options =>
    options.UseMySql(connectionString, serverVersion, mysqlOptions => {
        mysqlOptions.EnableRetryOnFailure(3, TimeSpan.FromSeconds(10), null);
    }));

// ─── JWT Authentication ───
var jwtKey = Environment.GetEnvironmentVariable("JWT_SECRET")
    ?? Environment.GetEnvironmentVariable("JWT_SECRET_KEY")
    ?? "SuperSecretKeyThatIsAtLeast32CharactersLong!";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "GrCupApi";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options => {
        options.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuer = true, ValidateAudience = true,
            ValidateLifetime = true, ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer, ValidAudience = "GrCup",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
        // Allow JWT from query string for SignalR WebSocket connections
        // Also read from cookie for browser-based auth
        options.Events = new JwtBearerEvents {
            OnMessageReceived = context => {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;

                // Check for token in cookie if not in Authorization header
                if (string.IsNullOrEmpty(context.Request.Headers.Authorization) && path.StartsWithSegments("/api"))
                {
                    var cookieToken = context.Request.Cookies["gr_cup_token"]
                        ?? context.Request.Cookies["gr_token"];
                    if (!string.IsNullOrEmpty(cookieToken))
                    {
                        context.Token = cookieToken;
                        return Task.CompletedTask;
                    }
                }

                // WebSocket token via query string
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                    context.Token = accessToken;
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();

// ─── SignalR ───
builder.Services.AddSignalR();

// ─── DI Services ───
builder.Services.AddScoped<ParticipantService>();
builder.Services.AddScoped<StripeService>();
builder.Services.AddScoped<DrawService>();
builder.Services.AddScoped<AthleteService>();
builder.Services.AddScoped<ScheduleService>();
builder.Services.AddSingleton<JwtService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<EmailConfigService>();
builder.Services.AddScoped<StripeConfigService>();
builder.Services.AddScoped<ImageProcessorService>();
builder.Services.AddHttpClient<BunnyCdnService>();

// ─── Multi-tenant Services (Phase 1) ───
builder.Services.AddScoped<CompeticionService>();
builder.Services.AddScoped<UsuarioService>();
builder.Services.AddScoped<InscripcionService>();
builder.Services.AddScoped<PermissionService>();
builder.Services.AddScoped<SeedService>();

// ─── Swagger ───
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c => {
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "GR Cup API", Version = "v1" });
});

// ─── Application ───
var app = builder.Build();

// ─── Auto-apply migrations ───
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GrCupDbContext>();
    db.Database.Migrate();
    
    // ─── Phase 0: Seed initial data ───
    var seedService = scope.ServiceProvider.GetRequiredService<SeedService>();
    try
    {
        await seedService.SeedAsync();
    }
    catch (Exception ex)
    {
        Log.Warning(ex, "Seed failed - database may not be available");
    }
}

// ─── Middleware ───
app.UseSerilogRequestLogging();
app.UseCors("AllowFrontend");

if (app.Environment.IsDevelopment()) {
    app.UseSwagger();
    app.UseSwaggerUI();
}

// ─── Authentication & Authorization ───
app.UseAuthentication();
app.UseAuthorization();

// ─── Map SignalR Hub ───
app.MapHub<ParticipantsHub>("/hubs/participants");

// ─── Map API Endpoints ───
app.MapPublicEndpoints();
app.MapWebhookEndpoints();
app.MapAdminEndpoints();
app.MapAthleteEndpoints();
app.MapScheduleEndpoints();
app.MapInscripcionConfigEndpoints();
app.MapInscripcionPreparadaEndpoints();
app.MapResponsableUrlInscripcionEndpoints();
app.MapEmailConfigEndpoints();
app.MapStripeConfigEndpoints();
app.MapRaffleConfigEndpoints();
app.MapRaffleProductsEndpoints();
app.MapImageUploadEndpoints();
app.MapSitemapEndpoints();

// ─── Multi-tenant Endpoints (Phase 1) ───
app.MapCompeticionEndpoints();
app.MapUsuarioEndpoints();
app.MapInscripcionEndpoints();
app.MapRifaEndpoints();


app.Run();

public partial class Program { }
