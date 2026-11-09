# Instrukcja: podłączenie Supabase do mapy remontów

Czas: ok. 15 minut. Wszystko z przeglądarki, bez instalowania czegokolwiek.

## 1. Załóż projekt

1. Wejdź na https://supabase.com, zaloguj się (np. kontem GitHub), **New project**.
2. Nazwa: np. `gisboost-mapy`. Region: **Central EU (Frankfurt)**.
3. **Database password**: wygeneruj i zapisz w menedżerze haseł. Strona go nie używa, ale jest potrzebny do CLI.
4. Poczekaj 1–2 minuty, aż projekt się utworzy.

## 2. Zastosuj migrację (tworzy tabelę i zabezpieczenia)

1. Menu po lewej: **SQL Editor** → **New query**.
2. Wklej całą zawartość pliku `remonty-lodz/supabase/migrations/20261109120000_remonty_reports.sql`.
3. **Run**. Oczekiwany wynik: `Success. No rows returned`.
   To samo zrób z drugim plikiem `20261109130000_show_pending_reports.sql` (zgłoszenia `pending` stają się widoczne jako wyszarzone znaczniki).
4. Sprawdź: **Table Editor** pokazuje tabelę `remonty_reports`, a **Authentication → Policies** dwie polityki
   („public reads approved", „public submits pending") i wskaźnik, że RLS jest włączone.

Migrację uruchom tylko raz. Drugi raz zgłosi błąd „already exists", bez szkody.

## 3. Skopiuj dwie publiczne wartości

**Project Settings → API Keys** (lub przycisk **Connect** u góry):
- **Project URL**: `https://<ref>.supabase.co`
- **Publishable key**: `sb_publishable_...`

Nie kopiuj `sb_secret_...` ani `service_role`. Nie wklejaj ich nigdzie w repozytorium ani w czacie.

## 4. Wpisz je w repozytorium

W `remonty-lodz/reports-config.js`:

```js
window.REMONTY_REPORTS = { url: "https://<ref>.supabase.co", key: "sb_publishable_..." };
```

Publishable key może być publiczny. Zabezpieczenia robi RLS w bazie, nie ukrywanie klucza.

## 5. Przetestuj lokalnie, zanim opublikujesz

```bash
py -m http.server 8800
```

1. Otwórz http://localhost:8800/remonty-lodz/ , kliknij „Zgłoś remont", wskaż punkt w Łodzi, wypełnij i wyślij.
2. W Supabase **Table Editor → remonty_reports** pojawia się wiersz ze `status = pending`.
3. Kliknij komórkę `status`, zmień na `approved`, zapisz.
4. Na mapie kliknij ⟳ (odśwież zgłoszenia). Różowy znacznik pojawia się w dniach `starts_on`–`ends_on`
   (ustaw suwak dni na datę zgłoszenia albo wybierz widok „Wszystkie").

## 6. Sprawdź, że publiczność nie może za dużo (RLS)

Podstaw swoje wartości. Oczekiwane wyniki w komentarzach.

```bash
# odczyt: tylko zatwierdzone
curl "https://<ref>.supabase.co/rest/v1/remonty_reports?select=id,status" -H "apikey: sb_publishable_..."

# próba wstawienia od razu zatwierdzonego: ma być błąd 42501 (permission denied)
curl -X POST "https://<ref>.supabase.co/rest/v1/remonty_reports" -H "apikey: sb_publishable_..." -H "Content-Type: application/json" -d '{"lat":51.76,"lng":19.46,"description":"x","starts_on":"2026-11-10","status":"approved"}'

# próba usunięcia: ma nie usunąć niczego (błąd 42501)
curl -X DELETE "https://<ref>.supabase.co/rest/v1/remonty_reports?status=eq.approved" -H "apikey: sb_publishable_..."
```

Opcjonalnie testy pgTAP (wymagają Dockera): w katalogu `remonty-lodz` `npx supabase init`, potem `npx supabase start`
i `npx supabase test db`. Plik testów: `supabase/tests/database/remonty_reports.test.sql`.

## 7. Opublikuj

Commit i push `reports-config.js` (oraz reszty zmian) na gałąź, z której działa GitHub Pages. To jedyny deploy;
kolejne zgłoszenia i zatwierdzenia nie wymagają żadnego pushu.

## 8. Na co uważać

- **Darmowy plan usypia projekt po ok. tygodniu bez ruchu.** Wtedy mapa nadal działa, ale zgłoszeń nie pobierze
  ani nie wyśle (formularz pokaże błąd). Wejdź w Dashboard i kliknij **Restore project**, albo rozważ plan płatny.
- **Moderacja** to ręczna zmiana `status` w Table Editor: `approved` (publiczne) lub `rejected` (ukryte). Warto zaglądać
  regularnie. Zgłoszenia `pending` nie wygasają.
- **Spam**: honeypot zatrzymuje tylko proste boty. Spam nigdy nie jest publiczny, bo wymaga Twojej akceptacji.
  Gdyby napływ był duży, dołóż Cloudflare Turnstile (osobny krok, opis w README).
- Chcesz wyłączyć funkcję: wyczyść `url` i `key` w `reports-config.js`.
