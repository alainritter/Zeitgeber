# Zeitgeber

Astronomisch korrekte Sonnenuhr: zeigt nicht die Zeitzone, sondern den tatsächlichen Sonnenstand am eigenen Ort und den Abstand zur gesetzlichen Zeit. „12 Uhr ist fast nie Mittag." Offline-PWA (plus iOS/Android), ohne Backend, DE/EN.

<img src="./docs/screenshot-dark.png" alt="Zeitgeber — Zifferblatt bei Nacht, mit Dämmerungszonen, gesetzlicher Zeit und Sonnenzeit" width="280" />
<img src="./docs/screenshot-light.png" alt="Zeitgeber — Zifferblatt bei Tag, mit Dämmerungszonen, gesetzlicher Zeit und Sonnenzeit" width="280" />

<img src="./docs/screenshot-desktop.png" alt="Zeitgeber am Desktop — Zifferblatt mit Komfort-, Outdoor- und Astronomie-Modulen in drei Spalten" width="720" />

## Warum

Fast jede Uhr kennt nur die Zeitzone, nicht den Ort. Zeitgeber zeigt beide Seiten: soziale Zeit und echte Lichtumgebung. Dazu kommt der soziale Jetlag (Abstand zwischen sozialem und biologischem Rhythmus, nach dem Munich Chronotype Questionnaire). Wer spät schläft *und* am Westrand einer Zeitzone lebt, sieht den kombinierten Gesamtversatz auf einem Zifferblatt. Optionale Module (Outdoor, Solarertrag, Himmelskarte, Satelliten u. a.) sind standardmäßig aus, siehe [`docs/features.md`](./docs/features.md).

## Starten

```sh
npm install
npm run dev        # Entwicklungsserver (Node 22+)
npm test           # Berechnungen gegen Referenzwerte
```

Build: `npm run build`, native App: `cd native && npm install && npx expo start`.

## Wissenschaftliche Grundlage

| Domäne | Methode |
|---|---|
| Sonnenposition, Auf-/Untergang, Dämmerung | NOAA-Algorithmus (VSOP87-Ableitung), Refraktion |
| Mondposition, Phase | Schlyter-Näherung inkl. Hauptperturbationen |
| Planeten | Keplersche Bahnelemente, geozentrisch |
| Fixsterne | J2000-Katalog, Transformation über Greenwich Sidereal Time |
| Chronotyp, sozialer Jetlag | Munich Chronotype Questionnaire (Roenneberg/Wittmann) |
| Zeitzonen | IANA über `Intl` |

**Keine** astrologischen, esoterischen oder Solunar-Inhalte. Wissenschaftliche
Korrektheit ist die Grundlage des Vertrauens in dieses Projekt.

Validiert über Unit-Tests gegen Referenzwerte und starke physikalische
Invarianten (u. a. Polaris-Höhe ≈ geografische Breite, maximale Elongation der
inneren Planeten, korrekte Reihenfolge der Gebetszeiten). `npm test`.

## Datenschutz

- Kein Backend, keine Konten, keine Synchronisation, keine Tracking-Bibliotheken.
- Standort und alle Eingaben werden **nur lokal** verarbeitet.
- Chronobiologie-Daten: Export als JSON und Löschung mit einem Tippen.
- **Erinnerungen** (der „dynamische Wecker") laufen im Vordergrund und im
  Wandmodus rein lokal. Echter **Hintergrund-Push** (auch bei geschlossener App)
  ist ein **optionaler, selbst zu konfigurierender** Zusatz: er speichert nur die
  Zustelldaten (Push-Endpunkt, grobe Koordinaten, Zeitzone, Sprache) – keine
  Konten, kein Verlauf – und lässt sich mit einem Tippen wieder löschen.
  Einrichtung: [`docs/PUSH_SETUP.md`](./docs/PUSH_SETUP.md).

## Hinweise

- Zeitgeber liefert Informationen über Licht-, Zeit- und Himmelsverhältnisse, niemals Diagnose, Therapie oder Rechtsauskunft.
- Finanzierung nur über freiwillige Spenden ([PayPal](https://paypal.me/AlainRitter)), keine Werbung, keine In-App-Käufe.
- Beiträge willkommen, besonders Genauigkeitsprüfungen: [CONTRIBUTING.md](./CONTRIBUTING.md), [Verhaltenskodex](./CODE_OF_CONDUCT.md).
- Weitere Doku: [`docs/features.md`](./docs/features.md), [`docs/architecture.md`](./docs/architecture.md), [`docs/SPEC.md`](./docs/SPEC.md) (inkl. Umsetzungsstand), [`CHANGELOG.md`](./CHANGELOG.md).

## Lizenz

AGPL-3.0, siehe [LICENSE.md](./LICENSE.md).
