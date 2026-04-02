using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddResponsableAndUrlInscripcionTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `ResponsableInscripcion` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `DateModified` datetime(6) NOT NULL,
                    `Value` tinyint(1) NOT NULL DEFAULT TRUE,
                    CONSTRAINT `PK_ResponsableInscripcion` PRIMARY KEY (`Id`)
                ) CHARACTER SET=utf8mb4;

                CREATE TABLE IF NOT EXISTS `UrlInscripcion` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `DateModified` datetime(6) NOT NULL,
                    `Url` varchar(2000) CHARACTER SET utf8mb4 NULL,
                    CONSTRAINT `PK_UrlInscripcion` PRIMARY KEY (`Id`)
                ) CHARACTER SET=utf8mb4;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ResponsableInscripcion");

            migrationBuilder.DropTable(
                name: "UrlInscripcion");
        }
    }
}
