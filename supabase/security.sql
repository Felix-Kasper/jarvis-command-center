-- JARVIS: Zugriff ohne Anmeldung komplett sperren (nach allen anderen SQL-Dateien ausführen).
-- Der öffentliche (publishable) Schlüssel steckt zwangsläufig in der Website. Damit er ohne Login
-- nichts lesen oder schreiben kann, bekommt die Rolle "anon" keinerlei Tabellenrechte.
-- Angemeldet gilt zusätzlich Row Level Security: jeder sieht nur seine eigenen Zeilen.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
