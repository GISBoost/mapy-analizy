# Audyt `index.csv` (B6 remonty) — stan 2026-11-07

Skrypt: `remonty/audyt_indeksu.py` (`py -I -X utf8 remonty/audyt_indeksu.py`). Wynik z tagami: `remonty/index_fixed.csv` (oryginał `index.csv` w korzeniu repo nietknięty; w `.gitignore`). Nic nie usunięto, tylko oznaczono.

## Najważniejsze

- **Indeks nie dotyczy ZDiT ani remontów dróg.** Wszystkie 273 pliki pochodzą z jednej domeny `bip.uml.lodz.pl`, a wszystkie `page_url` z sekcji `/urzad-miasta/przetargi/` (ogólne przetargi Urzędu Miasta: zamówienia do/powyżej 130 tys. zł, plany postępowań, sprzedaż i wykazy nieruchomości). Ani jednego pliku z BIP ZDiT.
- **Faktycznie unikalnych jest 133 plików** (sha1), nie 273: 122 grupy duplikatów, 140 nadmiarowych kopii. Główna przyczyna: crawler traktował `http://` i `https://` tego samego adresu jako różne (273 różnych `file_url` → 142 po normalizacji do https; reszta, 9, to ta sama treść pod różnymi URL). Naprawione w skrypcie.
- Wszystkie 273 pliki są na dysku w `remonty/pobrane/`, sha1 zgodne z indeksem (273/273).
- Kandydatów drogowych jest **14 wierszy = 7 unikalnych plików**: dokumentacje ul. Julianowska, Pływacka, Urzędnicza; Skalna (projekt techniczny, przedmiar robót); „Projekt budowlano-wykonawczy”; „zał. 2 Dokumentacja projektowa” (dane z 2026, jedne przetargi UMŁ, nie ZDiT).
- Zakres lat: nie ma danych z 2018–2024 w sensie remontów. Rok udało się wyznaczyć dla 115/273 wierszy, głównie 2026 (90) — to bieżące ogłoszenia. Plany zamówień UMŁ za 2017–2025 (18 wierszy, 9 unikalnych) to jedyne starsze pliki, ale to plany całego Urzędu.

## Rozkłady

| Wymiar | Wartości (wiersze) |
|---|---|
| Domena | bip.uml.lodz.pl 273 |
| Rozszerzenie | pdf 171, docx 62, zip 26, doc 14 |
| Ścieżka plików | `files/bip/public/zamowienia-publiczne` 132; `tx_edgeregisters/…/6667` 70 (jeden rejestr: 6667); `BIP_SS_26` 31; `BIP_VG_26` 11; `BIP_MW_26` 10; `user_upload` 8; `WZP_2024` 6; `WZP_2022` 4; `BIP_TW_26` 1 |
| Rok (z URL/nazwy/tytułu) | 2026: 90; 2024: 15; 2022: 4; 2018, 2019, 2020: po 2; brak: 158 |
| Tytuł tematyczny (heurystyka, wiersze / unikalne sha1) | ogłoszenie o udzieleniu zamówienia 78 / 38; wzory i załączniki ogólne (RODO, formularze, oświadczenia) 56 / 25; nieruchomości (sprzedaż, wykazy) 53 / 32; gaśnice i czujki 22 / 7; posiłki, inspektor 22 / 10; plany zamówień UMŁ 18 / 9; drogi (kandydaci) 14 / 7; ogłoszenia TED OJS 8 / 4; inne 2 / 1 |

Uwaga: „ogłoszenie o udzieleniu zamówienia” (76 wierszy bez roku, w tym 70 z rejestru 6667) to ogólne ogłoszenia UMŁ; bez czytania treści nie wiadomo, czy dotyczą dróg. Nie zakładam, że nie.

## Niezwiązane tematycznie (tylko oznaczone, `topic` w `index_fixed.csv`)

nieruchomości (53), gaśnice/czujki (22), posiłki/inspektor (22), RODO i wzory ogólne (56, załączniki bez treści własnej), plany zamówień UMŁ (18). Razem ≈171 wierszy to ewidentnie poza tematem lub tylko ogólne; bez ręcznego przeglądu nie usuwać.

## Kodowanie `link_text`

Przyczyna: `requests` zgaduje ISO-8859-1, gdy nagłówek `Content-Type` nie ma charsetu (potwierdzone na żywo: `text/html`, `r.encoding=ISO-8859-1`, `apparent_encoding=utf-8`), a skrypt parsował `r.text`. Zepsutych było **21 wierszy** (plany postępowań i pochodne), reszta była poprawna. Naprawa danych: `encode('latin-1').decode('utf-8')` → kolumna `link_text_fixed`, 0 znaków U+FFFD po naprawie. Naprawa skryptu: `BeautifulSoup(r.content, …)`.
