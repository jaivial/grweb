using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddJudgeVotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Juez1Voto",
                table: "LiftEntriesInscripcion",
                type: "tinyint(1)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Juez2Voto",
                table: "LiftEntriesInscripcion",
                type: "tinyint(1)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Juez3Voto",
                table: "LiftEntriesInscripcion",
                type: "tinyint(1)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Juez1Voto",
                table: "LiftEntriesInscripcion");

            migrationBuilder.DropColumn(
                name: "Juez2Voto",
                table: "LiftEntriesInscripcion");

            migrationBuilder.DropColumn(
                name: "Juez3Voto",
                table: "LiftEntriesInscripcion");
        }
    }
}
