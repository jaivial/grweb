-- Schema (DDL only, no rows) of the previous web's MySQL database `grcup`, taken from the production backup of
-- 03/06/2026 (db-backup/ of the old repo). It builds the synthetic legacy database of QA (deploy/scripts/legado-qa.sh):
-- QA never receives personal data from production.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `Athletes`;
CREATE TABLE `Athletes` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `FirstName` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Surname` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Phone` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `Sex` int NOT NULL,
  `WeightCategory` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Club` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `TotalWeight` decimal(10,2) DEFAULT NULL,
  `RegistrationDate` datetime(6) NOT NULL,
  `Coach` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `Status` int NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  `CheckinAt` datetime(6) DEFAULT NULL,
  `QrCode` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  PRIMARY KEY (`Id`),
  KEY `IX_Athletes_Email` (`Email`),
  KEY `IX_Athletes_Sex` (`Sex`),
  KEY `IX_Athletes_Status` (`Status`),
  KEY `IX_Athletes_WeightCategory` (`WeightCategory`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `CodigosReferido`;
CREATE TABLE `CodigosReferido` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `InscripcionId` int NOT NULL,
  `CompeticionId` int NOT NULL,
  `Codigo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `CodigoNormalizado` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_CodigosReferido_InscripcionId` (`InscripcionId`),
  UNIQUE KEY `IX_CodigosReferido_CompeticionId_CodigoNormalizado` (`CompeticionId`,`CodigoNormalizado`),
  KEY `IX_CodigosReferido_CompeticionId` (`CompeticionId`),
  CONSTRAINT `FK_CodigosReferido_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE,
  CONSTRAINT `FK_CodigosReferido_Inscripciones_InscripcionId` FOREIGN KEY (`InscripcionId`) REFERENCES `Inscripciones` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Competiciones`;
CREATE TABLE `Competiciones` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Nombre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Slug` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Fecha` datetime(6) NOT NULL,
  `Lugar` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Activo` tinyint(1) NOT NULL,
  `LogoUrl` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `FaviconUrl` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `LandingConfig` json DEFAULT NULL,
  `EventoConfig` json DEFAULT NULL,
  `QrSecret` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `Tipo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  `Descripcion` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `EmailContacto` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `Telefono` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `HorariosReady` tinyint(1) NOT NULL DEFAULT '0',
  `ModulesConfig` json DEFAULT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_Competiciones_Slug` (`Slug`),
  KEY `IX_Competiciones_Activo` (`Activo`),
  KEY `IX_Competiciones_Tipo` (`Tipo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `CuponesDescuento`;
CREATE TABLE `CuponesDescuento` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CompeticionId` int NOT NULL,
  `Codigo` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `CodigoNormalizado` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `TipoDescuento` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Valor` decimal(10,2) NOT NULL,
  `Activo` tinyint(1) NOT NULL,
  `TieneLimiteUsos` tinyint(1) NOT NULL,
  `LimiteUsos` int DEFAULT NULL,
  `TieneFechaExpiracion` tinyint(1) NOT NULL,
  `FechaExpiracion` datetime(6) DEFAULT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_CuponesDescuento_CompeticionId_CodigoNormalizado` (`CompeticionId`,`CodigoNormalizado`),
  KEY `IX_CuponesDescuento_Activo` (`Activo`),
  CONSTRAINT `FK_CuponesDescuento_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Draws`;
CREATE TABLE `Draws` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `WinnerEmail` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `WinnerName` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `WinnerInstagram` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `WinnerTicketCount` int DEFAULT NULL,
  `DrawDate` datetime(6) NOT NULL,
  `Notes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `IsConfirmed` tinyint(1) NOT NULL,
  `ParticipantId` int DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `IX_Draws_ParticipantId` (`ParticipantId`),
  CONSTRAINT `FK_Draws_Participants_ParticipantId` FOREIGN KEY (`ParticipantId`) REFERENCES `Participants` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `EmailConfig`;
CREATE TABLE `EmailConfig` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `MainProvider` int NOT NULL,
  `GmailAddress` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `GmailAppPassword` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `SmtpUsername` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `SmtpPassword` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `SmtpEmailAddress` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `SmtpHost` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `SmtpPort` int NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  `CompeticionId` int DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `IX_EmailConfig_CompeticionId` (`CompeticionId`),
  CONSTRAINT `FK_EmailConfig_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `InscripcionConfig`;
CREATE TABLE `InscripcionConfig` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CreatedAt` datetime(6) NOT NULL,
  `EditedAt` datetime(6) NOT NULL,
  `Active` tinyint(1) NOT NULL,
  `Url` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Inscripciones`;
CREATE TABLE `Inscripciones` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CompeticionId` int NOT NULL,
  `Nombre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Instagram` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `Experiencia` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `TieneEntrenador` tinyint(1) NOT NULL,
  `QrCode` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `PagoConfirmado` tinyint(1) NOT NULL,
  `PaymentMethod` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `TotalPagado` decimal(10,2) NOT NULL,
  `CheckinAt` datetime(6) DEFAULT NULL,
  `AceptaTerminos` tinyint(1) NOT NULL,
  `Notas` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  `CategoriaPeso` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '',
  `ParticipacionConfirmada` tinyint(1) NOT NULL DEFAULT '0',
  `QuiereHandler` tinyint(1) NOT NULL DEFAULT '0',
  `Sexo` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '',
  `Telefono` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `QuierePeakProgram` tinyint(1) NOT NULL DEFAULT '0',
  `Modalidad` varchar(30) NOT NULL DEFAULT 'completa',
  `StripeSessionId` varchar(255) DEFAULT NULL,
  `CuponDescuentoId` int DEFAULT NULL,
  `CodigoCupon` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `TipoDescuentoCupon` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `ValorDescuentoCupon` decimal(10,2) DEFAULT NULL,
  `SubtotalAntesDescuento` decimal(10,2) NOT NULL DEFAULT '0.00',
  `ImporteDescuento` decimal(10,2) NOT NULL DEFAULT '0.00',
  `Apellido1` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `Apellido2` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `StripePaymentIntentId` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `ReferralCodeId` int DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `IX_Inscripciones_CompeticionId_Email` (`CompeticionId`,`Email`),
  KEY `IX_Inscripciones_Email` (`Email`),
  KEY `IX_Inscripciones_PagoConfirmado` (`PagoConfirmado`),
  KEY `IX_Inscripciones_Modalidad` (`Modalidad`),
  KEY `IX_Inscripciones_StripeSessionId` (`StripeSessionId`),
  KEY `IX_Inscripciones_CuponDescuentoId` (`CuponDescuentoId`),
  KEY `IX_Inscripciones_ReferralCodeId` (`ReferralCodeId`),
  KEY `IX_Inscripciones_StripePaymentIntentId` (`StripePaymentIntentId`),
  CONSTRAINT `FK_Inscripciones_CodigosReferido_ReferralCodeId` FOREIGN KEY (`ReferralCodeId`) REFERENCES `CodigosReferido` (`Id`) ON DELETE SET NULL,
  CONSTRAINT `FK_Inscripciones_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE,
  CONSTRAINT `FK_Inscripciones_CuponesDescuento_CuponDescuentoId` FOREIGN KEY (`CuponDescuentoId`) REFERENCES `CuponesDescuento` (`Id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `InscripcionesPreparadas`;
CREATE TABLE `InscripcionesPreparadas` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `DateTime` datetime(6) DEFAULT NULL,
  `Preparadas` tinyint(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `LiftEntries`;
CREATE TABLE `LiftEntries` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `AthleteId` int NOT NULL,
  `LiftType` int NOT NULL,
  `AttemptNumber` int NOT NULL,
  `Weight` decimal(10,2) NOT NULL,
  `UpdatedBy` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_LiftEntries_AthleteId_LiftType_AttemptNumber` (`AthleteId`,`LiftType`,`AttemptNumber`),
  KEY `IX_LiftEntries_AthleteId` (`AthleteId`),
  CONSTRAINT `FK_LiftEntries_Athletes_AthleteId` FOREIGN KEY (`AthleteId`) REFERENCES `Athletes` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `LiftEntriesInscripcion`;
CREATE TABLE `LiftEntriesInscripcion` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `InscripcionId` int NOT NULL,
  `LiftType` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `AttemptNumber` int NOT NULL,
  `Weight` decimal(6,2) NOT NULL,
  `UpdatedBy` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  `Juez1Voto` tinyint(1) DEFAULT NULL,
  `Juez2Voto` tinyint(1) DEFAULT NULL,
  `Juez3Voto` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_LiftEntriesInscripcion_InscripcionId_LiftType_AttemptNumber` (`InscripcionId`,`LiftType`,`AttemptNumber`),
  KEY `IX_LiftEntriesInscripcion_InscripcionId` (`InscripcionId`),
  CONSTRAINT `FK_LiftEntriesInscripcion_Inscripciones_InscripcionId` FOREIGN KEY (`InscripcionId`) REFERENCES `Inscripciones` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `NewUserReferrals`;
CREATE TABLE `NewUserReferrals` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CodigoReferidoId` int NOT NULL,
  `InscripcionId` int NOT NULL,
  `TipoDescuento` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `ImporteDescuento` decimal(10,2) NOT NULL,
  `VecesUsado` int NOT NULL,
  `ImporteAcumuladoReferente` decimal(10,2) NOT NULL,
  `StripeRefundId` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `RefundedAt` datetime(6) DEFAULT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_NewUserReferrals_InscripcionId` (`InscripcionId`),
  UNIQUE KEY `IX_NewUserReferrals_CodigoReferidoId_InscripcionId` (`CodigoReferidoId`,`InscripcionId`),
  CONSTRAINT `FK_NewUserReferrals_CodigosReferido_CodigoReferidoId` FOREIGN KEY (`CodigoReferidoId`) REFERENCES `CodigosReferido` (`Id`) ON DELETE CASCADE,
  CONSTRAINT `FK_NewUserReferrals_Inscripciones_InscripcionId` FOREIGN KEY (`InscripcionId`) REFERENCES `Inscripciones` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Participants`;
CREATE TABLE `Participants` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `FirstName` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Surname` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Instagram` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `TicketCount` int NOT NULL,
  `TotalPaid` decimal(10,2) NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `Phone` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `Price` decimal(65,30) DEFAULT NULL,
  `IsPaid` tinyint(1) NOT NULL DEFAULT '1',
  `PaymentMethod` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `DateModified` datetime(6) DEFAULT NULL,
  `StripeSessionId` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `IX_Participants_Email` (`Email`),
  KEY `IX_Participants_Email_PaymentMethod_IsPaid` (`Email`,`PaymentMethod`,`IsPaid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `RaffleProducts`;
CREATE TABLE `RaffleProducts` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  `Title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Subtitle` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `DisplayOrder` int NOT NULL,
  `IsActive` tinyint(1) NOT NULL,
  `ImageUrl` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `IX_RaffleProducts_DisplayOrder` (`DisplayOrder`),
  KEY `IX_RaffleProducts_IsActive` (`IsActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `ReferidosConfig`;
CREATE TABLE `ReferidosConfig` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CompeticionId` int NOT NULL,
  `Activo` tinyint(1) NOT NULL,
  `Modo` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `TipoDescuentoReferente` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `ValorDescuentoReferente` decimal(10,2) NOT NULL,
  `TieneLimiteUsos` tinyint(1) NOT NULL,
  `LimiteUsos` int DEFAULT NULL,
  `ModoAcumulativo` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `MultiplicadorAcumulativo` decimal(10,2) DEFAULT NULL,
  `TipoDescuentoNuevoUsuario` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `ValorDescuentoNuevoUsuario` decimal(10,2) NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_ReferidosConfig_CompeticionId` (`CompeticionId`),
  CONSTRAINT `FK_ReferidosConfig_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `ReferidosUserSetting`;
CREATE TABLE `ReferidosUserSetting` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CodigoReferidoId` int NOT NULL,
  `Activo` tinyint(1) NOT NULL,
  `Modo` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `TipoDescuentoReferente` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `ValorDescuentoReferente` decimal(10,2) NOT NULL,
  `TieneLimiteUsos` tinyint(1) NOT NULL,
  `LimiteUsos` int DEFAULT NULL,
  `ModoAcumulativo` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `MultiplicadorAcumulativo` decimal(10,2) DEFAULT NULL,
  `TipoDescuentoNuevoUsuario` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `ValorDescuentoNuevoUsuario` decimal(10,2) NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_ReferidosUserSetting_CodigoReferidoId` (`CodigoReferidoId`),
  CONSTRAINT `FK_ReferidosUserSetting_CodigosReferido_CodigoReferidoId` FOREIGN KEY (`CodigoReferidoId`) REFERENCES `CodigosReferido` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `ResponsableInscripcion`;
CREATE TABLE `ResponsableInscripcion` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `DateModified` datetime(6) NOT NULL,
  `Value` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `RifaConfigs`;
CREATE TABLE `RifaConfigs` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CompeticionId` int NOT NULL,
  `NombrePremio` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `DescripcionPremio` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `PrecioTicket` decimal(10,2) NOT NULL,
  `TicketsTotal` int NOT NULL,
  `Activo` tinyint(1) NOT NULL,
  `FechaSorteo` datetime(6) DEFAULT NULL,
  `NumeroGanador` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `GanadorInscripcionId` int DEFAULT NULL,
  `GanadorConfirmado` tinyint(1) DEFAULT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_RifaConfigs_CompeticionId` (`CompeticionId`),
  CONSTRAINT `FK_RifaConfigs_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `RifaTickets`;
CREATE TABLE `RifaTickets` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CompeticionId` int NOT NULL,
  `InscripcionId` int DEFAULT NULL,
  `NumeroTicket` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `StripePaymentId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `BuyerEmail` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `BuyerNombre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `Confirmado` tinyint(1) NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_RifaTickets_CompeticionId_NumeroTicket` (`CompeticionId`,`NumeroTicket`),
  KEY `IX_RifaTickets_Confirmado` (`Confirmado`),
  KEY `IX_RifaTickets_InscripcionId` (`InscripcionId`),
  CONSTRAINT `FK_RifaTickets_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE,
  CONSTRAINT `FK_RifaTickets_Inscripciones_InscripcionId` FOREIGN KEY (`InscripcionId`) REFERENCES `Inscripciones` (`Id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `SchedulePublishedConfig`;
CREATE TABLE `SchedulePublishedConfig` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `DateModified` datetime(6) NOT NULL,
  `Value` tinyint(1) NOT NULL,
  `CompeticionId` int DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `IX_SchedulePublishedConfig_CompeticionId` (`CompeticionId`),
  CONSTRAINT `FK_SchedulePublishedConfig_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Schedules`;
CREATE TABLE `Schedules` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `SexCategory` int NOT NULL,
  `WeightCategory` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Date` date NOT NULL,
  `StartTime` time(6) NOT NULL,
  `EndTime` time(6) NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  `CompeticionId` int DEFAULT NULL,
  `Activo` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`Id`),
  KEY `IX_Schedules_Date` (`Date`),
  KEY `IX_Schedules_SexCategory_WeightCategory` (`SexCategory`,`WeightCategory`),
  KEY `IX_Schedules_CompeticionId` (`CompeticionId`),
  CONSTRAINT `FK_Schedules_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `StripeConfig`;
CREATE TABLE `StripeConfig` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `SecretKey` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `PublishableKey` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `WebhookSecret` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  `CompeticionId` int DEFAULT NULL,
  `Activo` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`Id`),
  KEY `IX_StripeConfig_CompeticionId` (`CompeticionId`),
  CONSTRAINT `FK_StripeConfig_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `TutorialInteractions`;
CREATE TABLE `TutorialInteractions` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `VideoId` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Tipo` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Contenido` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `Autor` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `SessionId` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `CreatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`Id`),
  KEY `IX_TutorialInteractions_VideoId` (`VideoId`),
  KEY `IX_TutorialInteractions_VideoId_Tipo` (`VideoId`,`Tipo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `UrlInscripcion`;
CREATE TABLE `UrlInscripcion` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `DateModified` datetime(6) NOT NULL,
  `Url` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `Usuarios`;
CREATE TABLE `Usuarios` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `PasswordHash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Nombre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `IsSuperadmin` tinyint(1) NOT NULL,
  `IsActive` tinyint(1) NOT NULL,
  `LastLoginAt` datetime(6) DEFAULT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  `IsRoot` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_Usuarios_Email` (`Email`),
  KEY `IX_Usuarios_IsSuperadmin` (`IsSuperadmin`),
  KEY `IX_Usuarios_IsRoot` (`IsRoot`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `UsuariosCompeticiones`;
CREATE TABLE `UsuariosCompeticiones` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `UsuarioId` int NOT NULL,
  `CompeticionId` int NOT NULL,
  `Role` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `InvitedByEmail` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `InvitedAt` datetime(6) DEFAULT NULL,
  `InvitationAccepted` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_UsuariosCompeticiones_UsuarioId_CompeticionId` (`UsuarioId`,`CompeticionId`),
  KEY `IX_UsuariosCompeticiones_CompeticionId` (`CompeticionId`),
  CONSTRAINT `FK_UsuariosCompeticiones_Competiciones_CompeticionId` FOREIGN KEY (`CompeticionId`) REFERENCES `Competiciones` (`Id`) ON DELETE CASCADE,
  CONSTRAINT `FK_UsuariosCompeticiones_Usuarios_UsuarioId` FOREIGN KEY (`UsuarioId`) REFERENCES `Usuarios` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `UsuariosPermissions`;
CREATE TABLE `UsuariosPermissions` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `UsuarioId` int NOT NULL,
  `PermissionKey` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Granted` tinyint(1) NOT NULL,
  `CompeticionId` int DEFAULT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_UsuariosPermissions_UsuarioId_PermissionKey_CompeticionId` (`UsuarioId`,`PermissionKey`,`CompeticionId`),
  CONSTRAINT `FK_UsuariosPermissions_Usuarios_UsuarioId` FOREIGN KEY (`UsuarioId`) REFERENCES `Usuarios` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `__EFMigrationsHistory`;
CREATE TABLE `__EFMigrationsHistory` (
  `MigrationId` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `ProductVersion` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`MigrationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `raffle_config_legacy`;
CREATE TABLE `raffle_config_legacy` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CreatedAt` datetime(6) NOT NULL,
  `UpdatedAt` datetime(6) NOT NULL,
  `IsEnabled` tinyint(1) NOT NULL,
  `DisabledMessage` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `RaffleMethod` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;
