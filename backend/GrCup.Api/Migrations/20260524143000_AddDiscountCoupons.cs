using GrCup.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    [DbContext(typeof(GrCupDbContext))]
    [Migration("20260524143000_AddDiscountCoupons")]
    public partial class AddDiscountCoupons : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CuponesDescuento",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    CompeticionId = table.Column<int>(type: "int", nullable: false),
                    Codigo = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CodigoNormalizado = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    TipoDescuento = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Valor = table.Column<decimal>(type: "decimal(10,2)", nullable: false),
                    Activo = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    TieneLimiteUsos = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    LimiteUsos = table.Column<int>(type: "int", nullable: true),
                    TieneFechaExpiracion = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    FechaExpiracion = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CuponesDescuento", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CuponesDescuento_Competiciones_CompeticionId",
                        column: x => x.CompeticionId,
                        principalTable: "Competiciones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "CuponDescuentoId",
                table: "Inscripciones",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CodigoCupon",
                table: "Inscripciones",
                type: "varchar(200)",
                maxLength: 200,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "TipoDescuentoCupon",
                table: "Inscripciones",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<decimal>(
                name: "ValorDescuentoCupon",
                table: "Inscripciones",
                type: "decimal(10,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SubtotalAntesDescuento",
                table: "Inscripciones",
                type: "decimal(10,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ImporteDescuento",
                table: "Inscripciones",
                type: "decimal(10,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.Sql("UPDATE Inscripciones SET SubtotalAntesDescuento = TotalPagado WHERE SubtotalAntesDescuento = 0");

            migrationBuilder.CreateIndex(
                name: "IX_CuponesDescuento_Activo",
                table: "CuponesDescuento",
                column: "Activo");

            migrationBuilder.CreateIndex(
                name: "IX_CuponesDescuento_CompeticionId_CodigoNormalizado",
                table: "CuponesDescuento",
                columns: new[] { "CompeticionId", "CodigoNormalizado" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Inscripciones_CuponDescuentoId",
                table: "Inscripciones",
                column: "CuponDescuentoId");

            migrationBuilder.AddForeignKey(
                name: "FK_Inscripciones_CuponesDescuento_CuponDescuentoId",
                table: "Inscripciones",
                column: "CuponDescuentoId",
                principalTable: "CuponesDescuento",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Inscripciones_CuponesDescuento_CuponDescuentoId",
                table: "Inscripciones");

            migrationBuilder.DropTable(name: "CuponesDescuento");

            migrationBuilder.DropIndex(
                name: "IX_Inscripciones_CuponDescuentoId",
                table: "Inscripciones");

            migrationBuilder.DropColumn(name: "CuponDescuentoId", table: "Inscripciones");
            migrationBuilder.DropColumn(name: "CodigoCupon", table: "Inscripciones");
            migrationBuilder.DropColumn(name: "TipoDescuentoCupon", table: "Inscripciones");
            migrationBuilder.DropColumn(name: "ValorDescuentoCupon", table: "Inscripciones");
            migrationBuilder.DropColumn(name: "SubtotalAntesDescuento", table: "Inscripciones");
            migrationBuilder.DropColumn(name: "ImporteDescuento", table: "Inscripciones");
        }
    }
}
