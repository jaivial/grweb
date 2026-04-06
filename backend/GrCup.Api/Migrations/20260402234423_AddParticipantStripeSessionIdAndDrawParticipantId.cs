using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    public partial class AddParticipantStripeSessionIdAndDrawParticipantId : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                SELECT COUNT(*) INTO @col_exists
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'Participants'
                  AND COLUMN_NAME = 'StripeSessionId';

                SET @sql = IF(@col_exists = 0,
                    'ALTER TABLE `Participants` ADD COLUMN `StripeSessionId` varchar(255) NULL',
                    'SELECT 1'
                );

                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");

            migrationBuilder.Sql(@"
                SELECT COUNT(*) INTO @col_exists
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'Draws'
                  AND COLUMN_NAME = 'ParticipantId';

                SET @sql = IF(@col_exists = 0,
                    'ALTER TABLE `Draws` ADD COLUMN `ParticipantId` int NULL',
                    'SELECT 1'
                );

                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");

            migrationBuilder.Sql(@"
                SELECT COUNT(*) INTO @idx_exists
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'Draws'
                  AND INDEX_NAME = 'IX_Draws_ParticipantId';

                SET @sql = IF(@idx_exists = 0,
                    'ALTER TABLE `Draws` ADD INDEX `IX_Draws_ParticipantId` (`ParticipantId`)',
                    'SELECT 1'
                );

                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");

            migrationBuilder.Sql(@"
                SELECT COUNT(*) INTO @fk_exists
                FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'Draws'
                  AND CONSTRAINT_NAME = 'FK_Draws_Participants_ParticipantId';

                SET @sql = IF(@fk_exists = 0,
                    'ALTER TABLE `Draws` ADD CONSTRAINT `FK_Draws_Participants_ParticipantId` FOREIGN KEY (`ParticipantId`) REFERENCES `Participants` (`Id`)',
                    'SELECT 1'
                );

                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                SELECT COUNT(*) INTO @fk_exists
                FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'Draws'
                  AND CONSTRAINT_NAME = 'FK_Draws_Participants_ParticipantId';

                SET @sql = IF(@fk_exists > 0,
                    'ALTER TABLE `Draws` DROP FOREIGN KEY `FK_Draws_Participants_ParticipantId`',
                    'SELECT 1'
                );

                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");

            migrationBuilder.Sql(@"
                SELECT COUNT(*) INTO @idx_exists
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'Draws'
                  AND INDEX_NAME = 'IX_Draws_ParticipantId';

                SET @sql = IF(@idx_exists > 0,
                    'ALTER TABLE `Draws` DROP INDEX `IX_Draws_ParticipantId`',
                    'SELECT 1'
                );

                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");

            migrationBuilder.Sql(@"
                SELECT COUNT(*) INTO @col_exists
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'Draws'
                  AND COLUMN_NAME = 'ParticipantId';

                SET @sql = IF(@col_exists > 0,
                    'ALTER TABLE `Draws` DROP COLUMN `ParticipantId`',
                    'SELECT 1'
                );

                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");

            migrationBuilder.Sql(@"
                SELECT COUNT(*) INTO @col_exists
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'Participants'
                  AND COLUMN_NAME = 'StripeSessionId';

                SET @sql = IF(@col_exists > 0,
                    'ALTER TABLE `Participants` DROP COLUMN `StripeSessionId`',
                    'SELECT 1'
                );

                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");
        }
    }
}
