using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEmailTrackingToInscripciones : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Columns already exist in database - no action needed
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EmailEnviadoAt",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "EmailEnviadoError",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "EmailEnviadoStatus",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "QrImageUrl",
                table: "Inscripciones");
        }
    }
}
