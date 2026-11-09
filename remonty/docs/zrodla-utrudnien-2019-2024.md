# Źródła utrudnień drogowych w Łodzi 2019–2024: szybki research (9.11.2026)

Zakres: które źródła da się zeskrapować (głównie przez Wayback CDX), żeby dodać utrudnienia sprzed II 2025.
Metoda: zapytania do `web.archive.org/cdx/search/cdx` (filtr `statuscode:200`, `collapse=urlkey`) i ręczny odczyt próbek kopii `id_`.
Liczby to unikalne adresy URL w archiwum. Nie są to liczby utrudnień.

## Wyniki

| Źródło | Pokrycie 2019–2024 w Wayback | Co zawiera | Ocena |
|---|---|---|---|
| **MPK Łódź, `mpk.lodz.pl/rozklady/zmiany.jsp?date=…`** | 1597 URL (2019: 299, 2020: 659, 2021: 222, 2022: 18, 2023: 127, 2024: 272) | Lista „Planowane / aktualne zmiany rozkładów jazdy”, a w niej wpisy w stylu „Od dnia 11 sierpnia 2024 r. zmianie ulegną trasy linii 2 5 8 16, zawieszone kursowanie linii Z2, Z8”. *Hipoteza, niesprawdzona:* wpisy linkują do stron szczegółowych z trasą objazdu i przyczyną („w związku z remontem ul. …”). Odczytałem tylko listy. | **Najlepsze.** Ma stały szablon (JSP, kodowanie ISO-8859-2), daty startu podane wprost, roboty planowane. Ograniczenie: widać tylko utrudnienia, które dotknęły komunikację miejską. Brak typu zajęcia pasa, poza zamknięciem lub objazdem. |
| MPK Łódź, `mpk.lodz.pl/rozklady/utrudnienia.jsp?date=…` | ok. 650 URL w samym 2021, wpisy także z lat 2017–2024 | Bieżące zdarzenia: awarie, wypadki, zatrzymania tramwajów, z godziną dodania. | **Słabe dla remontów.** To w większości zdarzenia trwające godziny, a nie roboty. Nadaje się najwyżej jako filtr („awaria wodociągowa” na ulicy z umową). |
| lodz.pl / uml.lodz.pl sprzed 2024 | `lodz.pl/remonty*`: 1 URL, `uml.lodz.pl/aktualnosci/artykul/*`: 7 URL, `zdit.uml.lodz.pl`: 277 URL, głównie obrazki i PDF | Pojedyncze artykuły bez stałej struktury. Strona `/remonty` z kartami powstała dopiero pod koniec 2024. | **Nie warto.** Archiwum prawie nie ma artykułów. Twoja intuicja się zgadza: struktura słaba i do tego dziury w archiwum. |
| Radio Łódź (`radiolodz.pl`) | >100 000 URL w archiwum (limit zapytania). ok. 990 ze słowami remont, utrudnienia, objazd, zamknięcie, przebudowa w adresie, w tym zdjęcia i tematy niedrogowe (szpital, zoo, boisko) | Artykuły newsowe: „Light Move Festival 2024 w Łodzi – utrudnienia”, remonty wiaduktów. | **Średnie.** Duże pokrycie, ale tekst swobodny, dużo szumu, daty startu zwykle w tekście. Nadaje się jako potwierdzenie dużych remontów, nie jako główne źródło. Wymaga osobnego sprawdzenia `robots`/regulaminu. |
| Dziennik Łódzki, Wyborcza Łódź, TVN24 Łódź | niesprawdzone (zapytanie CDX po całej domenie przekroczyło 10 min) | Artykuły newsowe | Tak jak Radio Łódź, częściowo za paywallem. |

## Rekomendacja

