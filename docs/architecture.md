# Architektur

Ein schlanker Core plus Module auf **drei getrennten Achsen** – die Trennung
zwischen *was am Himmel ist* und *wie es dargestellt wird* hält alles entkoppelt:
Ein neuer Provider erscheint automatisch in allen Ansichten, eine neue Ansicht
zeigt automatisch alle Objekte.

```
src/
  core/                Ephemeriden & Ableitungen – reine, UI-freie Funktionen
    astro-engine.ts      Sonne, Mond, Ereignisse, Koordinatentransformation
    time-engine.ts       Sonnenzeit-Versatz, Zeitgleichung, Zeitzonen
    theme-engine.ts      Zonen nach Sonnenhöhe, kontinuierliche Paletten
    planets.ts           geozentrische Planetenpositionen
    stars.ts             heller Fixstern-Katalog + Transformation
    deep-sky.ts          kuratierter Messier-/NGC-Katalog
    satellites.ts        SGP4-Propagation (satellite.js), Überflugvorhersage
    solar-geometry.ts    Einstrahlungsgeometrie für PV
    prayer-times.ts      Gebetszeiten aus Sonnenhöhe
    chronobiology.ts     sozialer Jetlag & Chronotyp (MCTQ)
    outdoor.ts           Restlicht, blaue/goldene Stunde, Mondlicht, Richtung
    wheel-of-year.ts     Sonnenwenden/Tagundnachtgleichen als exakte Zeitpunkte
    sun-hours.ts         direkte Sonnenstunden, Fassade & Verschattung
    comfort.ts           Hitzeschutz: Rolläden & Lüften (Geometrie + Temperatur)
    meteor-showers.ts    die acht Hauptströme, Radiant-Höhe, Aktivität
    kids.ts              Beobachtungsaufgabe für den Kinder-Layer
    object-bus.ts        aggregiert aktive Provider, Fehlerisolierung pro Modul
    location.ts          GPS, manuelle Eingabe, lokale Persistenz
  providers/           Achse A – sun, moon, planets, stars, deep-sky, satellites
  views/               Achse B – dial, sky-map, object-list
  features/            Achse C – onboarding, wallmode, weather, share, solar-yield,
                                 prayer-times, chronobiology, outdoor, wheel-of-year,
                                 sun-hours-panels, comfort, wildlife, drone, civil-warnings,
                                 kids, meteor-showers, reminders, push, satellites, about
  i18n/                DE/EN
  main.ts              App-Shell, verdrahtet die drei Achsen

native/                React-Native/Expo-Aufsatz auf derselben core-Engine
```

Die Berechnungsebene ist bewusst **frei von UI-Abhängigkeiten**, damit sie
unverändert in die native App und in einen späteren Smarthome-Begleitdienst
(`zeitgeber-bridge`) übernommen werden kann.
