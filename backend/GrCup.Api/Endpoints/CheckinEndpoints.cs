using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;

namespace GrCup.Api.Endpoints;

public static class CheckinEndpoints
{
    public static void MapCheckinEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/admin/checkin/{athleteId} - Get checkin status for an athlete
        app.MapGet("/api/admin/checkin/{athleteId}", [Authorize] async (
            int athleteId,
            CheckinService checkinService) =>
        {
            var status = await checkinService.GetCheckinStatusAsync(athleteId);
            return status != null
                ? Results.Ok(new { success = true, data = status })
                : Results.NotFound(new { success = false, message = "Athlete not found" });
        });

        // GET /api/admin/checkin/qr/{qrCode} - Find athlete by QR code
        app.MapGet("/api/admin/checkin/qr/{qrCode}", [Authorize] async (
            string qrCode,
            CheckinService checkinService) =>
        {
            var status = await checkinService.FindByQrCodeAsync(qrCode);
            return status != null
                ? Results.Ok(new { success = true, data = status })
                : Results.NotFound(new { success = false, message = "Athlete not found" });
        });

        // POST /api/admin/checkin/{athleteId}/qr - Generate QR code for athlete
        app.MapPost("/api/admin/checkin/{athleteId}/qr", [Authorize] async (
            int athleteId,
            CheckinService checkinService) =>
        {
            var qrCode = await checkinService.GenerateQrCodeAsync(athleteId);
            return qrCode != null
                ? Results.Ok(new { success = true, data = new { qrCode } })
                : Results.NotFound(new { success = false, message = "Athlete not found" });
        });

        // GET /api/admin/checkin/{athleteId}/qr-image — Get QR code as PNG image
        app.MapGet("/api/admin/checkin/{athleteId}/qr-image", [Authorize] async (
            int athleteId,
            CheckinService checkinService) =>
        {
            var qrBytes = await checkinService.GenerateQrImageAsync(athleteId);
            if (qrBytes == null)
                return Results.NotFound(new { success = false, message = "Athlete not found or has no QR code" });

            return Results.File(qrBytes, "image/png", $"qr-athlete-{athleteId}.png");
        });

        // POST /api/admin/checkin/{athleteId}/confirm - Confirm checkin
        app.MapPost("/api/admin/checkin/{athleteId}/confirm", [Authorize] async (
            int athleteId,
            CheckinService checkinService) =>
        {
            var athlete = await checkinService.ConfirmCheckinAsync(athleteId);
            if (athlete == null)
            {
                return Results.BadRequest(new { success = false, message = "Athlete must have Paid status" });
            }
            return Results.Ok(new { success = true, data = athlete });
        });

        // GET /api/checkin/validate/{qrCode} - Public validation endpoint (no auth required)
        app.MapGet("/api/checkin/validate/{qrCode}", async (
            string qrCode,
            CheckinService checkinService) =>
        {
            var status = await checkinService.FindByQrCodeAsync(qrCode);
            return status != null
                ? Results.Ok(new { success = true, data = status })
                : Results.NotFound(new { success = false, message = "Invalid QR code" });
        });
    }
}
