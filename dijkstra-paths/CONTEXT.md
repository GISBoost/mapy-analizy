# Odcinki Łodzi

Strona, na której z jednego miejsca widać, jak daleko da się dojechać komunikacją miejską po prawdziwych odcinkach.

## Language

**Heks**:
Komórka 250 m, z której liczony jest dojazd. Na mapie widać jej obrys.
_Avoid_: kafelek, strefa, obszar

**Podgląd**:
Obraz odcinków z heksa pod kursorem, zanim cokolwiek jest przypięte. Próg ustawia suwak; po zejściu z miasta wraca do 30 minut.
_Avoid_: hover, najechanie

**Przypięcie**:
Wybrany heks, bez którego nie ma inspekcji odcinka. Widać go po znaczniku na środku. Odtwarzanie rusza raz od zera do 60 minut, na 4×.
_Avoid_: pin, zaznaczenie

**Inspekcja**:
Kliknięty, widoczny odcinek po przypięciu. Pokazuje numer linii tego last-hopu, rodzaj i minutę do jego końca. To nie jest łańcuch przesiadek od heksa.
_Avoid_: trasa, itinerarium, RAPTOR

**Odcinek**:
Kawałek przebiegu między kolejnymi przystankami. To on się zapala.
_Avoid_: linia, kreska, segment

**Linia**:
Cała trasa jednego tramwaju albo autobusu. Ta strona jej nie zapala w całości. Zjazdy `R*`, F/G/H/W, `T` i przewóz pracowników nie wchodzą na mapę. Zastępcze `Z*` zostają.
_Avoid_: kurs, trasa

**Okno odjazdu**:
Przedział godzin, z którego bierze się mediana dojazdu: 7:00–9:00 albo 14:00–18:00. Zmiana okna nie rusza suwaka.
_Avoid_: scenariusz, pora dnia
