using GrCup.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(GrCupDbContext))]
    [Migration("20260524120000_AddInscripcionModalidad")]
    public partial class AddInscripcionModalidad : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Modalidad",
                table: "Inscripciones",
                type: "varchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "completa");

            migrationBuilder.CreateIndex(
                name: "IX_Inscripciones_Modalidad",
                table: "Inscripciones",
                column: "Modalidad");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Inscripciones_Modalidad",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "Modalidad",
                table: "Inscripciones");
        }
    }
}
