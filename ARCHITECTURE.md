# Sakurazaka46 Birthday Cards Scraper & UI Architecture

This document describes the simple, single-script scraper architecture for extracting member birthday card image URLs from the Sakurazaka46 official site, and the deployment / frontend presentation strategy.

## Logic Flow

```mermaid
flowchart TD
    Start([Start Scraper]) --> Login[Login to Sakurazaka46 Official Site]
    Login --> Verify[Verify Session Cookies / B81 Cookie]
    Verify --> FetchAPI[Fetch Birthday Cards API /s/s46/api/list/birthday_card]
    FetchAPI --> ParseAPI[Parse JSON Response]
    ParseAPI --> Save[Save Results to public/data/birthday-cards.json]
    Save --> End([End Scraper])
```

## Cron Job Deployment Flow

Since Cloudflare Pages is static and does not run cron jobs, and the scraper requires credentials (`SAKURAZAKA_EMAIL`/`SAKURAZAKA_PASSWORD`), running the cron job on the **Homeserver** is the most secure and practical approach. The credentials remain local to the Homeserver.

```mermaid
sequenceDiagram
    participant HS as Homeserver (Cron)
    participant Git as Git Repo (GitHub/Gitea)
    participant CF as Cloudflare Pages

    HS->>Git: git pull (ensure latest codebase)
    HS->>HS: Run fetch-birthday-cards.js (using local env secrets)
    alt Data changed?
        HS->>Git: git commit & push public/data/birthday-cards.json
        Git->>CF: Webhook Trigger Rebuild
        CF->>CF: Build & Serve updated static JSON
    else No changes
        HS->>HS: Do nothing
    end
```

## Key Components

1. **Authentication Loop**
   - Retrieves `SAKURAZAKA_EMAIL` and `SAKURAZAKA_PASSWORD` from environment.
   - Bootstraps by hitting the login/artist pages to obtain `my_webckid`.
   - Submits credentials via a POST request to obtain session cookies (`B81AC560F83BFC8C`).
   - Verifies session validity against a radio diary endpoint.

2. **API Data Extraction**
   - Directly calls the official backend API endpoint `/s/s46/api/list/birthday_card` with authenticated cookies.
   - Parses the JSON response which contains the list of all members, their name, profile photo, and birthday card image source.

3. **Data Serialization**
   - Maps the API data to the required format.
   - Writes the final payload directly to `public/data/birthday-cards.json`.

4. **Frontend Presentation (UI)**
   - Display a responsive, premium grid with interactive filters (generation, name search).
   - Celebrate today's/this month's birthday members at the top.
   - Implement a premium in-page Modal viewer for card preview, download, and original detail page links.
