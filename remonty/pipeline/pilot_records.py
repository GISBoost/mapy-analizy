"""Pilot E3: records written by hand (model reading) from the selected pages; see work/pilot/selection.md."""
import json
from pathlib import Path
W = Path(__file__).resolve().parent.parent / "work" / "pilot"
sel = json.load(open(W / "selected.json"))
ID = {t: h for h, t, _ in sel}
KEYS = "ulica od do typ L_rob_m szer_m A_m2 pasy data_start data_koniec status wartosc_zl cytat pewnosc".split()
out = []


def R(typ_doc, page, cytat, **kw):
    r = dict(doc_id=ID[typ_doc], page=page)
    for k in KEYS:
        r[k] = None
    r.update(kw)
    r["cytat"] = cytat
    out.append(r)


def B(typ_doc, powod):
    out.append(dict(doc_id=ID[typ_doc], brak_rekordow=True, powod=powod))


P = "plan_postepowan"   # plan 2023 (year from file name); text gives quarter only


def plan(page, cytat, nazwa, **kw):
    kw.setdefault("status", "plan")
    kw.setdefault("pewnosc", "srednia")
    R(P, page, cytat, cytat_nazwa=nazwa, rok_planu=2023, **kw)


plan(3, "1.1.6 NOWY CHODNIK, MIEJSCA Zamówienie udzielane jest w trybie 472 782,25 PLN III kwartał Zamówienie jest",
     ["PARKINGOWE I REWITALIZACJA", "ZNISZCZONYCH TRAWNIKÓW NA", "OSSOWSKIEGO - ZIELONE KOZINY"],
     ulica="Ossowskiego", typ="budowa", wartosc_zl=472782.25, termin_tekst="III kwartał",
     uwagi="nowy chodnik + miejsca parkingowe + trawniki w jednej pozycji", pewnosc="wysoka")
plan(7, "1.1.21 Remont chodników z podziałem na 5 Zamówienie udzielane jest w trybie 2 634 030,00 PLN Zamówienie jest",
     ["części"], typ="remont", wartosc_zl=2634030.00, termin_tekst="I kwartał", uwagi="5 części, brak ulic w pozycji")
for n, rej in (("1.1.22", "Bałut"), ("1.1.23", "Górnej")):
    plan(7, f"{n} Remont chodników i inne prace Zamówienie udzielane jest w trybie 1 000 000,00 PLN II kwartał Zamówienie jest",
         ["naprawczo-remontowe na terenach", "będących we władaniu Wydziału", f"Gospodarki Komunalnej (rejon {rej})"],
         typ="remont", wartosc_zl=1000000.00, termin_tekst="II kwartał", uwagi=f"rejon {rej} zamiast ulicy")
plan(7, "1.1.24 Remont chodników i inne prace Zamówienie udzielane jest w trybie 375 000,00 PLN II kwartał Zamówienie jest",
     ["Polesia, Śródmieścia, Widzewa)"], typ="remont", wartosc_zl=375000.00, termin_tekst="II kwartał",
     uwagi="rejon Polesia, Śródmieścia, Widzewa zamiast ulicy")
plan(11, "1.1.40 Utwardzenie ścieżki przecinającej Zamówienie udzielane jest w trybie 282 440,34 PLN III kwartał Zamówienie jest",
     ["Park im. Marsz. J. Piłsudskiego w", "kwartale ulic: Krakowska, Biegunowa,", "Wieczność i Siewna w Łodzi"],
     typ="inne", wartosc_zl=282440.34, termin_tekst="III kwartał",
     uwagi="ścieżka w parku, 4 ulice jako okolica; granica robót drogowych", pewnosc="niska")
plan(14, "1.1.54 Budowa drogi wewnętrznej wraz z Zamówienie udzielane jest w trybie 450 000,00 PLN IV kwartał Zamówienie jest",
     ["chodnikiem przy ul. Ciołkowskiego 7 w", "Łodzi oraz przebudowa dojazdu z", "ulicy Ciołkowskiego"],
     ulica="Ciołkowskiego", typ="budowa", wartosc_zl=450000.00, termin_tekst="IV kwartał",
     uwagi="dwie roboty w pozycji: budowa drogi wewnętrznej z chodnikiem + przebudowa dojazdu")
plan(14, "1.1.55 Remont wybranych ulic na terenie Zamówienie udzielane jest w trybie 540 000,00 PLN I kwartał Zamówienie jest",
     ["Miasta oraz stabilizacja dróg", "gruntowych z podziałem na części"],
     typ="remont", wartosc_zl=540000.00, termin_tekst="I kwartał", uwagi="remont ulic + stabilizacja dróg gruntowych (dwa typy), bez nazw ulic")
