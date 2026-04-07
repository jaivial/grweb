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
                SET @dbname = DATABASE();

                SET @col_phone = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Participants' AND COLUMN_NAME = 'Phone');
                SET @sql_phone = IF(@col_phone = 0,
                    'ALTER TABLE `Participants` ADD COLUMN `Phone` varchar(20) CHARACTER SET utf8mb4 NULL',
                    'SELECT 1');
                PREPARE stmt FROM @sql_phone;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;

                SET @col_price = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Participants' AND COLUMN_NAME = 'Price');
                SET @sql_price = IF(@col_price = 0,
                    'ALTER TABLE `Participants` ADD COLUMN `Price` decimal(10,2) NULL',
                    'SELECT 1');
                PREPARE stmt FROM @sql_price;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;

                SET @col_ispaid = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Participants' AND COLUMN_NAME = 'IsPaid');
                SET @sql_ispaid = IF(@col_ispaid = 0,
                    'ALTER TABLE `Participants` ADD COLUMN `IsPaid` tinyint(1) NOT NULL DEFAULT TRUE',
                    'SELECT 1');
                PREPARE stmt FROM @sql_ispaid;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;

                SET @col_payment = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Participants' AND COLUMN_NAME = 'PaymentMethod');
                SET @sql_payment = IF(@col_payment = 0,
                    'ALTER TABLE `Participants` ADD COLUMN `PaymentMethod` varchar(20) CHARACTER SET utf8mb4 NULL',
                    'SELECT 1');
                PREPARE stmt FROM @sql_payment;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;

                SET @col_modified = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Participants' AND COLUMN_NAME = 'DateModified');
                SET @sql_modified = IF(@col_modified = 0,
                    'ALTER TABLE `Participants` ADD COLUMN `DateModified` datetime(6) NULL',
                    'SELECT 1');
                PREPARE stmt FROM @sql_modified;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
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
