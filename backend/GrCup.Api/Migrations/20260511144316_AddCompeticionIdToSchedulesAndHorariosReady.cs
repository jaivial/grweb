using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCompeticionIdToSchedulesAndHorariosReady : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CompeticionId",
                table: "Schedules",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CompeticionId",
                table: "SchedulePublishedConfig",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HorariosReady",
                table: "Competiciones",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Schedules_CompeticionId",
                table: "Schedules",
                column: "CompeticionId");

            migrationBuilder.CreateIndex(
                name: "IX_SchedulePublishedConfig_CompeticionId",
                table: "SchedulePublishedConfig",
                column: "CompeticionId");

            migrationBuilder.AddForeignKey(
                name: "FK_SchedulePublishedConfig_Competiciones_CompeticionId",
                table: "SchedulePublishedConfig",
                column: "CompeticionId",
                principalTable: "Competiciones",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Schedules_Competiciones_CompeticionId",
                table: "Schedules",
                column: "CompeticionId",
                principalTable: "Competiciones",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SchedulePublishedConfig_Competiciones_CompeticionId",
                table: "SchedulePublishedConfig");

            migrationBuilder.DropForeignKey(
                name: "FK_Schedules_Competiciones_CompeticionId",
                table: "Schedules");

            migrationBuilder.DropIndex(
                name: "IX_Schedules_CompeticionId",
                table: "Schedules");

            migrationBuilder.DropIndex(
                name: "IX_SchedulePublishedConfig_CompeticionId",
                table: "SchedulePublishedConfig");

            migrationBuilder.DropColumn(
                name: "CompeticionId",
                table: "Schedules");

            migrationBuilder.DropColumn(
                name: "CompeticionId",
                table: "SchedulePublishedConfig");

            migrationBuilder.DropColumn(
                name: "HorariosReady",
                table: "Competiciones");
        }
    }
}
