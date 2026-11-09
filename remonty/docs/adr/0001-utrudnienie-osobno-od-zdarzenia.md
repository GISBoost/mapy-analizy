# 0001. Utrudnienie jako osobny byt, linkowany, nigdy scalany ze zdarzeniem

Data: 2026-11-09. Status: przyjęta.

## Kontekst
Mapa remontów opiera się na kontraktach (BZP/plan) sklejanych w zdarzenia (odcinek + okres, `LEJEK.md`). Częściowe zajęcia jezdni (jeden pas, wahadło, jeden kierunek) opisują tylko komunikaty miejskie (lodz.pl/remonty). Jeden komunikat może mieć kilka relacji o różnym wpływie, np. skrzyżowanie Politechniki/Wróblewskiego. Do tego granice komunikatów nie pokrywają się z granicami kontraktów.

## Decyzja
Wprowadzamy **utrudnienie**: jedna relacja, jeden typ wpływu, jeden przedział dat, oparte na obserwacjach z cytatem. Z kontraktem lub zdarzeniem łączy je tylko link (`auto` albo `manual`). Nigdy nie scalamy rekordów, nie rozszerzamy zdarzenia o pola ruchu, a bilans „remonty a bilet MPK” liczymy bez utrudnień.

## Rozważane opcje
- Dodać `traffic_impact` do rekordu kontraktu. Odrzucone: jeden kontrakt ma wiele relacji i faz, więc pole wymusiłoby uśrednianie.
- Rozszerzyć „zdarzenie” LEJKA. Odrzucone: zmieniłoby jednostkę analizy opublikowanego raportu i jego liczby.

## Konsekwencje
Dwie warstwy na mapie i dwie listy w `remonty.json`. Powiązanie może być błędne (link `auto`, pewność `low`), ale nie psuje żadnej z warstw. Dzięki temu raport bilansu jest odporny na nowe źródło.
