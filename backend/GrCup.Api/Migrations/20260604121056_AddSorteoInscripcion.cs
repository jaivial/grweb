using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrCup.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSorteoInscripcion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Activo",
                table: "Schedules");

            migrationBuilder.AddColumn<bool>(
                name: "Activo",
                table: "StripeConfig",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Apellido1",
                table: "Inscripciones",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "CodigoCupon",
                table: "Inscripciones",
                type: "varchar(200)",
                maxLength: 200,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "CuponDescuentoId",
                table: "Inscripciones",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ImporteDescuento",
                table: "Inscripciones",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "ReferralCodeId",
                table: "Inscripciones",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripePaymentIntentId",
                table: "Inscripciones",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<decimal>(
                name: "SubtotalAntesDescuento",
                table: "Inscripciones",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

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
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "ReferidosActivo",
                table: "Competiciones",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "CodigosReferido",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    InscripcionId = table.Column<int>(type: "int", nullable: false),
                    CompeticionId = table.Column<int>(type: "int", nullable: false),
                    Codigo = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CodigoNormalizado = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CodigosReferido", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CodigosReferido_Competiciones_CompeticionId",
                        column: x => x.CompeticionId,
                        principalTable: "Competiciones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CodigosReferido_Inscripciones_InscripcionId",
                        column: x => x.InscripcionId,
                        principalTable: "Inscripciones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

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
                    Valor = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
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

            migrationBuilder.CreateTable(
                name: "ReferidosConfig",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    CompeticionId = table.Column<int>(type: "int", nullable: false),
                    Activo = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    Modo = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    TipoDescuentoReferente = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ValorDescuentoReferente = table.Column<decimal>(type: "decimal(10,2)", nullable: false),
                    TieneLimiteUsos = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    LimiteUsos = table.Column<int>(type: "int", nullable: true),
                    ModoAcumulativo = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    MultiplicadorAcumulativo = table.Column<decimal>(type: "decimal(10,2)", nullable: true),
                    TipoDescuentoNuevoUsuario = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ValorDescuentoNuevoUsuario = table.Column<decimal>(type: "decimal(10,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReferidosConfig", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReferidosConfig_Competiciones_CompeticionId",
                        column: x => x.CompeticionId,
                        principalTable: "Competiciones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "SorteosInscripcion",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    CompeticionId = table.Column<int>(type: "int", nullable: false),
                    InscripcionId = table.Column<int>(type: "int", nullable: true),
                    AthleteId = table.Column<int>(type: "int", nullable: true),
                    FechaSorteo = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    NumeroGanador = table.Column<int>(type: "int", nullable: false),
                    FiltroAplicado = table.Column<string>(type: "json", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SorteosInscripcion", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SorteosInscripcion_Athletes_AthleteId",
                        column: x => x.AthleteId,
                        principalTable: "Athletes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_SorteosInscripcion_Competiciones_CompeticionId",
                        column: x => x.CompeticionId,
                        principalTable: "Competiciones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SorteosInscripcion_Inscripciones_InscripcionId",
                        column: x => x.InscripcionId,
                        principalTable: "Inscripciones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "NewUserReferrals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    CodigoReferidoId = table.Column<int>(type: "int", nullable: false),
                    InscripcionId = table.Column<int>(type: "int", nullable: false),
                    TipoDescuento = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ImporteDescuento = table.Column<decimal>(type: "decimal(10,2)", nullable: false),
                    VecesUsado = table.Column<int>(type: "int", nullable: false),
                    ImporteAcumuladoReferente = table.Column<decimal>(type: "decimal(10,2)", nullable: false),
                    StripeRefundId = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    RefundedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NewUserReferrals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NewUserReferrals_CodigosReferido_CodigoReferidoId",
                        column: x => x.CodigoReferidoId,
                        principalTable: "CodigosReferido",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_NewUserReferrals_Inscripciones_InscripcionId",
                        column: x => x.InscripcionId,
                        principalTable: "Inscripciones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "ReferidosUserSetting",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    CodigoReferidoId = table.Column<int>(type: "int", nullable: false),
                    Activo = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    Modo = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    TipoDescuentoReferente = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ValorDescuentoReferente = table.Column<decimal>(type: "decimal(10,2)", nullable: false),
                    TieneLimiteUsos = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    LimiteUsos = table.Column<int>(type: "int", nullable: true),
                    ModoAcumulativo = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    MultiplicadorAcumulativo = table.Column<decimal>(type: "decimal(10,2)", nullable: true),
                    TipoDescuentoNuevoUsuario = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ValorDescuentoNuevoUsuario = table.Column<decimal>(type: "decimal(10,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReferidosUserSetting", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReferidosUserSetting_CodigosReferido_CodigoReferidoId",
                        column: x => x.CodigoReferidoId,
                        principalTable: "CodigosReferido",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_Inscripciones_CuponDescuentoId",
                table: "Inscripciones",
                column: "CuponDescuentoId");

            migrationBuilder.CreateIndex(
                name: "IX_CodigosReferido_CompeticionId",
                table: "CodigosReferido",
                column: "CompeticionId");

            migrationBuilder.CreateIndex(
                name: "IX_CodigosReferido_InscripcionId",
                table: "CodigosReferido",
                column: "InscripcionId");

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
                name: "IX_NewUserReferrals_CodigoReferidoId",
                table: "NewUserReferrals",
                column: "CodigoReferidoId");

            migrationBuilder.CreateIndex(
                name: "IX_NewUserReferrals_InscripcionId",
                table: "NewUserReferrals",
                column: "InscripcionId");

            migrationBuilder.CreateIndex(
                name: "IX_ReferidosConfig_CompeticionId",
                table: "ReferidosConfig",
                column: "CompeticionId");

            migrationBuilder.CreateIndex(
                name: "IX_ReferidosUserSetting_CodigoReferidoId",
                table: "ReferidosUserSetting",
                column: "CodigoReferidoId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SorteosInscripcion_AthleteId",
                table: "SorteosInscripcion",
                column: "AthleteId");

            migrationBuilder.CreateIndex(
                name: "IX_SorteosInscripcion_CompeticionId_FechaSorteo",
                table: "SorteosInscripcion",
                columns: new[] { "CompeticionId", "FechaSorteo" });

            migrationBuilder.CreateIndex(
                name: "IX_SorteosInscripcion_InscripcionId",
                table: "SorteosInscripcion",
                column: "InscripcionId");

            migrationBuilder.AddForeignKey(
                name: "FK_Inscripciones_CuponesDescuento_CuponDescuentoId",
                table: "Inscripciones",
                column: "CuponDescuentoId",
                principalTable: "CuponesDescuento",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Inscripciones_CuponesDescuento_CuponDescuentoId",
                table: "Inscripciones");

            migrationBuilder.DropTable(
                name: "CuponesDescuento");

            migrationBuilder.DropTable(
                name: "NewUserReferrals");

            migrationBuilder.DropTable(
                name: "ReferidosConfig");

            migrationBuilder.DropTable(
                name: "ReferidosUserSetting");

            migrationBuilder.DropTable(
                name: "SorteosInscripcion");

            migrationBuilder.DropTable(
                name: "CodigosReferido");

            migrationBuilder.DropIndex(
                name: "IX_Inscripciones_CuponDescuentoId",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "Activo",
                table: "StripeConfig");

            migrationBuilder.DropColumn(
                name: "Apellido1",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "CodigoCupon",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "CuponDescuentoId",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "ImporteDescuento",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "ReferralCodeId",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "StripePaymentIntentId",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "SubtotalAntesDescuento",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "TipoDescuentoCupon",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "ValorDescuentoCupon",
                table: "Inscripciones");

            migrationBuilder.DropColumn(
                name: "ReferidosActivo",
                table: "Competiciones");

            migrationBuilder.AddColumn<bool>(
                name: "Activo",
                table: "Schedules",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);
        }
    }
}
