# Remonty Łodzi — język domeny

Glosariusz pojęć używanych w `remonty/` i `remonty-lodz/`. Bez szczegółów implementacji.

## Pojęcia

**Wzmianka** — jedna informacja o robocie drogowej w jednym dokumencie (plan, BZP, BIP), z cytatem i stroną.

**Zdarzenie** — robota na jednym odcinku ulicy w jednym okresie, sklejona z wielu wzmianek (definicja z `LEJEK.md`). Jednostka analizy dla bilansu „remonty a bilet MPK”.
_Nie mylić z_: utrudnieniem.

**Kontrakt** — postępowanie BZP lub umowa. Jeden kontrakt może obejmować kilka ulic i kilka zdarzeń. Termin umowy nie jest terminem zajęcia jezdni.

**Utrudnienie** — wpływ fazy robót na ruch na jednej relacji (ulica, odcinek, kierunek lub wlot) w jednym przedziale dat, np. „al. Politechniki do centrum jednym lewym pasem od 8.11.2026”. Ma dokładnie jeden **typ wpływu**. Opiera się na co najmniej jednej obserwacji. Może wskazywać zdarzenie i kontrakt, ale nie musi.
_Przykład_: skrzyżowanie Politechniki/Wróblewskiego to trzy utrudnienia (jeden pas na Politechniki, zamknięty wlot Wróblewskiego, zakaz lewoskrętu), a nie jedno.

**Typ wpływu** — jak utrudnienie ogranicza ruch: pełne zamknięcie, jeden pas zajęty, przejazd jednym pasem, zwężenie (liczba pasów nieznana), ruch wahadłowy, tylko jeden kierunek, oba kierunki utrzymane, jezdnia tymczasowa, tylko dojazd, nieustalony. „Prace pod ruchem” bez szczegółów = nieustalony.

**Faza** — etap robót z własnymi datami i własną organizacją ruchu. Fazy tej samej roboty nie scalamy.

**Obserwacja** — jedna wersja jednego komunikatu: URL, cytat, data publikacji, data pobrania, skrót treści. Zmieniony komunikat daje nową obserwację; starej nie usuwamy.

**Rok postępowania** — rok numeru BZP (dotychczasowe pole `rok`). Nie jest rokiem robót.
**Rok robót** — rok, z którym przecina się okres robót (`od`–`do`).

## Statusy dat

**Precyzja**: dokładna, przybliżona, miesiąc, rok, nieznana.
**Status**: planowana, zaobserwowana, faktyczna, odwołana, nieznana. Planowany termin nie dowodzi zakończenia.
