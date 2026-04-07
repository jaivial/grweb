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
                SET @dbname = DATABASE();

                SET @table_resp = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'ResponsableInscripcion');
                SET @sql_resp = IF(@table_resp = 0,
                    'CREATE TABLE `ResponsableInscripcion` (
                        `Id` int NOT NULL AUTO_INCREMENT,
                        `DateModified` datetime(6) NOT NULL,
                        `Value` tinyint(1) NOT NULL DEFAULT TRUE,
                        CONSTRAINT `PK_ResponsableInscripcion` PRIMARY KEY (`Id`)
                    ) CHARACTER SET=utf8mb4',
                    'SELECT 1');
                PREPARE stmt FROM @sql_resp;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;

                SET @table_url = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'UrlInscripcion');
                SET @sql_url = IF(@table_url = 0,
                    'CREATE TABLE `UrlInscripcion` (
                        `Id` int NOT NULL AUTO_INCREMENT,
                        `DateModified` datetime(6) NOT NULL,
                        `Url` varchar(2000) CHARACTER SET utf8mb4 NULL,
                        CONSTRAINT `PK_UrlInscripcion` PRIMARY KEY (`Id`)
                    ) CHARACTER SET=utf8mb4',
                    'SELECT 1');
                PREPARE stmt FROM @sql_url;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
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
