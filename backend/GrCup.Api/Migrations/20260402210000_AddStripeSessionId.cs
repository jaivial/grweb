using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStripeSessionId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE `Participants`
                    ADD COLUMN IF NOT EXISTS `StripeSessionId` varchar(255) CHARACTER SET utf8mb4 NULL;

                CREATE INDEX IF NOT EXISTS `IX_Participants_StripeSessionId` ON `Participants` (`StripeSessionId`);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Participants_StripeSessionId",
                table: "Participants");

            migrationBuilder.DropColumn(
                name: "StripeSessionId",
                table: "Participants");
        }
    }
}
