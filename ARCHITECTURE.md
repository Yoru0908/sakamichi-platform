# Sakurazaka46 & Hinatazaka46 Birthday Cards Scraper & UI Architecture

This document describes the simple, single-script scraper architecture for extracting member birthday card image URLs from both Sakurazaka46 and Hinatazaka46 official sites, and the deployment / frontend presentation strategy.

## Logic Flow

```mermaid
flowchart TD
    Start([Start Scraper]) --> LoginSakura[Login to Sakurazaka46 Official Site]
    LoginSakura --> VerifySakura[Verify Session Cookies / B81 Cookie]
    VerifySakura --> FetchSakuraAPI[Fetch Sakurazaka API /s/s46/api/list/birthday_card]
    FetchSakuraAPI --> FetchHinataAPI[Fetch Hinatazaka API /s/official/api/list/birthday_card]
    FetchHinataAPI --> ParseAndMerge[Parse & Merge JSON Responses]
    ParseAndMerge --> Save[Save Results to public/data/birthday-cards.json]
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

1. **Authentication Loop (Sakurazaka46)**
   - Retrieves `SAKURAZAKA_EMAIL` and `SAKURAZAKA_PASSWORD` from environment.
   - Bootstraps by hitting the login/artist pages to obtain `my_webckid`.
   - Submits credentials via a POST request to obtain session cookies (`B81AC560F83BFC8C`).
   - Verifies session validity against a radio diary endpoint.

2. **API Data Extraction**
   - **Sakurazaka46**: Calls the official backend API endpoint `/s/s46/api/list/birthday_card` with authenticated cookies.
   - **Hinatazaka46**: Directly calls the public API endpoint `/s/official/api/list/birthday_card` (currently does not require session authentication).
   - Extracts member names, IDs, birthday card image URLs, and profile photos.

3. **Data Serialization**
   - Maps the API data to the unified format containing `member`, `memberId`, `cardUrl`, `pageUrl`, `group`, and `month`.
   - Writes the merged and deduplicated payload directly to `public/data/birthday-cards.json`.

4. **Frontend Presentation (UI)**
   - Display a responsive, premium grid with interactive filters (group selection: "全部" / "樱坂46" / "日向坂46", dynamic generation tabs, and name search).
   - Use corrected, verified local database mapping for all active members' birthdays to ensure accuracy.
   - Implement a premium in-page Modal viewer for card preview, download, and original detail page links.

