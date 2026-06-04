using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class ReferralPolishAndTopeDrop : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Rename legacy "tope" to the new "basica" enum value before dropping the TopeUsosAcumulativo column.
            migrationBuilder.Sql("UPDATE ReferidosConfig SET ModoAcumulativo = 'basica' WHERE ModoAcumulativo = 'tope'");
            migrationBuilder.Sql("UPDATE ReferidosUserSetting SET ModoAcumulativo = 'basica' WHERE ModoAcumulativo = 'tope'");

            migrationBuilder.DropColumn(
                name: "TopeUsosAcumulativo",
                table: "ReferidosUserSetting");

            migrationBuilder.DropColumn(
                name: "TopeUsosAcumulativo",
                table: "ReferidosConfig");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TopeUsosAcumulativo",
                table: "ReferidosUserSetting",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TopeUsosAcumulativo",
                table: "ReferidosConfig",
                type: "int",
                nullable: true);
        }
    }
}
