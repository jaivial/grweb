-- +goose Up
-- BIZ-168: «−58» is not an AEP/IPF class (women: −43 −47 −52 −57 −63 −69 −76 −84 +84); the seed had one athlete at −58.
UPDATE atletas SET categoria = '-57' WHERE sexo = 'F' AND categoria = '-58';
