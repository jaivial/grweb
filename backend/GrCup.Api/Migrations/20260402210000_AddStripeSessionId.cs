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
                SET @dbname = DATABASE();

                SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Participants' AND COLUMN_NAME = 'StripeSessionId');
                SET @sql_col = IF(@col_exists = 0,
                    'ALTER TABLE `Participants` ADD COLUMN `StripeSessionId` varchar(255) CHARACTER SET utf8mb4 NULL',
                    'SELECT 1');
                PREPARE stmt FROM @sql_col;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;

                SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Participants' AND INDEX_NAME = 'IX_Participants_StripeSessionId');
                SET @sql_idx = IF(@idx_exists = 0,
                    'CREATE INDEX `IX_Participants_StripeSessionId` ON `Participants` (`StripeSessionId`)',
                    'SELECT 1');
                PREPARE stmt FROM @sql_idx;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
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
