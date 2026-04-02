-- Migration: Add ResponsableInscripcion and UrlInscripcion tables
-- Run this script against the grcup database

CREATE TABLE IF NOT EXISTS `ResponsableInscripcion` (
    `Id` int NOT NULL AUTO_INCREMENT,
    `DateModified` datetime(6) NOT NULL,
    `Value` tinyint(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `UrlInscripcion` (
    `Id` int NOT NULL AUTO_INCREMENT,
    `DateModified` datetime(6) NOT NULL,
    `Url` varchar(2000) CHARACTER SET utf8mb4 NULL,
    PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default value for ResponsableInscripcion (true = GRStrength)
INSERT INTO `ResponsableInscripcion` (`DateModified`, `Value`) 
SELECT NOW(), 1 FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM `ResponsableInscripcion` LIMIT 1);
