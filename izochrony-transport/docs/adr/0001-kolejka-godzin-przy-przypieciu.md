# Kolejka godzin tylko przy przypięciu

Po przypięciu punktu użytkownik sięga do suwaka, więc w tym oknie dociągamy paczki godzin bieżącego wariantu: jedna naraz, zawsze najbliższa godzinie na suwaku, przy remisie najpierw późniejsza. Suwak zmienia etykietę od razu, a wielokąty skaczą dopiero gdy dojdzie paczka tej godziny. Bez przypięcia pobierana jest tylko godzina, na której suwak stanął. Zdjęcie pinezki zatrzymuje kolejkę. Ściąganie zostawia surowe bajty. Dekodowanie na głównym wątku dotyczy tylko godziny, która jest właśnie rysowana. Dekodowanie całej doby po przypięciu zamrażało suwak na kilka sekund. Zmiana wariantu wyrzuca paczki poprzedniego wariantu. Loader zostaje tylko, gdy na mapie nie ma jeszcze wielokątów.

Odrzucone: równoległe pobieranie całej doby (łącze nie zdąży z najbliższą godziną), trzymanie obu wariantów (drugi blok rzędu 20–75 MB na drucie, po zdekodowaniu więcej) i kontynuacja kolejki po odpięciu.
