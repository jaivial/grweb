using Microsoft.EntityFrameworkCore;
using GrCup.Api.Models;

namespace GrCup.Api.Data;

public class GrCupDbContext : DbContext
{
    public GrCupDbContext(DbContextOptions<GrCupDbContext> options) : base(options) { }

    // Legacy GR Cup models
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
    public DbSet<RaffleConfig> RaffleConfig => Set<RaffleConfig>();
    public DbSet<RaffleProduct> RaffleProducts => Set<RaffleProduct>();
    public DbSet<LiftEntry> LiftEntries => Set<LiftEntry>();
    public DbSet<LiftEntryInscripcion> LiftEntriesInscripcion => Set<LiftEntryInscripcion>();

    // Multi-tenant models
    public DbSet<Competicion> Competiciones => Set<Competicion>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<UsuarioCompeticion> UsuariosCompeticiones => Set<UsuarioCompeticion>();
    public DbSet<UsuarioPermission> UsuariosPermissions => Set<UsuarioPermission>();
    public DbSet<Inscripcion> Inscripciones => Set<Inscripcion>();
    public DbSet<CuponDescuento> CuponesDescuento => Set<CuponDescuento>();
    public DbSet<RifaTicket> RifaTickets => Set<RifaTicket>();
    public DbSet<RifaConfig> RifaConfigs => Set<RifaConfig>();
    public DbSet<SorteoInscripcion> SorteosInscripcion => Set<SorteoInscripcion>();

    // Referido system (untracked WIP, stubbed to keep build green)
    public DbSet<ReferidoConfig> ReferidosConfig => Set<ReferidoConfig>();
    public DbSet<CodigoReferido> CodigosReferido => Set<CodigoReferido>();
    public DbSet<ReferidoUserSetting> ReferidosUserSetting => Set<ReferidoUserSetting>();
    public DbSet<NewUserReferral> NewUserReferrals => Set<NewUserReferral>();

    // Tutorial interactions (likes & comments)
    public DbSet<TutorialInteraction> TutorialInteractions => Set<TutorialInteraction>();