plan(15, "1.1.56 Naprawy: utrzymanie nawierzchni Zamówienie udzielane jest w trybie 13 819 884,64 PLN III kwartał Zamówienie jest",
     ["nieulepszonych w latach 2023-2024", "(WPF)"], typ="gruntowka", wartosc_zl=13819884.64,
     termin_tekst="III kwartał; lata 2023-2024 (WPF)", uwagi="nawierzchnie nieulepszone; wieloletnie")
plan(15, "1.1.57 Modernizacja dróg na terenie miasta z Zamówienie udzielane jest w trybie 5 777 842,50 PLN I kwartał Zamówienie jest",
     ["podziałem na części"], typ="inne", wartosc_zl=5777842.50, termin_tekst="I kwartał",
     uwagi="'modernizacja' nie ma odpowiednika w słowniku typ", pewnosc="niska")
plan(15, "1.1.60 Remont chodnika przy ul. Felińskiego Zamówienie udzielane jest w trybie 94 750,00 PLN III kwartał Zamówienie jest",
     ["3"], ulica="Felińskiego", typ="remont", wartosc_zl=94750.00, termin_tekst="III kwartał", pewnosc="wysoka",
     uwagi="numer 3 w osobnej linii (ul. Felińskiego 3)")
plan(16, "1.1.61 Remont chodnika pomiędzy ul. Zamówienie udzielane jest w trybie 56 470,00 PLN Zamówienie jest",
     ["Ciołkowskiego a ul. Paderewskiego"], od="ul. Ciołkowskiego", do="ul. Paderewskiego", typ="remont",
     wartosc_zl=56470.00, termin_tekst="III kwartał", uwagi="chodnik pomiędzy dwiema ulicami, nie wzdłuż ulicy: ulica=null")
plan(19, "1.1.74 Remont infrastruktury ul. Skorupki - Zamówienie udzielane jest w trybie 898 734,00 PLN Zamówienie jest",
     ["zaprojektuj i wybuduj"], ulica="Skorupki", typ="remont", wartosc_zl=898734.00, termin_tekst="I kwartał",
     uwagi="zaprojektuj i wybuduj", pewnosc="wysoka")
plan(21, "1.1.83 Modernizacja dróg na terenie miasta z Zamówienie udzielane jest w trybie 1 422 157,50 PLN Zamówienie jest",
     ["podziałem na części - Remont", "infrastruktury drogowej ul. Łodzianka", "w Łodzi na odcinku od posesji nr 5C w", "kierunku ul. Brylantowej"],
     ulica="Łodzianka", od="posesja nr 5C", do="ul. Brylantowej", typ="remont", wartosc_zl=1422157.50, termin_tekst="III kwartał",
     uwagi="pozycja 1.1.84 ma identyczną nazwę i wartość (duplikat lub aktualizacja planu?)", pewnosc="wysoka")
plan(21, "1.1.84 Modernizacja dróg na terenie miasta z Zamówienie udzielane jest w trybie 1 422 157,50 PLN II kwartal Zamówienie jest",
     ["podziałem na części - Remont", "infrastruktury drogowej ul. Łodzianka", "w Łodzi na odcinku od posesji nr 5C w", "kierunku ul. Brylantowej"],
     ulica="Łodzianka", od="posesja nr 5C", do="ul. Brylantowej", typ="remont", wartosc_zl=1422157.50, termin_tekst="II kwartał",
     uwagi="duplikat pozycji 1.1.83 (ta sama nazwa i wartość)", pewnosc="wysoka")
plan(13, "1.1.48 Naprawa odwodnienia w pasie Zamówienie udzielane jest w trybie 600 000,00 PLN Zamówienie jest",
     ["drogowym ul. Sarniej w rejonie", "skrzyżowania z ul. Piłsudskiego"], ulica="Sarnia", typ="inne", wartosc_zl=600000.00,
     termin_tekst="I kwartał", uwagi="odwodnienie w pasie drogowym, nie nawierzchnia", pewnosc="niska")
plan(13, "1.1.49 Naprawa odwodnienia w pasie Zamówienie udzielane jest w trybie 600 000,00 PLN I kwartał Zamówienie jest",
     ["drogowym Al. Wyszyńskiego jezdnia", "północna w rejonie skrzyżowania z ul.", "Rajdową"], ulica="Al. Wyszyńskiego",
     typ="inne", wartosc_zl=600000.00, termin_tekst="I kwartał",
     uwagi="odwodnienie, jezdnia północna, w rejonie skrzyżowania z ul. Rajdową", pewnosc="niska")

# ogloszenie_o_udzieleniu (BZP 2021): tram track repair
R("ogloszenie_o_udzieleniu", 1, "Długość torowiska na przedmiotowym odcinku wynosi ok 372 mtp.",
  ulica="Łagiewnicka", od="ul. Rysowniczej", do="ul. Warszawskiej", typ="remont", L_rob_m=372, status="przetarg",
  wartosc_zl=1916775.30, pewnosc="srednia",
  cytat_extra=["6.2.) Cena lub koszt oferty z najniższą ceną lub kosztem: 1916775,30 PLN"],
  uwagi="naprawa nawierzchni torowiska tramwajowego (372 mtp = metry toru, nie metry jezdni); ogłoszenie o wyniku z 2021-08-26; jedna oferta (min = max)")
