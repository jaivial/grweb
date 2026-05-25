using GrCup.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(GrCupDbContext))]
    [Migration("20260524133000_AddInscriptionStripePaymentFlow")]
    public partial class AddInscriptionStripePaymentFlow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Activo",
                table: "StripeConfig",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.Sql("UPDATE StripeConfig SET Activo = TRUE WHERE SecretKey IS NOT NULL AND SecretKey <> '' AND PublishableKey IS NOT NULL AND PublishableKey <> ''");

            migrationBuilder.AddColumn<string>(
                name: "StripeSessionId",
                table: "Inscripciones",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Inscripciones_StripeSessionId",
                table: "Inscripciones",
                column: "StripeSessionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Inscripciones_StripeSessionId",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "StripeSessionId",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "Activo",
                table: "StripeConfig");
        }
    }
}
