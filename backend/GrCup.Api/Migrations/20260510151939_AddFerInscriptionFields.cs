using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFerInscriptionFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CategoriaPeso",
                table: "Inscripciones",
                type: "varchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<bool>(
                name: "ParticipacionConfirmada",
                table: "Inscripciones",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "QuiereHandler",
                table: "Inscripciones",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Sexo",
                table: "Inscripciones",
                type: "varchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "Telefono",
                table: "Inscripciones",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CategoriaPeso",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "ParticipacionConfirmada",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "QuiereHandler",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "Sexo",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "Telefono",
                table: "Inscripciones");
        }
    }
}
