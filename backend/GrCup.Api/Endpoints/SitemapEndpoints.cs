using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class SitemapEndpoints
{
    public static void MapSitemapEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/sitemap", async (GrCupDbContext db) =>
        {
            var lastmod = DateTime.UtcNow.ToString("yyyy-MM-dd");

            // Try to get the latest update from participants or schedules
            try
            {
                var latestParticipant = await db.Participants
                    .OrderByDescending(p => p.CreatedAt)
                    .Select(p => p.CreatedAt)
                    .FirstOrDefaultAsync();

                var latestSchedule = await db.Schedules
                    .OrderByDescending(s => s.UpdatedAt)
                    .Select(s => s.UpdatedAt)
                    .FirstOrDefaultAsync();

                var latestDate = new[] { latestParticipant, latestSchedule, DateTime.UtcNow }
                    .Where(d => d != default)
                    .Max();

                if (latestDate != default)
                    lastmod = latestDate.ToString("yyyy-MM-dd");
            }
            catch
            {
                // Fall back to current date if DB query fails
            }

            var xml = $@"<?xml version=""1.0"" encoding=""UTF-8""?>
<urlset xmlns=""http://www.sitemaps.org/schemas/sitemap/0.9"">
  <url>
    <loc>https://grcup.es/</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://grcup.es/inscripcion</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://grcup.es/horarios</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://grcup.es/como-llegar</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://grcup.es/raffle</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://grcup.es/privacy</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://grcup.es/terms</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://grcup.es/consentimiento-datos</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://grcup.es/politica-concurso</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>";

            return Results.Text(xml, "text/xml; charset=utf-8");
        });
    }
}
