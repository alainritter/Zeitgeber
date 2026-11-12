# CLAUDE.md

Prüfen: `npm run typecheck && npm test` (Runner und Abnahme nutzen diesen Befehl)

Zeitgeber ist eine astronomisch korrekte Sonnenuhr (TypeScript strict, Vite, PWA, offline, ohne Backend). Überblick: `README.md`, Spezifikation: `docs/SPEC.md`, Push-Einrichtung: `docs/PUSH_SETUP.md`, Mitarbeit: `CONTRIBUTING.md`.

## Befehle

- `npm run dev` startet den Dev-Server, `npm run typecheck` und `npm test` (vitest) vor jedem Commit, `npm run build` baut nach `dist/`.

## Aufbau

- `src/core` Berechnung, `src/providers` Datenquellen, `src/features` und `src/views` Oberfläche, `src/i18n` DE/EN, `src/config` und `src/data` Konfiguration und Daten.
- `api/` sind die Vercel-Funktionen (Web-Push, Cron).

## Regeln

- Eigenes Design, nicht Harmonia (siehe `~/Dev/CLAUDE.md`).
- Lizenz ist AGPL-3.0, nicht MIT; nie an Kalliope anbinden.
- Die App muss offline funktionieren; keine Laufzeit-Abhängigkeit von externen Diensten ohne Fallback.
- Vercel: Push auf `main` kann live gehen, Arbeit auf einem Branch lassen, bis sie geprüft ist.