    // Newsletter system
    public DbSet<NewsletterEmail> NewsletterEmails => Set<NewsletterEmail>();
    public DbSet<NewsletterEmailMedia> NewsletterEmailMedia => Set<NewsletterEmailMedia>();
    public DbSet<NewsletterSendProgress> NewsletterSendProgress => Set<NewsletterSendProgress>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Legacy models
        modelBuilder.Entity<Participant>(entity => {
            entity.HasIndex(e => e.Email);
            entity.HasIndex(e => e.StripeSessionId);
            entity.HasIndex(e => new { e.Email, e.PaymentMethod, e.IsPaid });
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
            entity.HasIndex(e => e.CompeticionId);
            entity.HasOne(s => s.Competicion)
                .WithMany()
                .HasForeignKey(s => s.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SchedulePublishedConfig>(entity => {
            entity.HasIndex(e => e.CompeticionId);
            entity.HasOne(spc => spc.Competicion)
                .WithMany()
                .HasForeignKey(spc => spc.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Draw>(entity => {
            entity.HasOne(d => d.Participant)
                .WithMany()
                .HasForeignKey(d => d.ParticipantId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<RaffleProduct>(entity => {
            entity.HasIndex(e => e.IsActive);
            entity.HasIndex(e => e.DisplayOrder);
        });

        // EmailConfig - per-competition with fallback to global (null)
        modelBuilder.Entity<EmailConfig>(entity => {
            entity.HasIndex(e => e.CompeticionId);
            entity.HasOne(ec => ec.Competicion)
                .WithMany()
                .HasForeignKey(ec => ec.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // StripeConfig - per-competition with fallback to global (null)
        modelBuilder.Entity<StripeConfig>(entity => {
            entity.HasIndex(e => e.CompeticionId);
            entity.HasOne(sc => sc.Competicion)
                .WithMany()
                .HasForeignKey(sc => sc.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LiftEntry>(entity => {
            entity.HasIndex(e => e.AthleteId);
            entity.HasIndex(e => new { e.AthleteId, e.LiftType, e.AttemptNumber }).IsUnique();
            entity.Property(e => e.Weight).HasPrecision(10, 2);
            entity.HasOne(e => e.Athlete)
                .WithMany(a => a.LiftEntries)
                .HasForeignKey(e => e.AthleteId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LiftEntryInscripcion>(entity => {
            entity.HasIndex(e => e.InscripcionId);
            entity.HasIndex(e => new { e.InscripcionId, e.LiftType, e.AttemptNumber }).IsUnique();
            entity.Property(e => e.Weight).HasPrecision(6, 2);
            entity.HasOne(e => e.Inscripcion)
                .WithMany()
                .HasForeignKey(e => e.InscripcionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Multi-tenant models
        modelBuilder.Entity<Competicion>(entity => {
            entity.HasIndex(e => e.Slug).IsUnique();
            entity.HasIndex(e => e.Activo);
            entity.HasIndex(e => e.Tipo);
            entity.Property(e => e.ModulesConfig).HasColumnType("json");
        });

        modelBuilder.Entity<Usuario>(entity => {
            entity.HasIndex(e => e.Email).IsUnique();
            entity.HasIndex(e => e.IsRoot);
            entity.HasIndex(e => e.IsSuperadmin);
        });

        modelBuilder.Entity<UsuarioCompeticion>(entity => {
            entity.HasIndex(e => new { e.UsuarioId, e.CompeticionId }).IsUnique();
            entity.Property(e => e.Role).HasMaxLength(50);
            entity.Property(e => e.InvitedByEmail).HasMaxLength(255);
            entity.HasOne(uc => uc.Usuario)
                .WithMany(u => u.UsuarioCompeticiones)
                .HasForeignKey(uc => uc.UsuarioId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(uc => uc.Competicion)
                .WithMany(c => c.UsuarioCompeticiones)
                .HasForeignKey(uc => uc.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UsuarioPermission>(entity => {
            entity.HasIndex(e => new { e.UsuarioId, e.PermissionKey, e.CompeticionId }).IsUnique();
            entity.HasOne(up => up.Usuario)
                .WithMany(u => u.UsuarioPermissions)
                .HasForeignKey(up => up.UsuarioId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Inscripcion>(entity => {
            entity.HasIndex(e => new { e.CompeticionId, e.Email });
            entity.HasIndex(e => e.Email);
            entity.HasIndex(e => e.PagoConfirmado);
            entity.HasIndex(e => e.Modalidad);
            entity.HasIndex(e => e.StripeSessionId);
            entity.HasIndex(e => e.CuponDescuentoId);
            entity.Property(e => e.Modalidad).HasMaxLength(30);
            entity.HasOne(i => i.Competicion)
                .WithMany(c => c.Inscripciones)
                .HasForeignKey(i => i.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(i => i.CuponDescuento)
                .WithMany()
                .HasForeignKey(i => i.CuponDescuentoId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.Property(e => e.SubtotalAntesDescuento).HasPrecision(10, 2);
            entity.Property(e => e.ImporteDescuento).HasPrecision(10, 2);
            entity.Property(e => e.ValorDescuentoCupon).HasPrecision(10, 2);
        });

        modelBuilder.Entity<CuponDescuento>(entity => {
            entity.HasIndex(e => new { e.CompeticionId, e.CodigoNormalizado }).IsUnique();
            entity.HasIndex(e => e.Activo);
            entity.Property(e => e.Codigo).HasMaxLength(200);
            entity.Property(e => e.CodigoNormalizado).HasMaxLength(200);
            entity.Property(e => e.TipoDescuento).HasMaxLength(20);
            entity.Property(e => e.Valor).HasPrecision(10, 2);
            entity.HasOne(c => c.Competicion)
                .WithMany(c => c.CuponesDescuento)
                .HasForeignKey(c => c.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RifaTicket>(entity => {
            entity.HasIndex(e => new { e.CompeticionId, e.NumeroTicket }).IsUnique();
            entity.HasIndex(e => e.Confirmado);
            entity.HasOne(rt => rt.Competicion)
                .WithMany(c => c.RifaTickets)
                .HasForeignKey(rt => rt.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(rt => rt.Inscripcion)
                .WithMany(i => i.RifaTickets)
                .HasForeignKey(rt => rt.InscripcionId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<RifaConfig>(entity => {
            entity.HasIndex(e => e.CompeticionId).IsUnique();
            entity.HasOne(rc => rc.Competicion)
                .WithOne(c => c.RifaConfig)
                .HasForeignKey<RifaConfig>(rc => rc.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Rename legacy RaffleConfig to avoid conflict with new one
        modelBuilder.Entity<Models.RaffleConfig>().ToTable("raffle_config_legacy");

        // SorteoInscripcion - raffle draws of Inscripcion/Athlete
        modelBuilder.Entity<SorteoInscripcion>(entity => {
            entity.HasIndex(e => new { e.CompeticionId, e.FechaSorteo });
            entity.HasIndex(e => e.InscripcionId);
            entity.HasIndex(e => e.AthleteId);
            entity.HasOne(s => s.Competicion)
                .WithMany()
                .HasForeignKey(s => s.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(s => s.Inscripcion)
                .WithMany()
                .HasForeignKey(s => s.InscripcionId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(s => s.Athlete)
                .WithMany()
                .HasForeignKey(s => s.AthleteId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.Property(e => e.FiltroAplicado).HasColumnType("json");
        });

        // TutorialInteractions
        modelBuilder.Entity<TutorialInteraction>(entity =>
        {
            entity.HasIndex(e => e.VideoId);
            entity.HasIndex(e => new { e.VideoId, e.Tipo });
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP(6)");
        });

        // Newsletter system
        modelBuilder.Entity<NewsletterEmail>(entity =>
        {
            entity.HasIndex(e => e.CompeticionId);
            entity.HasIndex(e => new { e.CompeticionId, e.Status });
            entity.HasOne(e => e.Competicion)
                .WithMany()
                .HasForeignKey(e => e.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<NewsletterEmailMedia>(entity =>
        {
            entity.HasIndex(e => e.NewsletterEmailId);
            entity.HasOne(e => e.NewsletterEmail)
                .WithMany(n => n.Media)
                .HasForeignKey(e => e.NewsletterEmailId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<NewsletterSendProgress>(entity =>
        {
            entity.HasIndex(e => e.NewsletterEmailId).IsUnique();
            entity.HasIndex(e => e.Status);
            entity.HasOne(e => e.NewsletterEmail)
                .WithOne(n => n.SendProgress)
                .HasForeignKey<NewsletterSendProgress>(e => e.NewsletterEmailId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Competicion)
                .WithMany()
                .HasForeignKey(e => e.CompeticionId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
