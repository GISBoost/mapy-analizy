# Kolejka godzin tylko przy przypięciu

Po przypięciu punktu użytkownik sięga do suwaka, więc w tym oknie dociągamy paczki godzin bieżącego wariantu: jedna naraz, zawsze najbliższa godzinie na suwaku, przy remisie najpierw późniejsza. Suwak zmienia etykietę od razu, a wielokąty skaczą dopiero gdy dojdzie paczka tej godziny. Bez przypięcia pobierana jest tylko godzina, na której suwak stanął. Zdjęcie pinezki zatrzymuje kolejkę, bo dekodowanie kolejnych paczek jest na głównym wątku i szarpałoby hover. Zmiana wariantu wyrzuca paczki poprzedniego wariantu. Loader zostaje tylko, gdy na mapie nie ma jeszcze wielokątów.

Odrzucone: równoległe pobieranie całej doby (łącze nie zdąży z najbliższą godziną), trzymanie obu wariantów (drugi blok rzędu 20–75 MB na drucie, po zdekodowaniu więcej) i kontynuacja kolejki po odpięciu.
