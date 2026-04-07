using Microsoft.EntityFrameworkCore;
using GrCup.Api.Models;

namespace GrCup.Api.Data;

public class GrCupDbContext : DbContext
{
    public GrCupDbContext(DbContextOptions<GrCupDbContext> options) : base(options) { }

    public DbSet<Participant> Participants => Set<Participant>();
    public DbSet<Draw> Draws => Set<Draw>();
    public DbSet<Athlete> Athletes => Set<Athlete>();
    public DbSet<Schedule> Schedules => Set<Schedule>();
    public DbSet<InscripcionConfig> InscripcionConfig => Set<InscripcionConfig>();
    public DbSet<InscripcionPreparada> InscripcionesPreparadas => Set<InscripcionPreparada>();
    public DbSet<ResponsableInscripcion> ResponsableInscripcion => Set<ResponsableInscripcion>();
    public DbSet<UrlInscripcion> UrlInscripcion => Set<UrlInscripcion>();
    public DbSet<SchedulePublishedConfig> SchedulePublishedConfig => Set<SchedulePublishedConfig>();
    public DbSet<EmailConfig> EmailConfig => Set<EmailConfig>();
    public DbSet<StripeConfig> StripeConfig => Set<StripeConfig>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Participant>(entity => {
            entity.HasIndex(e => e.Email).IsUnique();
            entity.HasIndex(e => e.StripeSessionId);
            entity.Property(e => e.TotalPaid).HasPrecision(10, 2);
        });

        modelBuilder.Entity<Athlete>(entity => {
            entity.HasIndex(e => e.Email);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.Sex);
            entity.HasIndex(e => e.WeightCategory);
            entity.Property(e => e.TotalWeight).HasPrecision(10, 2);
        });

        modelBuilder.Entity<Schedule>(entity => {
            entity.HasIndex(e => e.Date);
            entity.HasIndex(e => new { e.SexCategory, e.WeightCategory });
        });

        modelBuilder.Entity<Draw>(entity => {
            entity.HasOne(d => d.Participant)
                .WithMany()
                .HasForeignKey(d => d.ParticipantId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
