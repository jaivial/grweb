using System.ComponentModel.DataAnnotations;

namespace GrCup.Api.Models;

/// <summary>
/// User account in the system (multi-tenant aware)
/// </summary>
public class Usuario
{
    public int Id { get; set; }
    
    [Required]
    [MaxLength(255)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(255)]
    public string PasswordHash { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(255)]
    public string Nombre { get; set; } = string.Empty;
    
    /// <summary>
    /// Root has access to every competition and all sections.
    /// IsSuperadmin is kept for existing accounts and claims.
    /// </summary>
    public bool IsRoot { get; set; } = false;

    public bool IsSuperadmin { get; set; } = false;
    
    /// <summary>
    /// Whether the account is active
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Last login timestamp
    /// </summary>
    public DateTime? LastLoginAt { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public virtual ICollection<UsuarioCompeticion> UsuarioCompeticiones { get; set; } = new List<UsuarioCompeticion>();
    public virtual ICollection<UsuarioPermission> UsuarioPermissions { get; set; } = new List<UsuarioPermission>();
}

/// <summary>
/// Many-to-many relationship between users and competitions.
/// Supported roles: root, admin, staff, registrador.
/// Legacy roles are normalized by UserRoleNames.
/// </summary>
public class UsuarioCompeticion
{
    public int Id { get; set; }
    
    public int UsuarioId { get; set; }
    public int CompeticionId { get; set; }
    
    /// <summary>
    /// Role in this competition: 'root', 'admin', 'staff', 'registrador'.
    /// Legacy values are normalized when read or updated.
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Role { get; set; } = "staff";

    [MaxLength(255)]
    public string? InvitedByEmail { get; set; }

    public DateTime? InvitedAt { get; set; }

    public bool InvitationAccepted { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public virtual Usuario Usuario { get; set; } = null!;
    public virtual Competicion Competicion { get; set; } = null!;
}

/// <summary>
/// Granular permission for a user
/// </summary>
public class UsuarioPermission
{
    public int Id { get; set; }
    
    public int UsuarioId { get; set; }
    
    /// <summary>
    /// Permission key like 'comp:5:export_data' or 'system:manage_users'
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string PermissionKey { get; set; } = string.Empty;
    
    /// <summary>
    /// Whether this permission is granted (true) or denied (false)
    /// </summary>
    public bool Granted { get; set; } = true;
    
    /// <summary>
    /// Competition ID if this is a competition-specific permission, null for global
    /// </summary>
    public int? CompeticionId { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public virtual Usuario Usuario { get; set; } = null!;
}