# swz_opz: same works, 2020 repair programme
R("swz_opz", 4, "Długość torowiska na opracowywanym zakresie wynosi 372 mtp.",
  ulica="Łagiewnicka", od="ul. Rysowniczej", do="ul. Warszawskiej", typ="remont", L_rob_m=372, status="plan", pewnosc="srednia",
  uwagi="program naprawczy torowiska (SIERPIEŃ 2020); te same roboty co w ogłoszeniu o wyniku 2021; frezowanie pasa min. 2,00 m od opornika to nie szerokość jezdni, szer_m=null")
# ogloszenie_o_wykonaniu (BZP 2022): part 1, two streets, one contract value
for ul, z in (("Wojciecha Gersona", 1), ("Gabrieli Zapolskiej", 2)):
    R("ogloszenie_o_wykonaniu", 1, f"Zadanie {z} - Remont nawierzchni chodnika na ul. {ul}",
      ulica=ul, typ="remont", status="zrealizowane", wartosc_zl=1114115.55, pewnosc="srednia",
      cytat_extra=["4.4.) Wartość umowy: 1114115,55 PLN"],
      uwagi="wartość umowy dotyczy całej części nr 1 (2 ulice), nie tej ulicy; umowa zawarta 2021-08-18, okres realizacji 70 dni, wykonana należycie")
# ogloszenie_o_zamowieniu (TED 2021): 7 parts
T = [(2, "Remont nawierzchni chodników na ul. Wojciecha Gersona oraz ul. Gabrieli Zapolskiej", ["Wojciecha Gersona", "Gabrieli Zapolskiej"], 1),
     (4, "Remont nawierzchni chodnika na ul. Pienistej", ["Pienista"], 2),
     (6, "Remont nawierzchni ulicy Okólnej", ["Okólna"], 3),
     (8, "Utwardzenie pobocza ul. Feliksińskiej destruktem oraz remont nawierzchni ulicy Pomorskiej", ["Feliksińska", "Pomorska"], 4),
     (10, "Remont nawierzchni ulicy Pszczelnej", ["Pszczelna"], 5),
     (11, "Remont nawierzchni ulicy Cedry", ["Cedry"], 6),
     (13, "Remont nawierzchni ulicy Jarosława Haška", ["Jarosława Haška"], 7)]
for pg, c, uls, part in T:
    for ul in uls:
        R("ogloszenie_o_zamowieniu", pg, c, ulica=ul, typ="gruntowka" if ul == "Feliksińska" else "remont",
          status="przetarg", pewnosc="wysoka",
          uwagi=f"część nr {part}; ogłoszenie TED 2021/S 077-195944; wartość szacunkowa pusta, wadium to nie wartość"
                + ("; utwardzenie pobocza destruktem (gruntowka/inne)" if ul == "Feliksińska" else ""))
# korespondencja_zdit: petition
R("korespondencja_zdit", 1,
  "Wykonanie nawierzchni asfaltowej na odcinku ul. Bratkowej od ul. Mileszki (posiadającej nawierzchnię asfaltową) do posesji nr 17, o długości ok. 300 metrów.",
  ulica="Bratkowa", od="ul. Mileszki", do="posesja nr 17", typ="budowa", L_rob_m=300, status=None, pewnosc="srednia",
  uwagi="petycja mieszkańca (2026-04-20): postulat, nie plan ani przetarg; status=null (brak wartości 'postulat' w słowniku); ok. 300 m")
# no-record documents
B("dokumentacja_projektowa", "projekt techniczny konstrukcji ścian oporowych rampy dla niepełnosprawnych (ul. Skalna, działka 217/97); trafienia: 'gruntow' (warunki gruntowe) i adres 'UL. SKALNA' w nagłówku; nie jest robotą drogową")
B("umowa", "wzór umowy na montaż konstrukcji wysięgnikowej sygnalizacji świetlnej (skrzyżowanie Drewnowska/Kasprzaka); to nie robota nawierzchniowa")
B("zapytanie_ofertowe", "zapytanie na nadzór inwestorski nad utwardzeniem terenu przy ul. Skalnej (działka 217/97, miejsca odbioru odpadów, ciąg pieszy); teren, nie droga; brak liczb o robocie")
B("nieruchomosci_ZNN", "przetargi na sprzedaż nieruchomości; trafienia z 'przebudowa zjazdu/sieci', 'remont' sieci i ulic jako adresów. Jedyna wzmianka bliska robót: opinia ZDiT, że nabywca musi przebudować ul. Kątną (szerokość i nośność jezdni) (p11): warunek wobec inwestora, bez liczb. Fałszywe trafienia")
with open(W / "records.jsonl", "w", encoding="utf-8") as f:
    for r in out:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
print(len(out), "lines")
