#!/bin/sh
# Premier démarrage de PostgreSQL seulement (dossier docker-entrypoint-initdb.d) : crée le compte de
# l'application, SANS droits d'administrateur de PostgreSQL. Il possède la base fajma (tables, migrations,
# extension btree_gist « de confiance ») mais ne peut ni créer de base, ni créer de compte, ni lire les
# fichiers du serveur. Le compte d'administration (POSTGRES_USER) ne sert qu'aux sauvegardes et à la maintenance.
set -eu
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD manquant}"
psql -v ON_ERROR_STOP=1 -v pw="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE fajma_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'pw';
SELECT format('ALTER DATABASE %I OWNER TO fajma_app', current_database()) \gexec
ALTER SCHEMA public OWNER TO fajma_app;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
SQL
