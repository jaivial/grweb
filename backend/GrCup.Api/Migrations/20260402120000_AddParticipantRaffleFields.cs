using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddParticipantRaffleFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE `Participants`
                    ADD COLUMN IF NOT EXISTS `Phone` varchar(20) CHARACTER SET utf8mb4 NULL,
                    ADD COLUMN IF NOT EXISTS `Price` decimal(10,2) NULL,
                    ADD COLUMN IF NOT EXISTS `IsPaid` tinyint(1) NOT NULL DEFAULT TRUE,
                    ADD COLUMN IF NOT EXISTS `PaymentMethod` varchar(20) CHARACTER SET utf8mb4 NULL,
                    ADD COLUMN IF NOT EXISTS `DateModified` datetime(6) NULL;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Phone",
                table: "Participants");

            migrationBuilder.DropColumn(
                name: "Price",
                table: "Participants");

            migrationBuilder.DropColumn(
                name: "IsPaid",
                table: "Participants");

            migrationBuilder.DropColumn(
                name: "PaymentMethod",
                table: "Participants");

            migrationBuilder.DropColumn(
                name: "DateModified",
                table: "Participants");
        }
    }
}
