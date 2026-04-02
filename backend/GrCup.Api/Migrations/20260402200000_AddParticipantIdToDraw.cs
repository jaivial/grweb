using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    public partial class AddParticipantIdToDraw : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE `Draws`
                    ADD COLUMN IF NOT EXISTS `ParticipantId` int NULL;

                CREATE INDEX IF NOT EXISTS `IX_Draws_ParticipantId` ON `Draws` (`ParticipantId`);

                SET @fk_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                    WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'FK_Draws_Participants_ParticipantId');

                SET @sql = IF(@fk_exists = 0,
                    'ALTER TABLE `Draws` ADD CONSTRAINT `FK_Draws_Participants_ParticipantId` FOREIGN KEY (`ParticipantId`) REFERENCES `Participants`(`Id`) ON DELETE SET NULL',
                    'SELECT 1');
                PREPARE stmt FROM @sql;
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
