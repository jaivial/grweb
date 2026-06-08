using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInscripcionQrImageUrl : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "QrImageUrl",
                table: "Inscripciones",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.Sql(@"
                UPDATE `Inscripciones`
                SET `QrImageUrl` = `QrCode`
                WHERE `QrImageUrl` IS NULL
                  AND (`QrCode` LIKE 'http://%' OR `QrCode` LIKE 'https://%');
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "QrImageUrl",
                table: "Inscripciones");
        }
    }
}
