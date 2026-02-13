# Vergleich: Caddy vs. Traefik

Beide sind moderne, in Go geschriebene Webserver und Reverse Proxies, die sich hervorragend für Docker-Umgebungen eignen. Hier ist der Vergleich für deinen Anwendungsfall (Hackerwerkstatt mit Subdomains für Teilnehmer).

## Traefik (Aktuelle Einrichtung)

**Vorteile:**
*   **Docker-Native**: Wurde speziell für Microservices und Container gebaut. Es "hört" automatisch auf den Docker-Socket. Sobald ein Container startet, ist er online.
*   **Industrie-Standard**: Wer Traefik lernt, lernt ein Tool, das in vielen Firmen/Cloud-Setups genutzt wird.
*   **Dashboard**: Ein grafisches Dashboard (auf Port 8080), das zeigt, welche Routen aktiv sind. Das ist super für den Lerneffekt bei den Teilnehmern ("Ah, mein Container wird hier angezeigt!").
*   **Labels**: Die Konfiguration passiert direkt am Container (`labels` im `docker-compose.yml`), nicht in einer zentralen Datei. Das ist dezentral und skaliert gut.

**Nachteile:**
*   **Komplexere Config**: Die YAML-Syntax und die vielen Optionen (Routers, Services, Middlewares) können am Anfang verwirrend sein.
*   **HTTPS Setup**: HTTPS (Let's Encrypt) einzurichten erfordert ein bisschen mehr Konfiguration im `docker-compose.yml` als bei Caddy.

## Caddy

**Vorteile:**
*   **Kinderleichte Config (`Caddyfile`)**: Eine Konfigurationsdatei, die fast wie englischer Text zu lesen ist.
    ```nginx
    hackerwerkstatt.de {
        reverse_proxy app:3000
    }
    ```
*   **"Magic" HTTPS**: Caddy ist berühmt dafür, dass es HTTPS-Zertifikate *vollautomatisch* und standardmäßig aktiviert, ohne dass man (fast) etwas tun muss.
*   **Einfachheit**: Es fühlt sich weniger "technisch" an als Traefik.

**Nachteile:**
*   **Docker Discovery nicht "ab Werk" im Kern**: Das normale Caddy braucht eine feste Config-Datei.
*   *Lösung:* Es gibt eine spezielle Version (**Caddy-Docker-Proxy**), die genau wie Traefik funktioniert (über Labels). Damit hat man die Vorteile von beiden.

## Empfehlung für die Hackerwerkstatt

**Bleib bei Traefik, wenn:**
*   Du den Teilnehmern zeigen willst, wie professionelle Cloud-Infrastruktur funktioniert.
*   Du das Dashboard cool findest, um zu visualisieren, was läuft.
*   Du die Labels-Logik magst (jeder Container bringt seine Config mit).

**Nimm Caddy (mit caddy-docker-proxy), wenn:**
*   Du **sofort und ohne Kopfschmerzen HTTPS** für alle haben willst.
*   Dir Traefik zu kompliziert vorkommt.

### Entscheidung

Soll ich das Setup auf **Caddy (caddy-docker-proxy)** umbauen?
Das würde bedeuten:
1.  Anderes Image im `docker-compose.yml`.
2.  Die Labels an den Services ändern sich leicht (Caddy-Syntax in Labels statt Traefik-Syntax).
3.  HTTPS funktioniert vermutlich "out of the box" noch einen Tick stressfreier.

Wenn dir Traefik bisher "okay" vorkommt, würde ich es dabei belassen, da es sehr robust ist.
