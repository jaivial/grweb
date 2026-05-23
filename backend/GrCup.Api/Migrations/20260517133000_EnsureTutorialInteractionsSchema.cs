using GrCup.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(GrCupDbContext))]
    [Migration("20260517133000_EnsureTutorialInteractionsSchema")]
    public partial class EnsureTutorialInteractionsSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS `TutorialInteractions` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `VideoId` varchar(50) CHARACTER SET utf8mb4 NOT NULL,
                    `Tipo` varchar(20) CHARACTER SET utf8mb4 NOT NULL,
                    `Contenido` varchar(500) CHARACTER SET utf8mb4 NULL,
                    `Autor` varchar(100) CHARACTER SET utf8mb4 NULL,
                    `SessionId` varchar(100) CHARACTER SET utf8mb4 NULL,
                    `CreatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                    CONSTRAINT `PK_TutorialInteractions` PRIMARY KEY (`Id`),
                    KEY `IX_TutorialInteractions_VideoId` (`VideoId`),
                    KEY `IX_TutorialInteractions_VideoId_Tipo` (`VideoId`, `Tipo`)
                ) CHARACTER SET=utf8mb4;
                """);

            // MySQL has no broadly-compatible CREATE INDEX IF NOT EXISTS syntax.
            // Keep this startup migration free of user variables/procedures so it
            // can run under Pomelo/MySqlConnector defaults. Existing manually-created
            // tables are left untouched; new tables receive the expected indexes above.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally no-op: this migration reconciles environments where the
            // table may already exist manually, so rollback must not drop user data.
        }
    }
}
