using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCompeticionIdToEmailAndStripeConfig : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CompeticionId",
                table: "StripeConfig",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CompeticionId",
                table: "EmailConfig",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_StripeConfig_CompeticionId",
                table: "StripeConfig",
                column: "CompeticionId");

            migrationBuilder.CreateIndex(
                name: "IX_EmailConfig_CompeticionId",
                table: "EmailConfig",
                column: "CompeticionId");

            migrationBuilder.AddForeignKey(
                name: "FK_EmailConfig_Competiciones_CompeticionId",
                table: "EmailConfig",
                column: "CompeticionId",
                principalTable: "Competiciones",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_StripeConfig_Competiciones_CompeticionId",
                table: "StripeConfig",
                column: "CompeticionId",
                principalTable: "Competiciones",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EmailConfig_Competiciones_CompeticionId",
                table: "EmailConfig");

            migrationBuilder.DropForeignKey(
                name: "FK_StripeConfig_Competiciones_CompeticionId",
                table: "StripeConfig");

            migrationBuilder.DropIndex(
                name: "IX_StripeConfig_CompeticionId",
                table: "StripeConfig");

            migrationBuilder.DropIndex(
                name: "IX_EmailConfig_CompeticionId",
                table: "EmailConfig");

            migrationBuilder.DropColumn(
                name: "CompeticionId",
                table: "StripeConfig");

            migrationBuilder.DropColumn(
                name: "CompeticionId",
                table: "EmailConfig");
        }
    }
}
