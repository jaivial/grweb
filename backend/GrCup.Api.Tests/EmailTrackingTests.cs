using GrCup.Api.Models;
using GrCup.Api.Services;

namespace GrCup.Api.Tests;

public class EmailTrackingTests
{
    [Fact]
    public void EmailStatus_Constants_AreCorrect()
    {
        Assert.Equal("pending", EmailTrackingService.StatusPending);
        Assert.Equal("sent", EmailTrackingService.StatusSent);
        Assert.Equal("error", EmailTrackingService.StatusError);
    }

    [Fact]
    public void Inscripcion_HasEmailTrackingFields()
    {
        var inscripcion = new Inscripcion();
        
        // Default values
        Assert.Equal(EmailTrackingService.StatusPending, inscripcion.EmailEnviadoStatus);
        Assert.Null(inscripcion.EmailEnviadoAt);
        Assert.Null(inscripcion.EmailEnviadoError);
    }

    [Fact]
    public void Inscripcion_CanSetEmailSentStatus()
    {
        var inscripcion = new Inscripcion();
        var now = DateTime.UtcNow;
        
        inscripcion.EmailEnviadoStatus = EmailTrackingService.StatusSent;
        inscripcion.EmailEnviadoAt = now;
        
        Assert.Equal(EmailTrackingService.StatusSent, inscripcion.EmailEnviadoStatus);
        Assert.Equal(now, inscripcion.EmailEnviadoAt);
    }

    [Fact]
    public void Inscripcion_CanSetEmailErrorStatus()
    {
        var inscripcion = new Inscripcion();
        var errorMessage = "SMTP connection failed";
        
        inscripcion.EmailEnviadoStatus = EmailTrackingService.StatusError;
        inscripcion.EmailEnviadoError = errorMessage;
        
        Assert.Equal(EmailTrackingService.StatusError, inscripcion.EmailEnviadoStatus);
        Assert.Equal(errorMessage, inscripcion.EmailEnviadoError);
    }
}
