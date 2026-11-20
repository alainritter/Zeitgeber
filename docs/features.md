# Funktionsumfang

**Ansichten**

| Ansicht | Beschreibung |
|---|---|
| Zifferblatt | 24-Stunden-Sonnenuhr mit kontinuierlichen Dämmerungszonen, Sonnenhöchststand-Marker, Kompassring und – bei aktivem Rhythmus – drei überlagerten Ringen (Sonne, gesetzliche Zeit, Körper-Rhythmus) |
| Himmelskarte | 2D-Allsky-Karte, Zenit in der Mitte, alle Objekte an ihrer realen Position |
| Objektliste | „Heute Nacht sichtbar", sortiert nach Höhe, mit Helligkeit und Richtung |
| Zeitreise | jeder Zeitpunkt frei wählbar – Vergangenheit wie Zukunft, „Der Himmel bei deiner Geburt" |

**Am Himmel**

Sonne und Mond (immer aktiv), Planeten (Merkur–Neptun mit Helligkeit und
Elongation), helle benannte Fixsterne, Deep-Sky-Highlights (kuratierter
Messier-Katalog) und **Satelliten/ISS** (SGP4 aus TLE-Daten, mit Überflug-
vorhersage). Jeder Provider erscheint automatisch in allen Ansichten.

Satelliten brauchen frische Netzdaten (CelesTrak-TLEs); veraltete Bahndaten
werden erkannt und gemeldet (§10). Die Berechnung selbst läuft lokal auf dem
Gerät.

**Fähigkeiten**

| Modul | Beschreibung |
|---|---|
| Chronobiologie | sozialer Jetlag, Chronotyp und kombinierter Gesamtversatz – rein lokal, rein beschreibend |
| Sonnenzeit-Versatz | gesetzlicher vs. echter Mittag, live |
| Outdoor & Survival | Restlicht-Countdown, blaue/goldene Stunde, Mondlicht-Prognose, Himmelsrichtung ohne Kompass |
| Solarertrag | Modul-Ausrichtung/Neigung, Ertragsfenster, Sommer/Winter – reine Geometrie, keine kWh |
| Fassade & Tageslicht | direkte Besonnung einer Fassade über den Tag – macht „Wohnung mit Nachmittagssonne" prüfbar |
| Garten & Verschattung | Sonnenstunden am Standort, Verschattung durch Gebäude/Baum (Höhe & Abstand) |
| Hitze & Lüften | wann lüften, wann Rolläden schließen – Sonnengeometrie, optional mit Außentemperatur |
| Wildtiere | Dämmerungsaktivität und Mondlicht (ohne Solunar-Theorie) |
| Drohne | Lichtfenster für heute mit Countdown und Rechtshinweis |
| Meteorschauer | die acht Hauptströme, aktiv/kommend, Radiant-Höhe und Mondstörung |
| Für Kinder | fragengeführte, vereinfachte Ansicht mit Beobachtungsaufgabe – ohne Gamification, ohne Datenerhebung |
| Gebetszeiten | etablierte Konventionen (auswählbar, mit Quelle), reine Zeitangabe |
| Jahreskreis | Sonnenwenden, Tagundnachtgleichen und Zwischenfeste als exakter astronomischer Zeitpunkt |
| Zivilschutz-Warnungen | amtliche Warnungen des Bundes für den eigenen Landkreis (nur Deutschland) |
| Erinnerungen | dynamischer Wecker für fällige Hinweise, im Vordergrund/Wandmodus lokal, optional per Hintergrund-Push |
| Wetter | Beobachtungseignung über Open-Meteo, mit Offline-Rückfall |
| Teilen & Export | aktuelle Ansicht als hochauflösendes PNG mit Fußzeile |
| Wandmodus | lebende Wanduhr mit Abdunklung und Einbrennschutz |

Alle optionalen Module sind **standardmäßig deaktiviert** – wer nichts
konfiguriert, sieht ein ruhiges Zifferblatt. Die Breite wird erst sichtbar, wenn
jemand danach sucht.

## Plattformen

- **Web** (`react-native-web`-frei, eigenständiges Web-Target): läuft im
  Browser, als PWA installierbar, offline-fähig.
- **Nativ** (`native/`, React Native + Expo): iOS und Android teilen sich die
  **identische, UI-freie Berechnungsebene** mit dem Web-Target – keine Kopie der
  Astronomie-Logik.
