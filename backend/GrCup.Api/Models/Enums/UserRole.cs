namespace GrCup.Api.Models.Enums;

public enum UserRole
{
    Root = 0,
    Admin = 1,
    Staff = 2,
    Registrador = 3
}

public static class UserRoleNames
{
    public const string Root = "root";
    public const string Admin = "admin";
    public const string Staff = "staff";
    public const string Registrador = "registrador";

    public static readonly string[] ValidRoles =
    {
        Root,
        Admin,
        Staff,
        Registrador
    };

    public static string Normalize(string role)
    {
        return role.Trim().ToLowerInvariant() switch
        {
            "root" => Root,
            "admin" => Admin,
            "manager" => Staff,
            "empleado" => Staff,
            "staff" => Staff,
            "operator" => Staff,
            "checkin" => Registrador,
            "registrador" => Registrador,
            _ => string.Empty
        };
    }

    public static bool IsValid(string role)
    {
        return !string.IsNullOrWhiteSpace(Normalize(role));
    }
}
