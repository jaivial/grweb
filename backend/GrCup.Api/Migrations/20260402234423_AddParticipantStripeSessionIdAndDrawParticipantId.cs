using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    public partial class AddParticipantStripeSessionIdAndDrawParticipantId : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "ALTER TABLE `Participants` ADD COLUMN IF NOT EXISTS `StripeSessionId` varchar(255) NULL;");

            migrationBuilder.Sql(
                "ALTER TABLE `Draws` ADD COLUMN IF NOT EXISTS `ParticipantId` int NULL;");

            migrationBuilder.Sql(
                "ALTER TABLE `Draws` ADD INDEX IF NOT EXISTS `IX_Draws_ParticipantId` (`ParticipantId`);");

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

            migrationBuilder.Sql(
                "ALTER TABLE `Draws` DROP INDEX IF EXISTS `IX_Draws_ParticipantId`;");

            migrationBuilder.Sql(
                "ALTER TABLE `Draws` DROP COLUMN IF EXISTS `ParticipantId`;");

            migrationBuilder.Sql(
                "ALTER TABLE `Participants` DROP COLUMN IF EXISTS `StripeSessionId`;");
        }
    }
}
