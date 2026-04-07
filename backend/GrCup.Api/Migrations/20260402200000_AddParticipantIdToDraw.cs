using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    public partial class AddParticipantIdToDraw : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                SET @dbname = DATABASE();

                SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Draws' AND COLUMN_NAME = 'ParticipantId');
                SET @sql_col = IF(@col_exists = 0,
                    'ALTER TABLE `Draws` ADD COLUMN `ParticipantId` int NULL',
                    'SELECT 1');
                PREPARE stmt FROM @sql_col;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;

                SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Draws' AND INDEX_NAME = 'IX_Draws_ParticipantId');
                SET @sql_idx = IF(@idx_exists = 0,
                    'CREATE INDEX `IX_Draws_ParticipantId` ON `Draws` (`ParticipantId`)',
                    'SELECT 1');
                PREPARE stmt FROM @sql_idx;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;

                SET @fk_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                    WHERE TABLE_SCHEMA = @dbname AND CONSTRAINT_NAME = 'FK_Draws_Participants_ParticipantId');
                SET @sql_fk = IF(@fk_exists = 0,
                    'ALTER TABLE `Draws` ADD CONSTRAINT `FK_Draws_Participants_ParticipantId` FOREIGN KEY (`ParticipantId`) REFERENCES `Participants`(`Id`) ON DELETE SET NULL',
                    'SELECT 1');
                PREPARE stmt FROM @sql_fk;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Draws_Participants_ParticipantId",
                table: "Draws");

            migrationBuilder.DropIndex(
                name: "IX_Draws_ParticipantId",
                table: "Draws");

            migrationBuilder.DropColumn(
                name: "ParticipantId",
                table: "Draws");
        }
    }
}
