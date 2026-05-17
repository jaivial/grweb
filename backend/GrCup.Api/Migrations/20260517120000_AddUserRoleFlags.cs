using System;
using GrCup.Api.Data;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    [Microsoft.EntityFrameworkCore.Infrastructure.DbContext(typeof(GrCupDbContext))]
    [Migration("20260517120000_AddUserRoleFlags")]
    public partial class AddUserRoleFlags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsRoot",
                table: "Usuarios",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<string>(
                name: "Role",
                table: "UsuariosCompeticiones",
                type: "varchar(50)",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "longtext")
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "InvitedByEmail",
                table: "UsuariosCompeticiones",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "InvitedAt",
                table: "UsuariosCompeticiones",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "InvitationAccepted",
                table: "UsuariosCompeticiones",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Usuarios_IsRoot",
                table: "Usuarios",
                column: "IsRoot");

            migrationBuilder.Sql("UPDATE Usuarios SET IsRoot = IsSuperadmin WHERE IsSuperadmin = 1;");
            migrationBuilder.Sql("UPDATE UsuariosCompeticiones SET Role = 'staff' WHERE Role IN ('manager', 'empleado', 'operator');");
            migrationBuilder.Sql("UPDATE UsuariosCompeticiones SET Role = 'registrador' WHERE Role = 'checkin';");
            migrationBuilder.Sql("UPDATE UsuariosCompeticiones SET Role = LOWER(Role);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Usuarios_IsRoot",
                table: "Usuarios");

            migrationBuilder.DropColumn(
                name: "IsRoot",
                table: "Usuarios");

            migrationBuilder.DropColumn(
                name: "InvitedByEmail",
                table: "UsuariosCompeticiones");

            migrationBuilder.DropColumn(
                name: "InvitedAt",
                table: "UsuariosCompeticiones");

            migrationBuilder.DropColumn(
                name: "InvitationAccepted",
                table: "UsuariosCompeticiones");

            migrationBuilder.Sql("UPDATE UsuariosCompeticiones SET Role = 'empleado' WHERE Role = 'staff';");
            migrationBuilder.Sql("UPDATE UsuariosCompeticiones SET Role = 'checkin' WHERE Role = 'registrador';");

            migrationBuilder.AlterColumn<string>(
                name: "Role",
                table: "UsuariosCompeticiones",
                type: "longtext",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(50)",
                oldMaxLength: 50)
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");
        }
    }
}