1. **Wdrożyć skrypt MPK `zmiany.jsp`** (nowy `e12_mpk.py` na wzór `e11_lodzpl.py`):
   - pobrać wszystkie strony szczegółowe zmian z lat 2019–2024 z Wayback;
   - zostawić wpisy z przyczyną „remont”, „przebudowa”, „roboty”, „prace”;
   - z „Od dnia X do dnia Y” wyciągnąć okres, z opisu wyciągnąć ulicę;
   - `traffic_impact`: `full_closure` lub `unknown`; `source=mpk`, `confidence=medium`.
   Uwaga: to są **utrudnienia dla komunikacji miejskiej**, a nie pełny obraz. W UI i w docs trzeba to oznaczyć osobno, inaczej porównanie 2019 z 2025 będzie mylące (lodz.pl opisuje też zwężenia bez wpływu na MPK).
2. Radio Łódź: tylko jako ręczne lub półautomatyczne potwierdzenie przez seed, dla dużych remontów bez wpisu MPK.
3. lodz.pl/UMŁ sprzed 2024: pominąć.

Pierwszy test przed pisaniem skryptu: pobrać 30 stron szczegółowych `zmiany.jsp` z 2020 i policzyć, ile ma przyczynę związaną z robotami oraz czy daje się wyciągnąć ulicę.

## Test MPK (9.11.2026): 30 losowych komunikatów zarchiwizowanych w 2020

- Strony szczegółowe mają adres `mpk.lodz.pl/rozklady/wholemessage.jsp?articleId=N` (link z listy `zmiany.jsp`). Treść zaczyna się od „KOMUNIKAT nr/rr”, a kodowanie to ISO-8859-2.
- Pokrycie w Wayback: 6747 unikalnych komunikatów, z kopiami z lat 2004–2026. Według roku kopii: 2019: 252, 2020: 270, 2021: 462, 2022: 401, 2023: 372, 2024: 900. Rok kopii nie musi być rokiem komunikatu, ale numery `articleId` rosną w czasie.
- Z 30 losowych kopii 18 ma czytelną treść komunikatu. Pozostałe to puste szablony albo strony „nie zarchiwizowano”.
- **3 z 18 (ok. 17%) dotyczą robót** i każdy ma ulicę oraz datę. Przykłady:
  - „W związku z pracami drogowymi prowadzonymi w rejonie skrzyżowania Konspiracyjnego Wojska Polskiego – Śląska od 10 do 23 grudnia 2019 r.”: skrzyżowanie i pełny okres;
  - „naprawa torowiska na skrzyżowaniu Północna/Ogrodowa–Nowomiejska” w dniach 20–24 stycznia 2020;
  - „rozpoczynającymi się pracami drogowymi na ulicy Gajcego (na odcinku od ulicy Zakładowej do ulicy Rokicińskiej) … od dnia 1 sierpnia 2020”: odcinek „od–do”, co pasuje do istniejącego cięcia e4b.
- Dodatkowo „dopuszczenie do ruchu kołowego jezdni ul. Dąbrowskiego (pomiędzy ul. Rzgowską a al. Śmigłego-Rydza) od nocy 22/23 grudnia 2019” daje **datę końca** robót. Takie komunikaty warto łączyć z komunikatem o starcie.
- Reszta to zmiany rozkładów z decyzji ZDiT (COVID w 2020, przystanki na żądanie, rozkłady świąteczne), które filtr słów kluczowych odrzuca.
- Wnioski:
  - Szacunkowo 15–20% komunikatów dotyczy robót. Przy ok. 2600 komunikatach z lat 2019–2024 daje to około **300–500 rekordów**, z ulicą i datą startu, często także z odcinkiem lub skrzyżowaniem.
  - Próba z 2020 jest zaniżona przez COVID.
  - Koszt to tylko pobieranie z Wayback, około 2600 zapytań w tempie ~1 na sekundę.
- Ograniczenia:
  - komunikat MPK opisuje zmianę trasy, a nie zajęcie jezdni, więc `traffic_impact` przeważnie wynosi `unknown` albo `full_closure`, gdy pada „zamknięcie”;
  - roboty bez wpływu na komunikację miejską są niewidoczne;
  - mniej więcej co trzecia kopia jest pusta.
