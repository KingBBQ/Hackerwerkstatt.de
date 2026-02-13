# Deployment Instructions for Hackerwerkstatt

Follow these steps to deploy the Hackerwerkstatt application and Caddy reverse proxy on your server.

## Prerequisites

Ensure your server has Docker and Docker Compose installed.
If not, you can usually install them with:

```bash
# For Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

## 1. DNS Configuration

Point your domain `hackerwerkstatt.de` AND the wildcard `*.hackerwerkstatt.de` to your server's IP address.
This is critical for subdomains and automatic HTTPS.

## 2. Server Setup

1.  **Clone the repository** to your server:
    ```bash
    git clone <YOUR_REPO_URL> hackerwerkstatt
    cd hackerwerkstatt
    ```

2.  **Create the Docker Network**:
    We use an external network named `web` so Caddy can discover other containers.
    ```bash
    docker network create web
    ```

3.  **Start the Services**:
    ```bash
    docker compose up -d --build
    ```

4.  **Verify**:
    -   Go to `https://hackerwerkstatt.de` -> Should see your Main App (with valid lock icon!).
    -   Go to `https://demo.hackerwerkstatt.de` -> Should see the "Whoami" demo service.

## 3. How Participants Add a Service

Participants can run their own Docker containers and expose them via a subdomain by connecting to the `web` network and adding simple labels.

**Example `docker-compose.yml` for a participant:**

```yaml
version: '3'
services:
  my-project:
    image: nginx:alpine
    networks:
      - web
    labels:
      caddy: coolproject.hackerwerkstatt.de
      caddy.reverse_proxy: "{{upstreams 80}}"

networks:
  web:
    external: true
```

The participant runs `docker compose up -d`, and Caddy automatically:
1.  Detects the container.
2.  Gets an SSL certificate for `coolproject.hackerwerkstatt.de`.
3.  Routes traffic to their container.
