# Remonty dróg w Łodzi: mapa + zgłoszenia mieszkańców

Statyczna mapa (MapLibre, bez build stepu) na GitHub Pages. Dane urzędowe: `data/remonty.json`.
Zgłoszenia mieszkańców to **osobna warstwa**: trafiają do Supabase Postgres, przechodzą ręczną moderację i
nie wchodzą do liczników, słupków, KPI ani raportu (to dane niezweryfikowane źródłowo).

## Przepływ

1. Użytkownik klika „Zgłoś remont", potem punkt na mapie (albo „Użyj środka mapy", ścieżka dla klawiatury).
2. Formularz: opis (1–500 zn.), początek (wymagany), koniec (opcjonalny), źródło (opcjonalny link http/https).
3. `POST` na Supabase REST (`fetch`, klucz publishable w nagłówku `apikey`). Rekord dostaje `status = 'pending'`.
4. Moderator zmienia `status` na `approved` w Supabase Dashboard. Mapa pobiera `approved` przy starcie
   (przycisk ⟳ odświeża bez przeładowania). Bez deployu.
5. Zgłoszenie jest widoczne na suwaku dni między `starts_on` a `ends_on` (brak końca = trwa). Treść tylko przez `textContent`.

## Tabela `public.remonty_reports`

| Kolumna | Typ | Uwagi |
|---|---|---|
| id | uuid | `gen_random_uuid()` |
| lat, lng | double precision | CHECK: prostokąt obejmujący Łódź (51.65–51.90, 19.28–19.70) |
| description | text | CHECK: 1–500 znaków po `btrim` |
| starts_on | date | wymagana, 2021–2030 |
| ends_on | date | opcjonalna, ≥ `starts_on` |
| source_url | text | opcjonalny, `^https?://`, ≤ 500 zn. |
| status | text | `pending` (domyślnie) / `approved` / `rejected` |
| created_at | timestamptz | `now()` |

Zabezpieczenia (migracja `supabase/migrations/20261109120000_remonty_reports.sql`):
RLS włączone; `REVOKE ALL` dla `anon`/`authenticated`; `SELECT` wiersze `approved` i `pending` (pending są na mapie wyszarzone, bez linku źródła; `rejected` ukryte; druga migracja `20261109130000_show_pending_reports.sql`);
`INSERT` tylko kolumn `lat, lng, description, starts_on, ends_on, source_url` (kolumnowy GRANT, więc klient nie ustawi
`status`) i tylko z `status = 'pending'`; brak `UPDATE`/`DELETE`.

## Konfiguracja (jednorazowo)

1. Załóż projekt na supabase.com.
2. Zastosuj migrację: SQL Editor → wklej plik z `supabase/migrations/`, albo CLI:
   `npx supabase link --project-ref <ref>` i `npx supabase db push` (z katalogu `remonty-lodz`).
3. W `reports-config.js` wpisz **Project URL** i **publishable key** (`sb_publishable_...`, Settings → API Keys).
   Są publiczne z założenia. **Nigdy** nie wpisuj tu `sb_secret_...` ani `service_role`.
   Dopóki pola są puste, funkcja jest ukryta, a mapa działa jak wcześniej.
4. Commit i push (GitHub Pages). To jedyny deploy; kolejne zgłoszenia go nie wymagają.

## Moderacja

Dashboard → Table Editor → `remonty_reports`. Nowe zgłoszenia mają `pending`. Zmień `status` na `approved`
(pojawi się na mapie) albo `rejected` (zostaje w bazie, niewidoczne). Przy zatwierdzaniu można poprawić opis i daty.

## Testy

`supabase/tests/database/remonty_reports.test.sql` (pgTAP: odczyt approved/pending/rejected, insert pending,
brak ustawiania statusu, brak update/delete, współrzędne, pusty opis, daty, źródło). Uruchomienie: `npx supabase test db`
(wymaga Dockera i `supabase start`). Po stronie przeglądarki sprawdzono ręcznie: wybór punktu, wysyłka, potwierdzenie,
brak wykonania HTML/JS z opisu.

## Limity (w bazie, nie do obejścia z przeglądarki)

Bez linków w opisie; globalnie 180 nowych zgłoszeń na godzinę i 1800 oczekujących; 3 zgłoszenia na minutę na klienta
(skrót IP, przechowywany godzinę, niedostępny publicznie). Migracje `...140000_spam_limits.sql` i `...150000_rate_limits_v2.sql`.

## Ograniczenia antyspamowe

Honeypot i blokada ponownego kliknięcia podczas wysyłki zatrzymują tylko proste boty; klucz publishable nie jest
autoryzacją, więc skrypt może wysyłać bezpośrednio do API. Realną barierą są CHECK-i w bazie i ręczna moderacja
(spam nigdy nie jest publiczny). Gdyby napływ wzrósł: Cloudflare Turnstile + Edge Function z weryfikacją tokenu
(wymaga konta Cloudflare i secret key w Supabase).
