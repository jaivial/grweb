using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveUniqueEmailAddCompositeIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop unique email index if it exists (MySQL safe approach)
            migrationBuilder.Sql(@"DROP PROCEDURE IF EXISTS drop_email_idx;
                CREATE PROCEDURE drop_email_idx()
                BEGIN
                    IF EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'Participants' AND index_name = 'IX_Participants_Email') THEN
                        ALTER TABLE `Participants` DROP INDEX `IX_Participants_Email`;
                    END IF;
                END;
                CALL drop_email_idx();
                DROP PROCEDURE drop_email_idx;");

            migrationBuilder.AlterColumn<string>(
                name: "PaymentMethod",
                table: "Participants",
                type: "varchar(255)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "longtext",
                oldNullable: true)
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            // Create StripeConfig table only if it doesn't exist
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `StripeConfig` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `SecretKey` varchar(255) CHARACTER SET utf8mb4 NULL,
                    `PublishableKey` varchar(255) CHARACTER SET utf8mb4 NULL,
                    `WebhookSecret` varchar(255) CHARACTER SET utf8mb4 NULL,
                    `CreatedAt` datetime(6) NOT NULL,
                    `UpdatedAt` datetime(6) NOT NULL,
                    CONSTRAINT `PK_StripeConfig` PRIMARY KEY (`Id`)
                ) CHARACTER SET utf8mb4;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Participants_Email",
                table: "Participants",
                column: "Email");

            migrationBuilder.CreateIndex(
                name: "IX_Participants_Email_PaymentMethod_IsPaid",
                table: "Participants",
                columns: new[] { "Email", "PaymentMethod", "IsPaid" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StripeConfig");

            migrationBuilder.DropIndex(
                name: "IX_Participants_Email",
                table: "Participants");

            migrationBuilder.DropIndex(
                name: "IX_Participants_Email_PaymentMethod_IsPaid",
                table: "Participants");

            migrationBuilder.AlterColumn<string>(
                name: "PaymentMethod",
                table: "Participants",
                type: "longtext",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "varchar(255)",
                oldNullable: true)
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_Participants_Email",
                table: "Participants",
                column: "Email",
                unique: true);
        }
    }
}
