import json, os, collections, subprocess
from pathlib import Path
W = Path(__file__).resolve().parent.parent / "work" / "pilot"
sel = json.load(open(W / "selected.json"))
recs = [json.loads(l) for l in open(W / "records.jsonl", encoding="utf-8")]
ok = [r for r in recs if not r.get("brak_rekordow")]
cnt = collections.Counter(r["doc_id"] for r in ok)
F = "ulica od do typ L_rob_m szer_m A_m2 pasy data_start data_koniec status wartosc_zl pewnosc".split()
chk = subprocess.run(["py", "-I", "-X", "utf8", str(Path(__file__).parent / "pilot_check.py")], capture_output=True, text=True, encoding="utf-8")
secs = os.path.getmtime(W / "records.jsonl") - os.path.getmtime(W / "selection.md")
pages = sum(len(p) for _, _, p in sel)
L = ["# Raport pilota E3 (10 dokumentów)", "", "## Dokumenty", "", "| typ | doc_id | strony czytane | rekordów |", "|---|---|---|---|"]
for h, t, p in sel:
    n = cnt.get(h, 0)
    L.append(f"| {t} | {h[:10]} | {len(p)} | {n if n else '0 (brak_rekordow)'} |")
L += [f"| **razem** | | {pages} | {len(ok)} |", "", "## Odsetek null w polach (n = %d rekordów)" % len(ok), "", "| pole | null |", "|---|---|"]
for k in F:
    z = sum(1 for r in ok if r.get(k) is None)
    L.append(f"| {k} | {z}/{len(ok)} ({100*z//len(ok)}%) |")
L += ["", "Pola dodatkowe użyte w pilocie: cytat_nazwa (lista fragmentów), cytat_extra (lista), termin_tekst, rok_planu, uwagi.", "",
      "## Problemy schematu", "",
      "1. **Cytat nie mieści wszystkich pól.** W tabelach planów (pdftotext -layout) nazwa pozycji i wartość leżą w różnych liniach, a w ogłoszeniach BZP długość i cena są w różnych sekcjach. Jeden `cytat` nie zawiera ulicy i liczby. Obejście: `cytat` (linia z liczbą) + `cytat_nazwa`/`cytat_extra` jako listy fragmentów, każdy sprawdzany osobno. Do schematu: `cytaty: [..]`.",
      "2. **Brak roku robót w planach.** Plan podaje tylko kwartał („III kwartał”), rok jest tylko w nazwie pliku. `data_start`/`data_koniec` zawsze null. Do schematu: `rok_planu`, `kwartal`, `termin_tekst`.",
      "3. **Obszar zamiast ulicy.** „rejon Bałut”, „z podziałem na 5 części”, „remont wybranych ulic”: pozycja bez ulicy (9 z 31 rekordów ma ulica=null). Potrzebne `obszar` albo `ulica=null` jako stan prawidłowy.",
      "4. **Wiele ulic w jednej pozycji i wspólna wartość.** Część 1 (Gersona + Zapolskiej) ma jedną wartość umowy. Rozbiłem na 2 rekordy z tą samą wartością, co przy sumowaniu zdubluje kwotę. Potrzebne `pozycja_id` i wartość na poziomie pozycji, nie rekordu.",
      "5. **Wiele typów w jednej pozycji** (budowa drogi + przebudowa dojazdu; remont ulic + stabilizacja dróg gruntowych). `typ` jedna wartość. Słownik nie zna „modernizacja”, „utwardzenie”, „odwodnienie”, „torowisko”.",
      "6. **Brak statusu dla postulatu** (petycja o ul. Bratkowa): `status=null`. Dodać `postulat`.",
      "7. **Długość w innych miarach** (372 mtp = metry toru) i szerokość niezwiązana z jezdnią (pas frezowania 2,00 m). Potrzebne `jednostka`.",
      "8. **Duplikaty w obrębie dokumentu** (1.1.83 i 1.1.84 z identyczną nazwą i wartością) i między dokumentami (torowisko Łagiewnicka: SWZ 2020 i wynik 2021). Scalanie w E4 musi to obsłużyć; ekstrakcja nie wie, czy to to samo zdarzenie.",
      "9. **Wartość szacunkowa vs wadium vs cena oferty vs wartość umowy** to cztery różne kwoty. `wartosc_zl` potrzebuje `rodzaj_wartosci`.",
      "10. **Granica „roboty drogowej”**: tory tramwajowe, chodniki w parku, odwodnienie w pasie drogowym. Zapisałem z pewnością niska/srednia; potrzebna decyzja Michała.", "",
      "## Dokumenty bez rekordów", "",
      "- dokumentacja_projektowa (Skalna): konstrukcja ścian oporowych rampy; trafienia z „gruntowy” (warunki gruntowe) i adresu w nagłówku. Fałszywe trafienie.",
      "- umowa: montaż sygnalizacji świetlnej, nie nawierzchnia.",
      "- zapytanie_ofertowe: nadzór nad utwardzeniem terenu (działka), nie drogą.",
      "- nieruchomosci_ZNN: **fałszywe trafienia** (przebudowa zjazdu/sieci, adresy). Jedna warunkowa wzmianka (nabywca ma przebudować ul. Kątną, bez liczb), niezapisana jako rekord.",
      "", "## Wniosek dla E2", "",
      "Słowa kluczowe dają kandydatów, ale trafność stron różni się mocno według typu: plan_postepowan, ogloszenie_o_zamowieniu/wykonaniu/udzieleniu dają rekordy, a dokumentacja konstrukcyjna, umowa, zapytanie i ZNN dają 0. Pilot to 10 dokumentów, więc nie ma z tego precyzji, tylko lista typowych pułapek.", "",
      "## Self-check", "", "```", chk.stdout.strip(), "```", "",
      "Sprawdzane: każdy fragment cytatu (cytat, cytat_extra, cytat_nazwa) występuje w tekście strony po normalizacji białych znaków; cytat ≤300 znaków; liczby z L/szer/A/wartość występują w cytat+cytat_extra. `A_wyliczone` nie użyto (żaden rekord nie ma L i szer jednocześnie).", "",
      "## Czas i zakres", "",
      f"- Przeczytane strony: {pages} (wg selection.md; kilka tylko we fragmentach przez grep).",
      f"- Czas od zapisu selection.md do zapisu records.jsonl: {int(secs//60)} min (zawiera czytanie, pisanie rekordów i narzędzia; to nie czas modelu).",
      "- Rekordy wpisane ręcznie przez model (pipeline/pilot_records.py), bez agentów."]
(W / "pilot_report.md").write_text("\n".join(L) + "\n", encoding="utf-8")
print("\n".join(L[:34]))
