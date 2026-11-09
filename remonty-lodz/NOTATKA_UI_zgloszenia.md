# Notatka dla sesji od interfejsu: położenie przycisku „Zgłoś remont"

Autor: sesja od zgłaszania zdarzeń. Interfejsu tu **nie zmieniałem**, to zadanie dla sesji od UI.

## Co trzeba poprawić (wg screenshota od autora)

1. **Przycisk „Zgłoś remont" + ⟳ (`#repTools`) ma wyjść z kolumny pod zoomem** (`#tl`) i stać w **lewym dolnym rogu mapy**,
   nad paskiem czasu, na wysokości legendy lub tuż nad nią. Czerwona strzałka na screenie biegnie od przycisku
   w lewy dolny róg, w okolice lewej krawędzi obok legendy.
2. Legenda (`#legend`) zaczyna się dziś od `left: 64px` i ma zmienną wysokość (kilka wierszy). Przycisk nie może jej
   zasłaniać ani na niej leżeć. Propozycja: przycisk w `left: 12px`, a legendę przesunąć w prawo (np. `left` = szerokość
   przycisku + odstęp) albo ułożyć przycisk nad legendą (`bottom: calc(var(--bar-h) + 22px + wysokość legendy)`).
   Wybór zostaje po stronie sesji od UI.
3. Na telefonie (`max-width: 760px`) legenda jest ukryta (`display: none`), więc przycisk ma stać nad paskiem
   (`bottom: calc(var(--bar-h) + 12px)`, `left: 8px`).

## Czego nie ruszać (to już działa)

- Id i klasy: `#repTools`, `#addBtn`, `#repRefresh`, `#rhint`, `#rform`. Logika w `app.js` w sekcji
  „citizen reports" używa ich po `id`, więc zmiana położenia to wyłącznie CSS plus ewentualnie przeniesienie
  bloku `#repTools` w `index.html` (poza `#tl`).
- Klasa `body.rep-busy` chowa `#repTools` na czas wskazywania punktu i formularza.
- Formularz `#rform` stoi teraz w lewym dolnym rogu (`bottom: calc(var(--bar-h) + 24px)`), nad legendą. Gdy przycisk
  przejdzie w ten sam róg, formularz i tak go zasłania, bo przycisk jest wtedy ukryty. Sprawdzić, czy formularz nie wchodzi
  na licznik (`#tl`) na niskich ekranach.

## Weryfikacja po zmianie

Desktop (ok. 1280×720 i 1600×900) oraz telefon (375×812), motyw jasny i ciemny: przycisk nie zasłania legendy, zoomu
ani znaczników na mapie, a po kliknięciu pokazuje się podpowiedź „Kliknij na mapie miejsce remontu".
